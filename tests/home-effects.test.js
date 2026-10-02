import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHomeRenderer, inspectHomeEffects, prepareHomeEffects } from '../src/home-effects.js';

function sceneFixture({ materials = [], visibility = [], duration = 2, layers = [] } = {}) {
  const scene = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  for (const spec of materials) {
    const material = new THREE.MeshStandardMaterial();
    material.name = spec.name;
    Object.assign(material.userData, spec.extras);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = spec.name; scene.add(mesh);
  }
  for (const spec of visibility) {
    const group = new THREE.Group();
    group.name = spec.name;
    group.userData.homeVisibility = { times: spec.times, values: spec.values };
    scene.add(group);
  }
  const clip = new THREE.AnimationClip('HOME Idle', duration + 1 / 60, [
    new THREE.VectorKeyframeTrack(`${scene.uuid}.position`, [0, duration], [0, 0, 0, 0, 0.25, 0]),
  ]);
  const gltf = { scene, animations: [clip], parser: { json: { animations: [
    { name: 'HOME Idle', extras: { homeDuration: duration } },
  ] } } };
  const requiredLayerMaterials = layers;
  return { gltf, scene, clip, requiredLayerMaterials };
}

test('source-authored stencil pairs use ordered mask/core passes and preserve native skeletal track', () => {
  const { gltf, scene, clip } = sceneFixture({ materials: [
    { name: 'flame-mask', extras: { homeStencil: { role: 'mask', ref: 3 } } },
    { name: 'flame-core', extras: { homeStencil: { role: 'core', ref: 3 } } },
  ] });
  const nativeTrack = clip.tracks[0], originalValues = nativeTrack.values.slice();
  const result = prepareHomeEffects(gltf, THREE);
  assert.equal(result.clip, clip);
  assert.equal(result.duration, 2);
  assert.deepEqual(nativeTrack.values, originalValues);
  const [mask, core] = scene.children;
  assert.equal(mask.material.colorWrite, false);
  assert.equal(mask.material.stencilFunc, THREE.AlwaysStencilFunc);
  assert.equal(mask.material.stencilZPass, THREE.ReplaceStencilOp);
  assert.equal(mask.renderOrder, 2);
  assert.equal(core.material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(core.material.stencilWriteMask, 0);
  assert.equal(core.renderOrder, 3);
  assert.deepEqual(result.stencilRefs, [3]);
});

test('visibility uses source Boolean tracks and changes at native transition times', () => {
  const { gltf, scene, clip } = sceneFixture({ visibility: [
    { name: 'liquid', times: [0, 0.5, 1.2, 2], values: [false, true, false, false] },
  ] });
  const result = prepareHomeEffects(gltf, THREE);
  assert.equal(clip.tracks.length, 2);
  assert.equal(clip.tracks[1].name, `${scene.children[0].uuid}.visible`);
  assert.ok(clip.tracks[1] instanceof THREE.BooleanKeyframeTrack);
  for (const [time, visible] of [[0.49, false], [0.51, true], [1.19, true], [1.21, false], [1.99, false]]) {
    result.mixer.setTime(time);
    assert.equal(scene.children[0].visible, visible, `visibility at ${time}`);
    assert.deepEqual(scene.children[0].scale.toArray(), [1, 1, 1]);
  }
  result.mixer.setTime(2.01);
  assert.equal(scene.children[0].visible, false);
});

test('additive blending remains an actual additive pass without rewriting source material values', () => {
  const { gltf, scene } = sceneFixture({ materials: [
    { name: 'glow', extras: { homeBlend: 'additive' } },
  ] });
  const material = scene.children[0].material;
  const originalColor = material.color.clone();
  prepareHomeEffects(gltf, THREE);
  assert.equal(material.blending, THREE.AdditiveBlending);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.deepEqual(material.color.toArray(), originalColor.toArray());
});

test('UV0 base and UV1 layer use separate original textures and shader coordinates', () => {
  const { gltf, scene, requiredLayerMaterials } = sceneFixture({ materials: [
    { name: 'BodyBPara', extras: { homeLayerUv: { base: 0, layer: 1 } } },
  ], layers: ['BodyBPara'] });
  const base = new THREE.Texture(), layer = new THREE.Texture();
  base.channel = 0; layer.channel = 1;
  const result = prepareHomeEffects(gltf, THREE, { requiredLayerMaterials,
    layeredMaterials: { BodyBPara: { base, layer,
      composite: { equation: 'atlas-alpha-over-review', baseUv: 0, layerUv: 1,
        layerCalcMulti: 0, layerOverLerpValue: 1, layerBlendMode: 0 } } } });
  const material = scene.children[0].material;
  assert.equal(material.map, base);
  assert.deepEqual(result.layeredMaterialNames, ['BodyBPara']);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vec3\(uv1, 1\.0\)/);
  assert.match(shader.fragmentShader, /texture2D\(map, vMapUv\)/);
  assert.match(shader.fragmentShader, /texture2D\(homeLayerMap, vHomeLayerUv\)/);
  assert.equal(shader.uniforms.homeLayerMap.value, layer);
});

