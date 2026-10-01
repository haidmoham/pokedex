import { createHash } from 'node:crypto';
export const PUBLIC_MODEL_RELEASE = '2026-10-01-998';
// Exact reviewed inventory from 9651ef6; later research batches need separate admission.
export const PUBLIC_MODEL_MANIFEST_SHA256 = '69264fdafa834db8dc0d946901971ac01b0f1a3ae1f7dc820f7bbc5c1076e4a4';
export function isPublicModelRelease(env = process.env) {
  return env.POKEDEX_MODEL_RELEASE === PUBLIC_MODEL_RELEASE;
}
export function verifyPublicModelManifest(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== PUBLIC_MODEL_MANIFEST_SHA256) {
    throw Error('Public model inventory differs from the approved 998-species release');
  }
}
export function publicModelAsset(asset) {
  return { ...asset, previewOnly: false, publicRelease: PUBLIC_MODEL_RELEASE,
    license: 'Redistribution rights unresolved. Extracted Pokemon asset; not CC-BY or MIT-licensed.' };
}
