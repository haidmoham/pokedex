// The extracted-asset exception is confined to verified review URLs.
// Production and unrelated previews never import unreviewed runtime entries.
export const IDLE_EXPANSION_REF = 'codex/pokedex-full-coverage-20261002';
// Remains closed until this exact branch's Vercel URL is observed and its SSO
// protection is verified. A branch name alone is never sufficient.
export const VERIFIED_IDLE_EXPANSION_BRANCH_URL = null;
export const VERIFIED_FULL_REVIEW_BRANCH_URL = 'pokedex-review-git-codex-pokedex-full-coverage-20261002-zarnab.vercel.app';
export const ALT_FORM_REF = 'codex/pokedex-alt-forms-20261002';
// This exact branch alias redirected to Vercel SSO on 2026-10-02.
export const VERIFIED_ALT_FORM_BRANCH_URL = 'pokedex-review-git-codex-pokedex-alt-forms-20261002-zarnab.vercel.app';
export function isProtectedFormPreview(env = process.env) {
  return (env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === ALT_FORM_REF &&
    VERIFIED_ALT_FORM_BRANCH_URL !== null && env.VERCEL_BRANCH_URL === VERIFIED_ALT_FORM_BRANCH_URL) ||
    (!env.VERCEL_ENV && env.POKEDEX_FORM_PREVIEW === '2026-10-02-forms');
}
export function isProtectedFullReviewPreview(env = process.env) {
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === IDLE_EXPANSION_REF &&
    env.VERCEL_BRANCH_URL === VERIFIED_FULL_REVIEW_BRANCH_URL;
}
export function isProtectedIdleExpansionPreview(env = process.env) {
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === IDLE_EXPANSION_REF &&
    VERIFIED_IDLE_EXPANSION_BRANCH_URL !== null && env.VERCEL_BRANCH_URL === VERIFIED_IDLE_EXPANSION_BRANCH_URL;
}
export function isProtectedModelPreview(env = process.env) {
  return (env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === 'codex/model-idle-expansion' &&
    env.VERCEL_BRANCH_URL === 'pokedex-review-git-codex-model-idle-expansion-zarnab.vercel.app') ||
    isProtectedIdleExpansionPreview(env) || isProtectedFullReviewPreview(env);
}