test('layered emission replaces the UV0-baked map with original mask on its source UV channel', () => {
  const { gltf, scene } = sceneFixture({ materials: [
    { name: 'BodyCInc', extras: { homeLayerUv: { base: 0, layer: 1 } } },
  ] });
  const material = scene.children[0].material;
  material.emissiveMap = new THREE.Texture();
  const base = new THREE.Texture(), layer = new THREE.Texture(), emissionMask = new THREE.Texture();
  base.channel = 0; layer.channel = 1; emissionMask.channel = 1;
  const composite = { equation: 'atlas-alpha-over-review', baseUv: 0, layerUv: 1,
    layerCalcMulti: 0, layerOverLerpValue: 1, layerBlendMode: 0 };
  assert.throws(() => prepareHomeEffects(gltf, THREE, { layeredMaterials: { BodyCInc: { base, layer, composite } } }), /textures unavailable/);
  prepareHomeEffects(gltf, THREE, { layeredMaterials: { BodyCInc: { base, layer, emissionMask, composite } } });
  assert.equal(material.emissiveMap, null);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vHomeEmissionUv = \(homeEmissionTransform \* vec3\(uv1, 1\.0\)\)/);
  assert.match(shader.fragmentShader, /totalEmissiveRadiance \*= homeComposite.rgb \* texture2D\(homeEmissionMask, vHomeEmissionUv\)\.r/);
  assert.equal(shader.uniforms.homeEmissionMask.value, emissionMask);
});

test('reversed source channels sample UV1 base and UV0 layer without guessing blend modes', () => {
  const { gltf, scene } = sceneFixture({ materials: [
    { name: 'BodyC01', extras: { homeLayerUv: { base: 1, layer: 0 } } },
  ] });
  const base = new THREE.Texture(), layer = new THREE.Texture();
  base.channel = 1; layer.channel = 0;
  const composite = { equation: 'atlas-alpha-over-review', baseUv: 1, layerUv: 0,
    layerCalcMulti: 0, layerOverLerpValue: 1, layerBlendMode: 0 };
  prepareHomeEffects(gltf, THREE, { layeredMaterials: { BodyC01: { base, layer, composite } } });
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  scene.children[0].material.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vHomeLayerUv = \(homeLayerTransform \* vec3\(uv, 1\.0\)\)/);
  assert.equal(scene.children[0].material.map.channel, 1);
  const another = sceneFixture({ materials: [{ name: 'BodyC01', extras: { homeLayerUv: { base: 1, layer: 0 } } }] });
  assert.throws(() => prepareHomeEffects(another.gltf, THREE, { layeredMaterials: {
    BodyC01: { base, layer, composite: { ...composite, layerCalcMulti: 1 } },
  } }), /textures unavailable/);
  assert.throws(() => prepareHomeEffects(another.gltf, THREE, { layeredMaterials: {
    BodyC01: { base, layer, composite: { ...composite, layerBlendMode: 2 } },
  } }), /textures unavailable/);
});

