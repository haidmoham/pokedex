import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mountHomeCanvas } from '../src/home-canvas-runtime.js';

function fakeBrowser() {
  const frames = new Map(), documentListeners = new Map(), mediaListeners = new Map();
  let nextFrame = 1;
  const media = { matches: false, addEventListener(type, callback) { mediaListeners.set(type, callback); },
    removeEventListener(type) { mediaListeners.delete(type); } };
  const win = { devicePixelRatio: 3, requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }, matchMedia() { return media; }, ResizeObserver: class {
      observe() {} disconnect() { win.observerDisconnected = true; }
    } };
  const document = { defaultView: win, hidden: false,
    addEventListener(type, callback) { documentListeners.set(type, callback); },
    removeEventListener(type) { documentListeners.delete(type); },
    createElement(tag) { assert.equal(tag, 'canvas'); return { style: {}, tabIndex: -1,
      setAttribute() {}, remove() { if (this.host) this.host.children = this.host.children.filter(item => item !== this); } }; } };
  const host = { ownerDocument: document, clientWidth: 320, clientHeight: 390, children: [],
    append(canvas) { this.children.push(canvas); canvas.host = this; } };
  return { host, document, win, frames, media, mediaListeners, documentListeners,
    nextFrame(time) { const [id, callback] = frames.entries().next().value ?? []; if (id) { frames.delete(id); callback(time); } } };
}

function fakeGLTF() {
  const scene = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  const material = new THREE.MeshStandardMaterial();
  const texture = new THREE.Texture(); material.map = texture;
  const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
  const clip = new THREE.AnimationClip('HOME Idle', 2.016667, [
    new THREE.VectorKeyframeTrack(`${scene.uuid}.position`, [0, 2], [0, 0, 0, 0.1, 0, 0]),
  ]);
  return { scene, animations: [clip], parser: { json: { animations: [
    { name: 'HOME Idle', extras: { homeDuration: 2 } },
  ] } }, geometry, material, texture };
}

