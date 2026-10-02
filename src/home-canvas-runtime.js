import { createHomeRenderer, prepareHomeEffects } from './home-effects.js';

const POSE_PHASES = [0.125, 0.375, 0.625];
const RAD = Math.PI / 180;

function abortError() {
  return new DOMException('Obsolete HOME model load', 'AbortError');
}

function boundedBytes(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  throw new Error('Hash-validated GLB bytes required');
}

async function modules(overrides) {
  const [THREE, loaders, controls, meshopt] = await Promise.all([
    overrides.THREE ?? import('three'),
    overrides.loaders ?? Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
    ]).then(([gltf, draco]) => ({ GLTFLoader: gltf.GLTFLoader, DRACOLoader: draco.DRACOLoader })),
    overrides.OrbitControls ?? import('three/addons/controls/OrbitControls.js').then(module => module.OrbitControls),
    overrides.MeshoptDecoder ?? import('three/addons/libs/meshopt_decoder.module.js').then(module => module.MeshoptDecoder),
  ]);
  return { THREE, GLTFLoader: loaders.GLTFLoader, DRACOLoader: loaders.DRACOLoader,
    OrbitControls: controls, MeshoptDecoder: meshopt };
}

function disposeScene(scene, extraTextures = {}) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene?.traverse(object => {
    if (object.geometry?.dispose) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const entry of Object.values(extraTextures)) for (const texture of Object.values(entry)) {
    if (texture?.isTexture) textures.add(texture);
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function motionBounds(THREE, scene, mixer, duration) {
  const bounds = new THREE.Box3();
  const times = new Set([0, duration]);
  for (let sample = 0; sample <= 32; sample++) times.add(duration * sample / 32);
  scene.traverse(object => {
    const visibility = object.userData?.homeVisibility;
    for (const time of visibility?.times ?? []) {
      times.add(Math.max(0, time - 1e-4));
      times.add(Math.min(duration, time + 1e-4));
    }
  });
  for (const time of [...times].sort((a, b) => a - b)) {
    mixer.setTime(time);
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (!object.isMesh) return;
      for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      if (surfaces.every(material => !material || material.colorWrite === false || material.opacity === 0)) return;
      bounds.expandByObject(object, true);
    });
  }
  if (bounds.isEmpty()) throw new Error('HOME model has no visible geometry');
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(Number.isFinite) || Math.max(size.x, size.y, size.z) <= 0) {
    throw new Error('Invalid HOME animated bounds');
  }
  return { center: bounds.getCenter(new THREE.Vector3()), radius: Math.max(size.length() / 2, 1e-4) };
}

function reviewLighting(THREE, scene, center, radius) {
  // Neutral, fixed review lighting only. This is not an environment-map or
  // original-game shader reconstruction. Keep all lights shadow-free so their
  // cost and appearance remain predictable on mobile GPUs.
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x777777, 1.2);
  const directions = [
    { position: [-3, 5, 4], intensity: 2.0 },
    { position: [4, 2, 3], intensity: 0.7 },
    { position: [2, 3, -4], intensity: 1.0 },
  ];
  const lights = [hemisphere], targets = [];
  for (const { position, intensity } of directions) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.copy(center).add(new THREE.Vector3(...position).multiplyScalar(radius));
    light.target.position.copy(center);
    light.castShadow = false;
    lights.push(light); targets.push(light.target);
  }
  scene.add(...lights, ...targets);
  return () => {
    for (const object of [...lights, ...targets]) object.removeFromParent();
    for (const light of lights) light.dispose?.();
  };
}