test('source layer flag variants require explicit review opt-in and return per-material disclosures', () => {
  for (const flags of [
    { layerCalcMulti: 0, layerOverLerpValue: 0, layerBlendMode: 0 },
    { layerCalcMulti: 0, layerOverLerpValue: 1.5, layerBlendMode: 0 },
    { layerCalcMulti: 1, layerOverLerpValue: 1, layerBlendMode: 0 },
  ]) {
    const { gltf, clip } = sceneFixture({ materials: [{ name: 'BodyLayer', extras: { homeLayerUv: { base: 0, layer: 1 } } }] });
    const base = new THREE.Texture(), layer = new THREE.Texture();
    base.channel = 0; layer.channel = 1;
    const composite = { equation: 'atlas-alpha-over-review', baseUv: 0, layerUv: 1, ...flags };
    const options = { layeredMaterials: { BodyLayer: { base, layer, composite } } };
    const originalDuration = clip.duration;
    assert.throws(() => prepareHomeEffects(gltf, THREE, options), /textures unavailable/);
    assert.equal(clip.duration, originalDuration);
    const runtime = prepareHomeEffects(gltf, THREE, { ...options, allowReviewLayerApproximation: true });
    assert.equal(runtime.layerApproximations.length, 1);
    assert.deepEqual(runtime.layerApproximations[0].sourceFlags, flags);
    assert.equal(runtime.layerApproximations[0].sourceSettingsDiffer, true);
    assert.equal(runtime.layerApproximations[0].renderEquation, 'source-layer-interpolation-review');
    assert.match(runtime.layerApproximations[0].disclosure, /Review approximation.*original layered shader equation is unverified/);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    gltf.scene.children[0].material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /mix\(homeBase\.rgb, homeLayer\.rgb, homeLayerWeight\)/);
    assert.match(shader.fragmentShader, /clamp\(homeLayer\.a \* clamp\(homeLayerOverLerp, 0\.0, 1\.0\)/);
    assert.equal(shader.uniforms.homeLayerOverLerp.value, flags.layerOverLerpValue);
    runtime.dispose();
    assert.equal(clip.duration, originalDuration);
  }
});

test('strict path retains its previous composite while opted-in review uses pinned layer colors', () => {
  // Center texels are from the pinned original base/layer PNGs. Both alpha
  // channels are 255, so weighting by base alpha hides every layer color.
  const sourceCenters = [
    [990, [68, 64, 61, 255], [255, 71, 67, 255]],
    [992, [79, 74, 74, 255], [251, 210, 20, 255]],
    [993, [86, 124, 168, 255], [253, 70, 201, 255]],
    [1006, [241, 239, 239, 255], [255, 61, 135, 255]],
    [1008, [44, 44, 52, 255], [164, 153, 255, 255]],
    [1022, [79, 74, 74, 255], [255, 179, 16, 255]],
  ];
  for (const [id, basePixel, layerPixel] of sourceCenters) {
    const weight = Math.min(1, Math.max(0, layerPixel[3] / 255 * 1));
    const reviewRgb = basePixel.slice(0, 3).map((channel, index) =>
      Math.round(channel * (1 - weight) + layerPixel[index] * weight));
    assert.deepEqual(reviewRgb, layerPixel.slice(0, 3), `source layer center color #${id}`);
    assert.notDeepEqual(reviewRgb, basePixel.slice(0, 3), `source base center color #${id}`);
  }
  const { gltf, scene } = sceneFixture({ materials: [
    { name: 'BodyLayer', extras: { homeLayerUv: { base: 0, layer: 1 } } },
  ] });
  const base = new THREE.Texture(), layer = new THREE.Texture();
  base.channel = 0; layer.channel = 1;
  const composite = { equation: 'atlas-alpha-over-review', baseUv: 0, layerUv: 1,
    layerCalcMulti: 0, layerOverLerpValue: 1, layerBlendMode: 0 };
  const strict = prepareHomeEffects(gltf, THREE, { layeredMaterials: { BodyLayer: { base, layer, composite } } });
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  scene.children[0].material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /homeBase\.rgb \* homeBase\.a \+ homeLayer\.rgb \* \(1\.0 - homeBase\.a\)/);
  assert.equal(strict.layerApproximations[0].renderEquation, 'atlas-alpha-over-review');
  strict.dispose();
});

