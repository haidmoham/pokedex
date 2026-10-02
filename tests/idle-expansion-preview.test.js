import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isProtectedIdleExpansionPreview, isProtectedFullReviewPreview, isProtectedModelPreview, IDLE_EXPANSION_REF,
  VERIFIED_IDLE_EXPANSION_BRANCH_URL, VERIFIED_FULL_REVIEW_BRANCH_URL } from '../scripts/preview-model-context.js';
import { PUBLIC_MODEL_MANIFEST_SHA256, verifyPublicModelManifest, publicModelAsset } from '../scripts/public-model-release.js';

test('three-model admission gate remains closed while the distinct whole-catalog review gate is exact and SSO-bound', () => {
  assert.equal(VERIFIED_IDLE_EXPANSION_BRANCH_URL, null);
  const newBranch = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: IDLE_EXPANSION_REF,
    VERCEL_BRANCH_URL: 'pokedex-review-git-codex-pokedex-full-coverage-20261002-zarnab.vercel.app' };
  assert.equal(isProtectedIdleExpansionPreview(newBranch), false);
  assert.equal(isProtectedFullReviewPreview(newBranch), true);
  assert.equal(isProtectedModelPreview(newBranch), true);
  assert.equal(VERIFIED_FULL_REVIEW_BRANCH_URL, newBranch.VERCEL_BRANCH_URL);
  assert.equal(isProtectedIdleExpansionPreview({ ...newBranch, VERCEL_ENV: 'production' }), false);
  for (const wrong of [{ ...newBranch, VERCEL_ENV: 'production' }, { ...newBranch, VERCEL_GIT_COMMIT_REF: 'main' },
    { ...newBranch, VERCEL_BRANCH_URL: 'unrelated.vercel.app' }]) assert.equal(isProtectedFullReviewPreview(wrong), false);
});

test('candidate replacements are exact, separate from the 998-model public release, and native', async () => {
  const approvedBytes = await readFile(new URL('../content/models/protected-preview.json', import.meta.url));
  verifyPublicModelManifest(approvedBytes);
  const base = JSON.parse(approvedBytes).assets;
  const expansion = JSON.parse(await readFile(new URL('../content/models/idle-expansion-preview-2026-10-02.json', import.meta.url)));
  assert.equal(expansion.baseManifestSha256, PUBLIC_MODEL_MANIFEST_SHA256);
  assert.deepEqual(expansion.assets.map(asset => asset.id), [162, 163, 164]);
  const normal = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
  for (const asset of expansion.assets) {
    const replaced = normal.find(entry => entry.id === asset.id && entry.admitted);
    assert.equal(replaced?.animation, null);
    assert.equal(asset.replacesSha256, replaced?.sha256);
    assert.equal(asset.animation, 'HOME Idle');
    assert.equal(asset.previewOnly, true);
    assert.equal(asset.rightsStatus, 'unresolved');
    assert.equal(asset.poseReview?.sha256, asset.sha256);
    assert.equal(asset.framingReview?.sha256, asset.sha256);
    assert.equal(asset.framingReview?.cameraOrbitPercent, asset.cameraOrbitPercent);
    assert.ok(asset.framingReview?.maxNormalizedScreenExtent <= 0.95);
    assert.equal(asset.framingReview?.gpuPlaybackVerified, false);
    assert.equal(asset.poseReview?.poses.length, 3);
  }
  const publicEffective = new Map([...normal, ...base.map(publicModelAsset)].filter(asset => asset.admitted).map(asset => [asset.id, asset]));
  const previewEffective = new Map([...publicEffective.values(), ...expansion.assets].map(asset => [asset.id, asset]));
  assert.equal(publicEffective.size, 998);
  assert.equal([...publicEffective.values()].filter(asset => asset.animation).length, 547);
  assert.equal(previewEffective.size, 998);
  assert.equal([...previewEffective.values()].filter(asset => asset.animation).length, 550);
});