function addEmbeddedSourceTextures(gltf, { layer = true, emission = true, invalidIndex = false } = {}) {
  const material = gltf.material;
  material.name = 'body-layer';
  const slot = (texture, path) => ({ path, texture, uv: 0, wrap: [0, 0], offset: [0, 0], scale: [1, 1] });
  const descriptor = { base: slot(0, 'base.png') };
  if (layer) {
    descriptor.layer = slot(invalidIndex ? 99 : 1, 'layer.png');
    descriptor.composite = { equation: 'atlas-alpha-over-review', baseUv: 0, layerUv: 0,
      layerCalcMulti: 0, layerOverLerpValue: 1, layerBlendMode: 0 };
  }
  if (emission) { descriptor.emissionMask = slot(2, 'mask.png'); material.emissive.setHex(0xffffff); }
  material.userData.homeSourceTextures = descriptor;
  gltf.parser.json.materials = [{ name: material.name, extras: { homeSourceTextures: descriptor },
    pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
  gltf.parser.json.textures = [0, 1, 2].map(source => ({ source, sampler: 0 }));
  gltf.parser.json.images = [0, 1, 2].map(bufferView => ({ bufferView, mimeType: 'image/png' }));
  gltf.parser.json.bufferViews = [0, 1, 2].map(() => ({ buffer: 0, byteLength: 8 }));
  gltf.parser.json.samplers = [{ wrapS: 10497, wrapT: 10497 }];
  gltf.parser.getDependency = async (kind, index) => { assert.equal(kind, 'texture'); assert.ok(index < 3); return new THREE.Texture(); };
  return descriptor;
}

function fakeModules(gltf, { parsePromise } = {}) {
  const state = { renders: 0, decoderPath: null, controlsDisposed: false, dracoDisposed: false,
    rendererDisposed: false, contextLost: false, textureDisposed: false };
  class DRACOLoader {
    setDecoderPath(path) { state.decoderPath = path; }
    dispose() { state.dracoDisposed = true; }
  }
  class GLTFLoader {
    setDRACOLoader(loader) { assert.ok(loader instanceof DRACOLoader); }
    setMeshoptDecoder(decoder) { assert.ok(decoder.ready); }
    parseAsync(bytes) { assert.ok(bytes instanceof ArrayBuffer); return parsePromise ?? Promise.resolve(gltf); }
  }
  class OrbitControls {
    constructor(camera, canvas) { assert.ok(camera.isPerspectiveCamera); assert.ok(canvas); this.target = new THREE.Vector3(); this.listeners = new Map(); }
    addEventListener(type, callback) { this.listeners.set(type, callback); }
    removeEventListener(type) { this.listeners.delete(type); }
    update() { this.listeners.get('change')?.(); }
    dispose() { state.controlsDisposed = true; }
  }
  class FakeRenderer {
    constructor() { state.renderer = this; }
    setPixelRatio(value) { state.pixelRatio = value; }
    setSize(width, height) { state.size = [width, height]; }
    render(scene, camera) { state.camera = camera; state.renders++; if (state.failRender) throw new Error('GPU lost'); }
    dispose() { state.rendererDisposed = true; }
    forceContextLoss() { state.contextLost = true; }
  }
  return { state, overrides: { THREE, loaders: { GLTFLoader, DRACOLoader }, OrbitControls,
    MeshoptDecoder: { ready: Promise.resolve() }, createRenderer(_three, parameters) {
      assert.equal(parameters.canvas.style.width, '100%');
      return new FakeRenderer();
    } } };
}

test('HOME inspection and viewport changes return to a stable fitted presentation', async () => {
  const browser = fakeBrowser(), { state, overrides } = fakeModules(fakeGLTF());
  const runtime = await mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32),
    signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/' }, overrides);
  const original = state.camera.position.clone();
  runtime.setInspect(true); runtime.setAngle(90); runtime.setOrbitPercent(200);
  assert.ok(state.camera.position.distanceTo(original) > 1);
  runtime.setInspect(false);
  assert.ok(state.camera.position.distanceTo(original) < 1e-8, 'Done restores angle, elevation and fitted distance');
  browser.host.clientWidth = 740; browser.host.clientHeight = 258; runtime.resize();
  assert.equal(state.camera.aspect, 740 / 258);
  browser.host.clientWidth = 320; browser.host.clientHeight = 390; runtime.resize();
  assert.ok(state.camera.position.distanceTo(original) < 1e-8, 'resize does not accumulate camera drift');
  runtime.dispose();
});

test('custom canvas mounts one verified source and owns camera, idle controls and complete teardown', async () => {
  const browser = fakeBrowser(), gltf = fakeGLTF(), { state, overrides } = fakeModules(gltf);
  for (const resource of [gltf.geometry, gltf.material, gltf.texture]) {
    const original = resource.dispose.bind(resource);
    resource.dispose = () => { state[resource === gltf.geometry ? 'geometryDisposed' : resource === gltf.material ? 'materialDisposed' : 'textureDisposed'] = true; original(); };
  }
  const controller = new AbortController();
  const runtime = await mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32), signal: controller.signal,
    dracoDecoderPath: '/model-runtime/draco/' }, overrides);
  assert.equal(browser.host.children.length, 1);
  assert.equal(state.decoderPath, '/model-runtime/draco/');
  assert.equal(state.pixelRatio, 2);
  assert.deepEqual(state.size, [320, 390]);
  assert.equal(runtime.duration, 2);
  assert.ok(state.renders >= 1);
  assert.equal(state.renderer.outputColorSpace, THREE.SRGBColorSpace);
  assert.equal(state.renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(state.renderer.toneMappingExposure, 1);
  assert.equal(runtime.scene.children.filter(child => child.isHemisphereLight).length, 1);
  assert.equal(runtime.scene.children.filter(child => child.isDirectionalLight).length, 3);
  for (const light of runtime.scene.children.filter(child => child.isDirectionalLight)) {
    assert.equal(light.color.getHex(), 0xffffff);
    assert.equal(light.castShadow, false);
  }
  assert.equal(browser.frames.size, 1);
  browser.nextFrame(0); browser.nextFrame(16);
  runtime.setSuspended(true); assert.equal(browser.frames.size, 0);
  runtime.setSuspended(false); assert.equal(browser.frames.size, 1);
  browser.media.matches = true; browser.mediaListeners.get('change')(); assert.equal(browser.frames.size, 0);
  browser.media.matches = false; browser.mediaListeners.get('change')(); assert.equal(browser.frames.size, 1);
  browser.document.hidden = true; browser.documentListeners.get('visibilitychange')(); assert.equal(browser.frames.size, 0);
  browser.document.hidden = false; browser.documentListeners.get('visibilitychange')();
  runtime.setInspect(true); assert.equal(runtime.isInspecting, true);
  assert.equal(runtime.canvas.style.pointerEvents, 'auto');
  runtime.setAngle(30); runtime.setOrbitPercent(175);
  runtime.samplePose(1); assert.equal(browser.frames.size, 0);
  assert.throws(() => runtime.samplePose(3), /Unknown HOME still pose/);
  runtime.play(); assert.equal(browser.frames.size, 1);
  runtime.pause(); assert.equal(browser.frames.size, 0);
  controller.abort();
  assert.equal(runtime.isDisposed, true);
  assert.equal(browser.host.children.length, 0);
  assert.equal(runtime.scene.children.filter(child => child.isLight).length, 0);
  assert.equal(runtime.scene.children.length, 1, 'only original model mesh remains after light teardown');
  assert.equal(browser.frames.size, 0);
  assert.equal(browser.documentListeners.size, 0);
  for (const key of ['controlsDisposed', 'dracoDisposed', 'rendererDisposed', 'contextLost', 'geometryDisposed', 'materialDisposed', 'textureDisposed']) assert.equal(state[key], true, key);
  runtime.dispose();
});

