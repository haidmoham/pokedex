import { INTEGRATED_MODEL_RELEASE } from './public-model-release.js';

export const FORM_RELEASE = '2026-10-02-120';
// The owner's approval covers only the 120 hash-pinned forms in the catalog.
// Vercel previews still require their separate exact protected alias.
export function isPublicFormRelease(env = process.env) {
  return env.POKEDEX_FORM_RELEASE === FORM_RELEASE &&
    env.POKEDEX_MODEL_RELEASE === INTEGRATED_MODEL_RELEASE && env.VERCEL_ENV !== 'preview';
}