async function resolveEmbeddedSourceTextures(gltf, THREE, signal, destination) {
  const json = gltf.parser?.json;
  const parser = gltf.parser;
  const materials = new Set();
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material?.userData?.homeSourceTextures) materials.add(material);
    }
  });
  if (!materials.size) return;
  if (!Array.isArray(json?.materials) || !Array.isArray(json?.textures) || !Array.isArray(json?.images) ||
    !Array.isArray(json?.bufferViews) ||
    typeof parser.getDependency !== 'function') throw new Error('Embedded HOME texture metadata unavailable');
  const resolvedDescriptors = new Map();
  const wrapMode = [THREE.RepeatWrapping, THREE.ClampToEdgeWrapping, THREE.MirroredRepeatWrapping];
  function checkSlot(slot) {
    if (!slot || !Number.isInteger(slot.texture) || ![0, 1].includes(slot.uv) ||
      !Array.isArray(slot.wrap) || slot.wrap.length !== 2 || slot.wrap.some(mode => ![0, 1, 2].includes(mode)) ||
      !Array.isArray(slot.offset) || slot.offset.length !== 2 ||
      !Array.isArray(slot.scale) || slot.scale.length !== 2 ||
      [...slot.offset, ...slot.scale].some(value => !Number.isFinite(value))) {
      throw new Error('Invalid embedded HOME texture descriptor');
    }
    const texture = json.textures[slot.texture];
    const imageIndex = texture?.extensions?.EXT_texture_webp?.source ?? texture?.source;
    const image = json.images[imageIndex];
    const sampler = json.samplers?.[texture?.sampler] ?? {};
    if (!texture || !image || image.uri || !Number.isInteger(image.bufferView) || !json.bufferViews[image.bufferView] ||
      !['image/png', 'image/webp'].includes(image.mimeType) ||
      (sampler.wrapS ?? THREE.RepeatWrapping) !== wrapMode[slot.wrap[0]] ||
      (sampler.wrapT ?? THREE.RepeatWrapping) !== wrapMode[slot.wrap[1]]) {
      throw new Error('Source texture is not the declared embedded image');
    }
    return slot;
  }
  async function loadSlot(slot, colorSpace) {
    checkSlot(slot);
    const dependency = await parser.getDependency('texture', slot.texture);
    if (signal.aborted) throw abortError();
    if (!dependency?.isTexture) throw new Error('Embedded HOME texture failed to decode');
    const texture = dependency.clone();
    texture.channel = slot.uv;
    texture.wrapS = wrapMode[slot.wrap[0]];
    texture.wrapT = wrapMode[slot.wrap[1]];
    texture.offset.fromArray(slot.offset);
    texture.repeat.fromArray(slot.scale);
    texture.flipY = false;
    texture.colorSpace = colorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  for (const material of materials) {
    if (signal.aborted) throw abortError();
    const descriptor = material.userData.homeSourceTextures;
    const matching = json.materials.filter(source => source.name === material.name &&
      JSON.stringify(source.extras?.homeSourceTextures) === JSON.stringify(descriptor));
    if (matching.length !== 1 || !descriptor.base || !material.map?.isTexture) {
      throw new Error(`Unbound HOME source material: ${material.name}`);
    }
    checkSlot(descriptor.base);
    if (material.map.channel !== descriptor.base.uv ||
      matching[0].pbrMetallicRoughness?.baseColorTexture?.index !== descriptor.base.texture) {
      throw new Error(`HOME base texture binding changed: ${material.name}`);
    }
    if (!descriptor.layer && !descriptor.emissionMask) continue;
    if (destination[material.name]) {
      if (resolvedDescriptors.get(material.name) !== JSON.stringify(descriptor)) {
        throw new Error(`Duplicate HOME source material: ${material.name}`);
      }
      continue;
    }
    const entry = { base: material.map, composite: descriptor.composite };
    destination[material.name] = entry;
    resolvedDescriptors.set(material.name, JSON.stringify(descriptor));
    if (descriptor.layer) entry.layer = await loadSlot(descriptor.layer, THREE.SRGBColorSpace);
    if (descriptor.emissionMask) entry.emissionMask = await loadSlot(descriptor.emissionMask, THREE.NoColorSpace);
  }
}

/**
 * Mount one already hash-checked HOME GLB into an otherwise empty host.
 * The caller owns admission, source fetch, model selection and user-facing UI.
 * Abort the supplied signal when that selection changes. Original layer
 * textures must be freshly created for this mount; ownership transfers here.
 */