test('aborting during asynchronous decode leaves no canvas and disposes late GLTF resources', async () => {
  const browser = fakeBrowser(), gltf = fakeGLTF();
  let resolveParse;
  const pending = new Promise(resolve => { resolveParse = resolve; });
  const { state, overrides } = fakeModules(gltf, { parsePromise: pending });
  let disposedGeometry = false;
  gltf.geometry.dispose = () => { disposedGeometry = true; };
  const controller = new AbortController();
  const mount = mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32), signal: controller.signal,
    dracoDecoderPath: '/model-runtime/draco/' }, overrides);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  resolveParse(gltf);
  await assert.rejects(mount, { name: 'AbortError' });
  assert.equal(browser.host.children.length, 0);
  assert.equal(disposedGeometry, true);
  assert.equal(state.dracoDisposed, true);
});

test('post-mount render failure tears down and reports fallback exactly once', async () => {
  const browser = fakeBrowser(), gltf = fakeGLTF(), { state, overrides } = fakeModules(gltf);
  const failures = [];
  const runtime = await mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32), signal: new AbortController().signal,
    dracoDecoderPath: '/model-runtime/draco/', onFailure: error => failures.push(error.message) }, overrides);
  state.failRender = true;
  browser.nextFrame(100);
  assert.deepEqual(failures, ['GPU lost']);
  assert.equal(runtime.isDisposed, true);
  assert.equal(browser.host.children.length, 0);
});

test('invalid source path or stale selection fail before mounting a canvas', async () => {
  const browser = fakeBrowser();
  await assert.rejects(mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32),
    signal: new AbortController().signal, dracoDecoderPath: 'https://cdn.example/draco/' }), /Local Draco decoder path/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32),
    signal: controller.signal, dracoDecoderPath: '/model-runtime/draco/' }), { name: 'AbortError' });
  assert.equal(browser.host.children.length, 0);
});

test('embedded same-UV layer and emission mask resolve from exact GLB texture indices', async () => {
  const browser = fakeBrowser(), gltf = fakeGLTF();
  addEmbeddedSourceTextures(gltf);
  const { overrides } = fakeModules(gltf);
  const runtime = await mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32),
    signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/' }, overrides);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  gltf.material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vHomeLayerUv = \(homeLayerTransform \* vec3\(uv, 1\.0\)\)/);
  assert.equal(shader.uniforms.homeLayerMap.value.channel, 0);
  assert.equal(shader.uniforms.homeLayerMap.value.colorSpace, THREE.SRGBColorSpace);
  assert.equal(shader.uniforms.homeEmissionMask.value.colorSpace, THREE.NoColorSpace);
  assert.match(shader.fragmentShader, /homeComposite.rgb \* texture2D\(homeEmissionMask/);
  runtime.dispose();
});

