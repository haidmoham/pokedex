// Compatibility for the HOME reconstruction's Three-specific scene semantics.
// Call only after the source GLB and any extra textures have been hash-checked.
// The returned scene needs its own Three renderer with a stencil buffer; core
// glTF and <model-viewer> do not implement these extras.

function validVisibility(value, duration) {
  const times = value?.times, values = value?.values;
  return Array.isArray(times) && Array.isArray(values) && times.length > 0 && times.length === values.length &&
    times.every((time, index) => Number.isFinite(time) && time >= 0 && time <= duration + 1e-5 &&
      (!index || time > times[index - 1])) && values.every(item => typeof item === 'boolean');
}

/** Inspect parsed GLB JSON before choosing the viewer. */
export function inspectHomeEffects(json, requiredLayerMaterials = []) {
  const materials = json?.materials ?? [];
  const nodes = json?.nodes ?? [];
  const layeredMaterialNames = [...new Set([
    ...requiredLayerMaterials,
    ...materials.filter(material => material.extras?.homeLayerUv ||
      material.extras?.homeSourceTextures?.layer || material.extras?.homeSourceTextures?.emissionMask)
      .map(material => material.name),
  ])];
  const effects = {
    stencil: materials.some(material => material.extras?.homeStencil !== undefined),
    visibility: nodes.some(node => node.extras?.homeVisibility !== undefined),
    additive: materials.some(material => material.extras?.homeBlend !== undefined),
    layeredMaterialNames,
  };
  return { ...effects, needsCustomRenderer: effects.stencil || effects.visibility || effects.additive || layeredMaterialNames.length > 0 };
}

const preparedScenes = new WeakSet();

/** The ordinary model-viewer context does not request a stencil buffer. */
export function createHomeRenderer(THREE, parameters) {
  if (!parameters?.canvas) throw new Error('HOME canvas required');
  const renderer = new THREE.WebGLRenderer({ ...parameters, stencil: true });
  if (renderer.getContext().getContextAttributes()?.stencil !== true) {
    renderer.dispose();
    renderer.forceContextLoss?.();
    throw new Error('HOME stencil buffer unavailable');
  }
  return renderer;
}