export async function mountHomeCanvas({ host, bytes, signal, dracoDecoderPath,
  requiredLayerMaterials = [], layeredMaterials = {}, cameraOrbitPercent = 110,
  allowReviewLayerApproximation = false, onFailure = () => {} }, overrides = {}) {
  if (!host?.append || !host.ownerDocument) throw new Error('HOME host required');
  if (host.children?.length) throw new Error('HOME host must be empty');
  if (!signal || typeof signal.addEventListener !== 'function') throw new Error('HOME abort signal required');
  if (!/^\/[a-zA-Z0-9_/-]+\/$/.test(dracoDecoderPath ?? '') || dracoDecoderPath.includes('//')) {
    throw new Error('Local Draco decoder path required');
  }
  if (!Number.isFinite(cameraOrbitPercent) || cameraOrbitPercent < 100 || cameraOrbitPercent > 320) {
    throw new Error('Invalid HOME camera orbit');
  }
  if (typeof allowReviewLayerApproximation !== 'boolean') throw new Error('Invalid HOME review option');
  const source = boundedBytes(bytes);
  if (signal.aborted) throw abortError();
  const { THREE, GLTFLoader, DRACOLoader, OrbitControls, MeshoptDecoder } = await modules(overrides);
  if (signal.aborted) throw abortError();
  const document = host.ownerDocument, win = document.defaultView;
  if (!win?.requestAnimationFrame || !win?.cancelAnimationFrame) throw new Error('HOME browser animation API unavailable');
  let draco, gltf, effects, renderer, controls, canvas, camera, observer, media, resizeHandler, disposeLighting;
  let parsePending = false;
  let frame = 0, previousTime = null, disposed = false, mounted = false, playing = true, suspended = false;
  let inspecting = false, angle = -12, elevation = 85, orbitPercent = cameraOrbitPercent;
  let center, radius, baseDistance, failureReported = false;
  const activeLayeredMaterials = { ...layeredMaterials };
  const geometryResources = () => disposeScene(gltf?.scene, activeLayeredMaterials);
  const render = () => { if (!disposed) renderer.render(gltf.scene, camera); };
  const permitted = () => playing && !suspended && !document.hidden && !(media?.matches ?? false);
  const cancelFrame = () => { if (frame) win.cancelAnimationFrame(frame); frame = 0; previousTime = null; };
  const tick = time => {
    frame = 0;
    if (disposed || !permitted()) { previousTime = null; return; }
    try {
      if (previousTime !== null) effects.mixer.update(Math.min(Math.max((time - previousTime) / 1000, 0), 0.05) * 0.6);
      previousTime = time;
      render();
      frame = win.requestAnimationFrame(tick);
    } catch (error) { fail(error); }
  };
  const synchronize = () => {
    if (disposed) return;
    if (permitted()) { if (!frame) frame = win.requestAnimationFrame(tick); }
    else cancelFrame();
  };
  const fail = error => {
    if (disposed || signal.aborted) return;
    dispose();
    if (!failureReported) { failureReported = true; onFailure(error); }
  };
  const onOrbitChange = () => {
    if (disposed || !mounted) return;
    if (inspecting && baseDistance) {
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(center));
      angle = spherical.theta / RAD;
      elevation = spherical.phi / RAD;
      orbitPercent = spherical.radius / baseDistance * 100;
    }
    if (!permitted()) try { render(); } catch (error) { fail(error); }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelFrame();
    signal.removeEventListener('abort', dispose);
    document.removeEventListener('visibilitychange', synchronize);
    media?.removeEventListener?.('change', synchronize);
    observer?.disconnect();
    if (resizeHandler) win.removeEventListener('resize', resizeHandler);
    controls?.removeEventListener?.('change', onOrbitChange);
    controls?.dispose();
    effects?.dispose();
    disposeLighting?.();
    geometryResources();
    if (!parsePending) draco?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss?.();
    canvas?.remove();
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    await MeshoptDecoder.ready;
    if (signal.aborted) throw abortError();
    draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    parsePending = true;
    try { gltf = await loader.parseAsync(source, ''); }
    finally { parsePending = false; if (disposed) draco.dispose(); }
    if (signal.aborted) {
      disposeScene(gltf?.scene);
      throw abortError();
    }
    await resolveEmbeddedSourceTextures(gltf, THREE, signal, activeLayeredMaterials);
    if (signal.aborted) throw abortError();
    effects = prepareHomeEffects(gltf, THREE, { requiredLayerMaterials, layeredMaterials: activeLayeredMaterials,
      allowReviewLayerApproximation });
    ({ center, radius } = motionBounds(THREE, gltf.scene, effects.mixer, effects.duration));
    effects.mixer.setTime(Math.min(0.35, effects.duration / 2));
    disposeLighting = reviewLighting(THREE, gltf.scene, center, radius);
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Interactive Pokémon model');
    canvas.tabIndex = -1;
    canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.pointerEvents = 'none';
    renderer = (overrides.createRenderer ?? createHomeRenderer)(THREE, { canvas, alpha: true, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2));
    camera = new THREE.PerspectiveCamera(35, 1, Math.max(radius / 1000, 0.001), radius * 1000);
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(center);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minPolarAngle = 35 * RAD;
    controls.maxPolarAngle = 145 * RAD;
    controls.enabled = false;
    controls.addEventListener('change', onOrbitChange);
    const positionCamera = () => {
      const theta = angle * RAD, phi = elevation * RAD, distance = baseDistance * orbitPercent / 100;
      camera.position.set(center.x + distance * Math.sin(phi) * Math.sin(theta),
        center.y + distance * Math.cos(phi),
        center.z + distance * Math.sin(phi) * Math.cos(theta));
      camera.lookAt(center);
      controls.minDistance = baseDistance * 0.8;
      controls.maxDistance = baseDistance * 3.2;
      controls.update();
    };
    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, Math.round(host.clientWidth || 1));
      const height = Math.max(1, Math.round(host.clientHeight || 1));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const halfVertical = camera.fov * RAD / 2;
      const halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect);
      baseDistance = radius / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.25;
      positionCamera();
      renderer.setSize(width, height, false);
      mounted = true;
      render();
    };
    host.append(canvas);
    resize();
    const ResizeObserverClass = overrides.ResizeObserver ?? win.ResizeObserver;
    if (ResizeObserverClass) { observer = new ResizeObserverClass(resize); observer.observe(host); }
    else { resizeHandler = resize; win.addEventListener('resize', resize); }
    media = win.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false };
    document.addEventListener('visibilitychange', synchronize);
    media.addEventListener?.('change', synchronize);
    synchronize();
    if (signal.aborted) throw abortError();
    return {
      scene: gltf.scene, clip: effects.clip, duration: effects.duration, canvas,
      layerApproximations: effects.layerApproximations,
      play() { if (!disposed) { playing = true; synchronize(); } },
      pause() { if (!disposed) { playing = false; synchronize(); render(); } },
      setSuspended(value) { if (!disposed) { suspended = Boolean(value); synchronize(); } },
      setInspect(value) {
        if (disposed) return;
        inspecting = Boolean(value);
        controls.enabled = inspecting;
        canvas.style.pointerEvents = inspecting ? 'auto' : 'none';
        canvas.tabIndex = inspecting ? 0 : -1;
        render();
      },
      setAngle(degrees) {
        if (disposed) return;
        if (!Number.isFinite(degrees)) throw new Error('Invalid HOME orbit angle');
        angle = degrees; positionCamera(); render();
      },
      setOrbitPercent(percent) {
        if (disposed) return;
        if (!Number.isFinite(percent) || percent < 80 || percent > 320) throw new Error('Invalid HOME orbit distance');
        orbitPercent = percent; positionCamera(); render();
      },
      samplePose(index) {
        if (disposed) return;
        if (!Number.isInteger(index) || index < 0 || index >= POSE_PHASES.length) throw new Error('Unknown HOME still pose');
        playing = false; synchronize();
        effects.mixer.setTime(effects.duration * POSE_PHASES[index]);
        render();
      },
      resize, dispose,
      get isInspecting() { return inspecting; },
      get isDisposed() { return disposed; },
    };
  } catch (error) {
    dispose();
    if (signal.aborted && error?.name !== 'AbortError') throw abortError();
    throw error;
  }
}
