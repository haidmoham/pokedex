import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUseTerms, proposedAdmission, selectedIdle } from '../scripts/model-candidate-policy.js';
import { geometryValuesHash } from '../scripts/model-pipeline/geometry.mjs';
const provenance = { author: 'Uploader', source: 'https://sketchfab.com/3d-models/example', license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)' };
test('derivative terms preserve attribution and distinguish underlying rights', () => {
  assert.equal(assetUseTerms(provenance).underlyingRights, 'unknown');
  assert.equal(assetUseTerms(provenance).attribution, 'Uploader');
  for (const license of ['MIT', 'missing', 'SKETCHFAB Standard (https://sketchfab.com/licenses)', 'CC-BY-NC-4.0 (http://creativecommons.org/licenses/by-nc/4.0/)', 'CC-BY-NC-ND-4.0 (http://creativecommons.org/licenses/by-nc-nd/4.0/)']) assert.equal(assetUseTerms({ ...provenance, license }), null);
  assert.equal(assetUseTerms({ ...provenance, author: '' }), null);
  assert.equal(assetUseTerms({ ...provenance, license: 'CC-BY-SA-4.0 (http://creativecommons.org/licenses/by-sa/4.0/)' }).shareAlike, true);
});
test('machine candidates never become visual or runtime admissions', () => {
  const source = { id: 25, status: 'machine-candidate', provenance, animations: ['attack', 'idle'], bytes: 100 };
  const candidate = proposedAdmission(source);
  assert.equal(candidate.machineChecked, true);
  assert.equal(candidate.visualReviewed, false);
  assert.equal(candidate.textureDecoded, false);
  assert.equal(candidate.admitted, false);
  assert.equal(proposedAdmission(source, { admitted: true, visualReviewed: true }).admitted, false);
  assert.equal(proposedAdmission(source, { admitted: true, visualReviewed: true }).visualReviewed, false);
  assert.equal(proposedAdmission({ ...source, id: 1000 }), null);
});
test('idle selection does not infer action clips or arbitrary first animations', () => {
  assert.equal(selectedIdle(['attack', 'pm0150_00_00_00000_defaultwait01_loop']), 'pm0150_00_00_00000_defaultwait01_loop');
  assert.equal(selectedIdle(['attack', 'jump', 'defaultidle01']), null);
});
test('geometry comparison accepts index encoding changes and rejects reversed winding or altered attributes', () => {
  assert.equal(geometryValuesHash(new Uint16Array([1,2,3]), true), geometryValuesHash(new Uint32Array([2,3,1]), true));
  assert.equal(geometryValuesHash([1,2,1], true), geometryValuesHash([1,1,2], true));
  assert.notEqual(geometryValuesHash([1,2,3], true), geometryValuesHash([1,3,2], true));
  assert.notEqual(geometryValuesHash([0,1,2]), geometryValuesHash([0,1,2.01]));
});