test('embedded emission mask works without a layer and undeclared texture indices fail closed', async () => {
  const browser = fakeBrowser(), gltf = fakeGLTF();
  addEmbeddedSourceTextures(gltf, { layer: false });
  const { overrides } = fakeModules(gltf);
  const runtime = await mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32),
    signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/' }, overrides);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  gltf.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /vec4 homeComposite = texture2D\(map, vMapUv\)/);
  runtime.dispose();
  const invalid = fakeGLTF();
  addEmbeddedSourceTextures(invalid, { invalidIndex: true });
  const next = fakeBrowser();
  await assert.rejects(mountHomeCanvas({ host: next.host, bytes: new ArrayBuffer(32),
    signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/' }, fakeModules(invalid).overrides),
  /declared embedded image/);
  assert.equal(next.host.children.length, 0);
});

test('glTF wrap enums map to real Three texture wrap modes for all source slots', async () => {
  const gltfModes = [10497, 33071, 33648];
  const threeModes = [THREE.RepeatWrapping, THREE.ClampToEdgeWrapping, THREE.MirroredRepeatWrapping];
  for (let mode = 0; mode < 3; mode++) {
    const gltf = fakeGLTF(), descriptor = addEmbeddedSourceTextures(gltf);
    descriptor.base.wrap = [mode, mode];
    descriptor.layer.wrap = [mode, mode];
    descriptor.emissionMask.wrap = [mode, mode];
    gltf.parser.json.samplers[0] = { wrapS: gltfModes[mode], wrapT: gltfModes[mode] };
    const browser = fakeBrowser();
    const runtime = await mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32),
      signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/' }, fakeModules(gltf).overrides);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    gltf.material.onBeforeCompile(shader);
    const layer = shader.uniforms.homeLayerMap.value, mask = shader.uniforms.homeEmissionMask.value;
    assert.ok(layer instanceof THREE.Texture);
    assert.equal(layer.wrapS, threeModes[mode]); assert.equal(layer.wrapT, threeModes[mode]);
    assert.equal(mask.wrapS, threeModes[mode]); assert.equal(mask.wrapT, threeModes[mode]);
    runtime.dispose();
  }
});

test('mismatched, invalid and missing glTF sampler references still fail closed', async () => {
  for (const badSampler of [
    { wrapS: 1000, wrapT: 10497 }, { wrapS: 33071, wrapT: 10497 },
    { wrapS: 10497, wrapT: 99999 }, null,
  ]) {
    const gltf = fakeGLTF();
    addEmbeddedSourceTextures(gltf);
    if (badSampler === null) gltf.parser.json.textures[1].sampler = 99;
    else gltf.parser.json.samplers[0] = badSampler;
    const browser = fakeBrowser();
    await assert.rejects(mountHomeCanvas({ host: browser.host, bytes: new ArrayBuffer(32),
      signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/' },
    fakeModules(gltf).overrides), /declared embedded image/);
    assert.equal(browser.host.children.length, 0);
  }
});

test('canvas opt-in exposes source-flag review disclosures and strict mount fails cleanly', async () => {
  const gltf = fakeGLTF();
  const descriptor = addEmbeddedSourceTextures(gltf);
  descriptor.composite.layerOverLerpValue = 0;
  const strictBrowser = fakeBrowser();
  await assert.rejects(mountHomeCanvas({ host: strictBrowser.host, bytes: new ArrayBuffer(32),
    signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/' },
  fakeModules(gltf).overrides), /textures unavailable/);
  assert.equal(strictBrowser.host.children.length, 0);
  const reviewBrowser = fakeBrowser();
  const { state, overrides } = fakeModules(gltf);
  const runtime = await mountHomeCanvas({ host: reviewBrowser.host, bytes: new ArrayBuffer(32),
    signal: new AbortController().signal, dracoDecoderPath: '/model-runtime/draco/',
    allowReviewLayerApproximation: true }, overrides);
  assert.equal(runtime.layerApproximations.length, 1);
  assert.equal(runtime.layerApproximations[0].materialName, 'body-layer');
  assert.equal(runtime.layerApproximations[0].sourceFlags.layerOverLerpValue, 0);
  assert.equal(runtime.layerApproximations[0].sourceSettingsDiffer, true);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  gltf.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /mix\(homeBase\.rgb, homeLayer\.rgb, homeLayerWeight\)/);
  assert.equal(shader.uniforms.homeLayerOverLerp.value, 0);
  assert.ok(state.renders > 0);
  runtime.dispose();
  assert.equal(state.rendererDisposed, true);
  assert.equal(state.contextLost, true);
  assert.equal(reviewBrowser.host.children.length, 0);
});
