// A bind-pose box is not an idle-motion envelope: wings, horns and root motion
// can leave it. Sample deformed vertices in source world coordinates once,
// before exposing either renderer. Never chase the animated center per frame.
export async function sampleModelBounds(THREE, scene, mixer, duration, clip, signal) {
  const bounds = new THREE.Box3();
  const times = new Set([0, duration]);
  for (let sample = 0; sample <= 32; sample++) times.add(duration * sample / 32);
  // Include exact keyframe extrema. Bound work for unusually dense source clips.
  const keys = [...new Set((clip?.tracks ?? []).flatMap(track => Array.from(track.times)))].sort((a, b) => a - b);
  const stride = Math.max(1, Math.ceil(keys.length / 256));
  for (let index = 0; index < keys.length; index += stride) if (keys[index] <= duration) times.add(keys[index]);
  scene.traverse(object => {
    for (const time of object.userData?.homeVisibility?.times ?? []) {
      times.add(Math.max(0, time - 1e-4));
      times.add(Math.min(duration, time + 1e-4));
    }
  });
  let sampled = 0;
  for (const time of [...times].sort((a, b) => a - b)) {
    if (signal?.aborted) throw new DOMException('Obsolete model framing', 'AbortError');
    mixer?.setTime(time);
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      if (!object.isMesh) return;
      for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return;
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      if (surfaces.every(material => !material || material.colorWrite === false || material.opacity === 0)) return;
      bounds.expandByObject(object, true);
    });
    // Keep navigation/abort input responsive while framing a dense animated mesh.
    if (++sampled % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  const size = bounds.getSize(new THREE.Vector3());
  if (bounds.isEmpty() || ![size.x, size.y, size.z].every(Number.isFinite) || Math.max(size.x, size.y, size.z) <= 0) {
    throw Error('Invalid visible model bounds');
  }
  return { size, center: bounds.getCenter(new THREE.Vector3()), radius: Math.max(size.length() / 2, 1e-4) };
}

// CPU geometry pass for model-viewer, whose public dimensions remain the
// initial/rest-pose box. Reuse already validated bytes; decode no extra images
// and allocate no second WebGL context, renderer or GPU resources.
export async function loadModelBounds(blob, animation, signal) {
  const [THREE, { GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three'), import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'), import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  if (signal.aborted) throw new DOMException('Obsolete model framing', 'AbortError');
  const draco = new DRACOLoader().setDecoderPath('/model-runtime/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  loader.register(parser => ({ name: 'PokedexFramingMaterial', loadMaterial(index) {
    const source = parser.json.materials[index];
    return Promise.resolve(new THREE.MeshBasicMaterial({ opacity: source.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1 }));
  } }));
  let gltf, mixer;
  try {
    gltf = await loader.parseAsync(await blob.arrayBuffer(), '');
    const clip = animation ? gltf.animations.find(clip => clip.name === animation) : undefined;
    if (animation && !clip) throw Error('Framing idle unavailable');
    if (clip) { mixer = new THREE.AnimationMixer(gltf.scene); mixer.clipAction(clip).play(); }
    return await sampleModelBounds(THREE, gltf.scene, mixer, clip?.duration ?? 0, clip, signal);
  } finally {
    mixer?.stopAllAction();
    if (gltf) {
      mixer?.uncacheRoot(gltf.scene);
      const resources = new Set();
      gltf.scene.traverse(object => {
        if (object.geometry) resources.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) resources.add(material);
      });
      for (const resource of resources) resource.dispose();
    }
    draco.dispose();
  }
}