test('review opt-in still rejects unknown source equations, flags and metadata', () => {
  const base = new THREE.Texture(), layer = new THREE.Texture();
  base.channel = 0; layer.channel = 1;
  const valid = { equation: 'atlas-alpha-over-review', baseUv: 0, layerUv: 1,
    layerCalcMulti: 0, layerOverLerpValue: 1, layerBlendMode: 0 };
  for (const composite of [
    { ...valid, equation: 'source-exact' }, { ...valid, layerBlendMode: 2 },
    { ...valid, layerCalcMulti: 2 }, { ...valid, layerOverLerpValue: 0.7 },
    { ...valid, unknownFlag: 1 }, { ...valid, layerOverLerpValue: Number.NaN },
  ]) {
    const { gltf } = sceneFixture({ materials: [{ name: 'BodyLayer', extras: { homeLayerUv: { base: 0, layer: 1 } } }] });
    assert.throws(() => prepareHomeEffects(gltf, THREE, { allowReviewLayerApproximation: true,
      layeredMaterials: { BodyLayer: { base, layer, composite } } }), /textures unavailable/);
  }
  const { gltf } = sceneFixture();
  assert.throws(() => prepareHomeEffects(gltf, THREE, { allowReviewLayerApproximation: 'yes' }), /Invalid HOME review option/);
});

test('missing source layers, bad visibility and unmatched stencil fail before scene mutation', () => {
  for (const fixture of [
    sceneFixture({ materials: [{ name: 'BodyBPara', extras: { homeLayerUv: { base: 0, layer: 1 } } }] }),
    sceneFixture({ visibility: [{ name: 'bad', times: [0, 1, 0.8], values: [false, true, false] }] }),
    sceneFixture({ materials: [{ name: 'core', extras: { homeStencil: { role: 'core', ref: 1 } } }] }),
  ]) {
    const length = fixture.clip.tracks.length, duration = fixture.clip.duration;
    assert.throws(() => prepareHomeEffects(fixture.gltf, THREE), /textures unavailable|Invalid HOME visibility|Unpaired HOME stencil/);
    assert.equal(fixture.clip.tracks.length, length);
    assert.equal(fixture.clip.duration, duration);
  }
});

test('source mask-only helper geometry writes no visible color and needs no invented core', () => {
  const { gltf, scene } = sceneFixture({ materials: [
    { name: 'helper-mask', extras: { homeStencil: { role: 'mask', ref: 2 } } },
  ] });
  prepareHomeEffects(gltf, THREE);
  assert.equal(scene.children[0].material.colorWrite, false);
});

test('preload inspection routes only effect-bearing assets to stencil-capable renderer', () => {
  assert.equal(inspectHomeEffects({ materials: [{}], nodes: [{}] }).needsCustomRenderer, false);
  assert.equal(inspectHomeEffects({ materials: [{ extras: { homeStencil: { role: 'core', ref: 1 } } }] }).stencil, true);
  assert.equal(inspectHomeEffects({ nodes: [{ extras: { homeVisibility: { times: [0], values: [true] } } }] }).visibility, true);
  assert.equal(inspectHomeEffects({ materials: [{ name: 'BodyBPara' }] }, ['BodyBPara']).needsCustomRenderer, true);
});

test('teardown uncaches the mixer and restores original clip duration and tracks', () => {
  const { gltf, clip } = sceneFixture({ visibility: [
    { name: 'liquid', times: [0, 1, 2], values: [false, true, false] },
  ] });
  const originalDuration = clip.duration;
  const runtime = prepareHomeEffects(gltf, THREE);
  assert.throws(() => prepareHomeEffects(gltf, THREE), /already prepared/);
  runtime.dispose(); runtime.dispose();
  assert.equal(clip.duration, originalDuration);
  assert.equal(clip.tracks.length, 1);
});

test('custom renderer explicitly requests and verifies a stencil buffer', () => {
  let parameters, disposed = false;
  class FakeRenderer {
    constructor(input) { parameters = input; }
    getContext() { return { getContextAttributes: () => ({ stencil: true }) }; }
    dispose() { disposed = true; }
  }
  const canvas = {};
  createHomeRenderer({ WebGLRenderer: FakeRenderer }, { canvas, alpha: true });
  assert.deepEqual(parameters, { canvas, alpha: true, stencil: true });
  assert.equal(disposed, false);
  class NoStencil extends FakeRenderer {
    getContext() { return { getContextAttributes: () => ({ stencil: false }) }; }
  }
  assert.throws(() => createHomeRenderer({ WebGLRenderer: NoStencil }, { canvas }), /stencil buffer unavailable/);
  assert.equal(disposed, true);
});
