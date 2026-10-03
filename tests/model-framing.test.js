import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { framingDistance, inspectionDistance } from '../src/model-framing.js';

test('compact, tall, wide and long animated envelopes fit both viewport planes with shared padding', () => {
  for (const size of [{x:1,y:1,z:1}, {x:0.3,y:8,z:0.6}, {x:12,y:1,z:2}, {x:1,y:2,z:14}]) {
    for (const aspect of [320/430, 390/520, 1280/330, 740/160]) {
      for (const inspect of [false, true]) {
        for (const theta of inspect ? [-180,-90,0,90,180] : [-12]) {
          const phi = inspect ? 35 : 85;
          const distance = inspect ? inspectionDistance(size, aspect) : framingDistance(size, aspect, theta, phi);
          const camera = new THREE.PerspectiveCamera(35, aspect, 0.00001, distance * 10);
          camera.position.setFromSpherical(new THREE.Spherical(distance, phi*Math.PI/180, theta*Math.PI/180));
          camera.lookAt(0,0,0); camera.updateMatrixWorld();
          let edge = 0;
          for (const x of [-size.x/2,size.x/2]) for (const y of [-size.y/2,size.y/2]) for (const z of [-size.z/2,size.z/2]) {
            const point = new THREE.Vector3(x,y,z).project(camera);
            assert.ok(Math.abs(point.x) <= 0.880001 && Math.abs(point.y) <= 0.880001);
            assert.ok(point.z < 1 && point.z > -1);
            edge = Math.max(edge, Math.abs(point.x), Math.abs(point.y));
          }
          if (!inspect) assert.ok(Math.abs(edge - 0.88) < 0.000001, 'same maximum viewport occupancy for every proportion');
        }
      }
    }
  }
});

test('framing preserves proportional source units and rejects unusable bounds', () => {
  const size = {x:2,y:3,z:4};
  assert.ok(Math.abs(framingDistance({x:20,y:30,z:40},1) / framingDistance(size,1) - 10) < 1e-9);
  for (const invalid of [{x:0,y:0,z:0}, {x:NaN,y:1,z:1}, {x:-1,y:1,z:1}]) assert.throws(() => framingDistance(invalid,1));
});