function shaderLayer(material, base, layer, emissionMask, composite, reviewLayerInterpolation) {
  // The source's base and layer maps must be distinct, pinned textures.
  // Strict mode keeps the earlier Atlas alpha-over preview. Protected review
  // uses the source LERP mode, layer alpha and static over-lerp value as a
  // bounded visual interpolation. Neither recovers the original Unity shader.
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.map = base;
  // Atlas bakes emission from the same UV-mismatched composite. Keeping its
  // emissiveMap would reintroduce the bad UV0 bake over the corrected color.
  if (emissionMask) material.emissiveMap = null;
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    base.updateMatrix();
    if (layer) {
      layer.updateMatrix();
      shader.uniforms.homeLayerMap = { value: layer };
      shader.uniforms.homeLayerTransform = { value: layer.matrix };
      if (reviewLayerInterpolation) shader.uniforms.homeLayerOverLerp = { value: composite.layerOverLerpValue };
    }
    if (emissionMask) {
      emissionMask.updateMatrix();
      shader.uniforms.homeEmissionMask = { value: emissionMask };
      shader.uniforms.homeEmissionTransform = { value: emissionMask.matrix };
    }
    const vertexHeader = '#include <uv_pars_vertex>';
    const vertexUv = '#include <uv_vertex>';
    const fragmentHeader = '#include <map_pars_fragment>';
    const fragmentMap = '#include <map_fragment>';
    if (![vertexHeader, vertexUv].every(part => shader.vertexShader.includes(part)) ||
      ![fragmentHeader, fragmentMap].every(part => shader.fragmentShader.includes(part))) {
      throw new Error('Unsupported Three shader version for HOME layered UV');
    }
    const layerHeader = layer ? '\nuniform mat3 homeLayerTransform;\nvarying vec2 vHomeLayerUv;' : '';
    const layerUv = layer ? `\nvHomeLayerUv = (homeLayerTransform * vec3(${layer.channel === 1 ? 'uv1' : 'uv'}, 1.0)).xy;` : '';
    const emissionHeader = emissionMask ? '\nuniform mat3 homeEmissionTransform;\nvarying vec2 vHomeEmissionUv;' : '';
    const emissionUv = emissionMask ? `\nvHomeEmissionUv = (homeEmissionTransform * vec3(${emissionMask.channel === 1 ? 'uv1' : 'uv'}, 1.0)).xy;` : '';
    const needsUv1 = base.channel === 1 || layer?.channel === 1 || emissionMask?.channel === 1;
    shader.vertexShader = shader.vertexShader
      .replace(vertexHeader, `${vertexHeader}${needsUv1 ? '\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif' : ''}${layerHeader}${emissionHeader}`)
      .replace(vertexUv, `${vertexUv}${layerUv}${emissionUv}`);
    if (layer) shader.fragmentShader = shader.fragmentShader
      .replace(fragmentHeader, `${fragmentHeader}\nuniform sampler2D homeLayerMap;\nvarying vec2 vHomeLayerUv;${reviewLayerInterpolation ? '\nuniform float homeLayerOverLerp;' : ''}`)
      .replace(fragmentMap, reviewLayerInterpolation ? `#ifdef USE_MAP
  vec4 homeBase = texture2D(map, vMapUv);
  vec4 homeLayer = texture2D(homeLayerMap, vHomeLayerUv);
  // Protected visual review: LERP mode, layer alpha as mask, bounded source weight.
  float homeLayerWeight = clamp(homeLayer.a * clamp(homeLayerOverLerp, 0.0, 1.0), 0.0, 1.0);
  vec4 homeComposite = vec4(
    mix(homeBase.rgb, homeLayer.rgb, homeLayerWeight),
    homeBase.a + homeLayerWeight * (1.0 - homeBase.a)
  );
  diffuseColor *= homeComposite;
#endif` : `#ifdef USE_MAP
  vec4 homeBase = texture2D(map, vMapUv);
  vec4 homeLayer = texture2D(homeLayerMap, vHomeLayerUv);
  vec4 homeComposite = vec4(
    homeBase.rgb * homeBase.a + homeLayer.rgb * (1.0 - homeBase.a),
    homeBase.a + homeLayer.a * (1.0 - homeBase.a)
  );
  diffuseColor *= homeComposite;
#endif`);
    else if (emissionMask) shader.fragmentShader = shader.fragmentShader.replace(fragmentMap,
      `${fragmentMap}\nvec4 homeComposite = texture2D(map, vMapUv);`);
    if (emissionMask) {
      const chunk = '#include <emissivemap_fragment>';
      if (!shader.fragmentShader.includes(chunk)) throw new Error('Unsupported Three emissive shader version for HOME layered UV');
      shader.fragmentShader = shader.fragmentShader
        .replace(fragmentHeader, `${fragmentHeader}\nuniform sampler2D homeEmissionMask;\nvarying vec2 vHomeEmissionUv;`)
        .replace(chunk, `totalEmissiveRadiance *= homeComposite.rgb * texture2D(homeEmissionMask, vHomeEmissionUv).r;`);
    }
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|home-source-material-v4-${base.channel}-${layer?.channel ?? 'none'}-${emissionMask?.channel ?? 'none'}-${reviewLayerInterpolation ? `review-${composite.layerOverLerpValue}` : 'strict'}`;
  material.needsUpdate = true;
}

const REVIEW_COMPOSITE_KEYS = ['baseUv', 'equation', 'layerBlendMode', 'layerCalcMulti',
  'layerOverLerpValue', 'layerUv'];

function classifyReviewComposite(composite) {
  if (!composite || Object.keys(composite).sort().join('|') !== REVIEW_COMPOSITE_KEYS.join('|') ||
    composite.equation !== 'atlas-alpha-over-review' ||
    ![0, 1].includes(composite.baseUv) || ![0, 1].includes(composite.layerUv) ||
    ![0, 1].includes(composite.layerCalcMulti) ||
    ![0, 1, 1.5].includes(composite.layerOverLerpValue) || composite.layerBlendMode !== 0) return null;
  return composite.layerCalcMulti === 0 && composite.layerOverLerpValue === 1;
}

/**
 * Apply source-authored HOME effects to a decoded Three GLTF, all-or-nothing.
 *
 * `layeredMaterials` contains preloaded original base/layer THREE.Textures by
 * exact material name. Configure color space, UV transforms, wrapping and
 * flipY from the pinned source manifest before passing them. The current
 * composite is an Atlas-style review approximation, never a claim of exact
 * original Unity shader behavior. The derived GLB
 * should mark each mismatched material with `extras.homeLayerUv =
 * {base:0|1,layer:0|1}`; `requiredLayerMaterials` can supplement that list from a
 * hash-bound catalog. Never infer a match from a species or material prefix.
 *
 * The caller owns GLTFLoader, renderer, camera, playback and disposal. Return
 * the selected native clip and mixer for the caller's playback controls.
 */
export function prepareHomeEffects(gltf, THREE, { layeredMaterials = {}, requiredLayerMaterials = [],
  allowReviewLayerApproximation = false } = {}) {
  if (typeof allowReviewLayerApproximation !== 'boolean') throw new Error('Invalid HOME review option');
  if (!gltf?.scene?.traverse || !Array.isArray(gltf.animations) || !THREE?.BooleanKeyframeTrack || !THREE?.AnimationMixer) {
    throw new Error('Decoded Three GLTF and runtime required');
  }
  if (preparedScenes.has(gltf.scene)) throw new Error('HOME effects already prepared on this scene');
  const clips = gltf.animations.filter(clip => clip.name === 'HOME Idle');
  if (clips.length !== 1) throw new Error('Expected one native HOME Idle');
  const clip = clips[0];
  const sourceAnimation = gltf.parser?.json?.animations?.filter(animation => animation.name === 'HOME Idle');
  if (sourceAnimation?.length !== 1) throw new Error('Missing exact HOME Idle source metadata');
  const duration = sourceAnimation[0].extras?.homeDuration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > clip.duration + 1e-5) throw new Error('Invalid HOME loop duration');

  const meshes = [], visibility = [], layerNames = new Set(requiredLayerMaterials);
  const stencilRoles = new Map();
  gltf.scene.traverse(object => {
    if (object.userData?.homeVisibility !== undefined) visibility.push(object);
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) meshes.push({ mesh: object, material });
  });
  for (const object of visibility) if (!validVisibility(object.userData.homeVisibility, duration)) {
    throw new Error(`Invalid HOME visibility keys: ${object.name}`);
  }
  if (layerNames.size > 64 || [...layerNames].some(name => typeof name !== 'string' || !name)) throw new Error('Invalid HOME layer manifest');
  for (const { mesh, material } of meshes) {
    const stencil = material.userData?.homeStencil;
    if (stencil !== undefined) {
      if (!['mask', 'core'].includes(stencil?.role) || !Number.isInteger(stencil.ref) || stencil.ref < 1 || stencil.ref > 255) {
        throw new Error(`Unsupported HOME stencil: ${material.name}`);
      }
      const roles = stencilRoles.get(stencil.ref) ?? new Set();
      roles.add(stencil.role); stencilRoles.set(stencil.ref, roles);
    }
    if (material.userData?.homeBlend !== undefined && material.userData.homeBlend !== 'additive') {
      throw new Error(`Unsupported HOME blend: ${material.name}`);
    }
    if (material.userData?.homeLayerUv !== undefined) {
      const uv = material.userData.homeLayerUv;
      if (![0, 1].includes(uv?.base) || ![0, 1].includes(uv?.layer) || uv.base === uv.layer) {
        throw new Error(`Unsupported HOME layer UV: ${material.name}`);
      }
      layerNames.add(material.name);
    }
    if (material.userData?.homeSourceTextures?.layer || material.userData?.homeSourceTextures?.emissionMask) layerNames.add(material.name);
  }
  if (layerNames.size > 64) throw new Error('HOME source material review budget exceeded');
  for (const [ref, roles] of stencilRoles) if (roles.has('core') && !roles.has('mask')) {
    throw new Error(`Unpaired HOME stencil core ${ref}`);
  }
  const layerApproximations = [];
  for (const name of layerNames) {
    const target = meshes.filter(({ material }) => material.name === name);
    const textures = layeredMaterials[name];
    const composite = textures?.composite;
    const compositeClass = textures?.layer ? classifyReviewComposite(composite) : null;
    const expectsLayer = target.some(({ material }) => material.userData?.homeLayerUv || material.userData?.homeSourceTextures?.layer) ||
      requiredLayerMaterials.includes(name);
    const expectsEmission = target.some(({ material }) => material.emissiveMap || material.userData?.homeSourceTextures?.emissionMask);
    if (!target.length || !textures?.base?.isTexture || ![0, 1].includes(textures.base.channel) ||
      (!expectsLayer && composite !== undefined) ||
      expectsLayer !== Boolean(textures.layer) || expectsEmission !== Boolean(textures.emissionMask) ||
      (expectsLayer && (!textures.layer?.isTexture || textures.base === textures.layer ||
        ![0, 1].includes(textures.layer.channel) || compositeClass === null ||
        (compositeClass === false && !allowReviewLayerApproximation) ||
        composite?.baseUv !== textures.base.channel || composite?.layerUv !== textures.layer.channel)) ||
      target.some(({ material }) => material.userData?.homeLayerUv &&
        (material.userData.homeLayerUv.base !== composite?.baseUv || material.userData.homeLayerUv.layer !== composite?.layerUv)) ||
      target.some(({ mesh }) => (textures.base.channel === 1 || textures.layer?.channel === 1 || textures.emissionMask?.channel === 1) &&
        !mesh.geometry?.getAttribute?.('uv1')) ||
      (textures.emissionMask && (!textures.emissionMask.isTexture || ![0, 1].includes(textures.emissionMask.channel))) ||
      target.some(({ material }) => !material.isMeshStandardMaterial || material.userData?.homeStencil)) {
      throw new Error(`Original UV0/UV1 textures unavailable: ${name}`);
    }
    if (expectsLayer) layerApproximations.push({ materialName: name,
      renderEquation: allowReviewLayerApproximation ? 'source-layer-interpolation-review' : 'atlas-alpha-over-review', sourceFlags: {
        layerCalcMulti: composite.layerCalcMulti, layerOverLerpValue: composite.layerOverLerpValue,
        layerBlendMode: composite.layerBlendMode }, sourceSettingsDiffer: compositeClass === false,
      disclosure: allowReviewLayerApproximation
        ? `Review approximation for ${name}: layer color uses layer alpha and bounded source over-lerp setting${compositeClass === false ? '; source settings differ' : ''}. The original layered shader equation is unverified.`
        : `Review approximation for ${name}: rendered with Atlas alpha-over; the original layered shader equation is unverified.`,
    });
  }

  // All validation precedes mutation so a missing source texture cannot leave
  // a half-patched scene that accidentally enters the protected preview.
  preparedScenes.add(gltf.scene);
  const originalDuration = clip.duration, originalTrackCount = clip.tracks.length;
  clip.duration = duration;
  for (const object of visibility) {
    const { times, values } = object.userData.homeVisibility;
    clip.tracks.push(new THREE.BooleanKeyframeTrack(`${object.uuid}.visible`, times, values));
  }
  const patchedMaterials = new Set();
  for (const { mesh, material } of meshes) {
    const stencil = material.userData?.homeStencil;
    if (stencil) {
      const mask = stencil.role === 'mask';
      material.colorWrite = !mask;
      material.depthWrite = false;
      material.stencilWrite = true;
      material.stencilRef = stencil.ref;
      material.stencilFuncMask = 0xff;
      material.stencilFunc = mask ? THREE.AlwaysStencilFunc : THREE.EqualStencilFunc;
      material.stencilZPass = mask ? THREE.ReplaceStencilOp : THREE.KeepStencilOp;
      material.stencilWriteMask = mask ? 0xff : 0;
      mesh.renderOrder = mask ? 2 : 3;
      mesh.castShadow = false; mesh.receiveShadow = false;
    }
    if (material.userData?.homeBlend === 'additive') {
      material.blending = THREE.AdditiveBlending;
      material.transparent = true;
      material.depthWrite = false;
      mesh.castShadow = false; mesh.receiveShadow = false;
    }
    if (layerNames.has(material.name) && !patchedMaterials.has(material)) {
      const { base, layer, emissionMask, composite } = layeredMaterials[material.name];
      shaderLayer(material, base, layer, emissionMask, composite, allowReviewLayerApproximation);
      patchedMaterials.add(material);
    }
  }
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).reset().play();
  mixer.setTime(0);
  let disposed = false;
  return { scene: gltf.scene, clip, mixer, duration, stencilRefs: [...stencilRoles.keys()],
    visibilityNodes: visibility.map(object => object.name), layeredMaterialNames: [...layerNames],
    layerApproximations,
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
      clip.tracks.length = originalTrackCount;
      clip.duration = originalDuration;
      preparedScenes.delete(gltf.scene);
      // Caller still disposes geometries, loaded textures, extra layer textures,
      // the renderer/context and any canvas/object URL it created.
    },
  };
}
