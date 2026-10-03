import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleModelBounds } from '../src/model-bounds.js';
import { framingDistance } from '../src/model-framing.js';

test('animated skeletal horn and a brief keyframe peak fit around the motion center, not the rest center', async () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,0,0, 1,0,0, 0,5,0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(12).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const bone = new THREE.Bone(); bone.name = 'horn'; mesh.add(bone); mesh.bind(new THREE.Skeleton([bone]));
  const scene = new THREE.Group(); scene.add(mesh);
  const clip = new THREE.AnimationClip('idle', 1, [new THREE.VectorKeyframeTrack('horn.position', [0,0.02,1], [0,0,0, 0,8,0, 0,0,0])]);
  const mixer = new THREE.AnimationMixer(scene); mixer.clipAction(clip).play();
  const { size, center } = await sampleModelBounds(THREE, scene, mixer, 1, clip, new AbortController().signal);
  assert.ok(Math.abs(size.y - 13) < 1e-5, 'captures the short peak between regular samples');
  assert.ok(Math.abs(center.y - 6.5) < 1e-5, 'target contains all idle positions rather than following one pose');
  for (const aspect of [320/400, 390/560, 1280/300]) {
    const distance = framingDistance(size, aspect);
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.001, 1000);
    camera.position.setFromSpherical(new THREE.Spherical(distance,85*Math.PI/180,-12*Math.PI/180)).add(center);
    camera.lookAt(center); camera.updateMatrixWorld();
    for (const time of [0,0.01,0.02,0.5,0.99]) {
      mixer.setTime(time); scene.updateMatrixWorld(true);
      for (let index=0; index<3; index++) {
        const point = mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).project(camera);
        assert.ok(Math.abs(point.x) <= 0.88001 && Math.abs(point.y) <= 0.88001);
      }
    }
  }
  mixer.stopAllAction(); geometry.dispose(); mesh.material.dispose();
});

test('source root transforms and morph extrema contribute; invisible geometry cannot recenter the model', async () => {
  const scene = new THREE.Group(); scene.position.set(10,20,30); scene.scale.set(2,2,2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,0,0, 1,0,0, 0,1,0],3));
  geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([-1,0,0, 1,0,0, 0,4,0],3)];
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()); mesh.name='wing'; scene.add(mesh);
  const hidden=new THREE.Mesh(new THREE.BoxGeometry(100,100,100),new THREE.MeshBasicMaterial({opacity:0}));scene.add(hidden);
  const clip=new THREE.AnimationClip('idle',1,[new THREE.NumberKeyframeTrack('wing.morphTargetInfluences[0]',[0,0.5,1],[0,1,0])]);
  const mixer=new THREE.AnimationMixer(scene);mixer.clipAction(clip).play();
  const envelope=await sampleModelBounds(THREE,scene,mixer,1,clip);
  assert.deepEqual(envelope.size.toArray(),[4,8,0]);
  assert.deepEqual(envelope.center.toArray(),[10,24,30]);
  await assert.rejects(sampleModelBounds(THREE,scene,mixer,1,clip,AbortSignal.abort()),{name:'AbortError'});
  mixer.stopAllAction();geometry.dispose();mesh.material.dispose();hidden.geometry.dispose();hidden.material.dispose();
});
