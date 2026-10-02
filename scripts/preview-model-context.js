// The extracted-asset exception is confined to verified review URLs.
// Production and unrelated previews never import unreviewed runtime entries.
export const IDLE_EXPANSION_REF = 'codex/pokedex-full-coverage-20261002';
// Remains closed until this exact branch's Vercel URL is observed and its SSO
// protection is verified. A branch name alone is never sufficient.
export const VERIFIED_IDLE_EXPANSION_BRANCH_URL = null;
export function isProtectedIdleExpansionPreview(env = process.env) {
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === IDLE_EXPANSION_REF &&
    VERIFIED_IDLE_EXPANSION_BRANCH_URL !== null && env.VERCEL_BRANCH_URL === VERIFIED_IDLE_EXPANSION_BRANCH_URL;
}
export function isProtectedModelPreview(env = process.env) {
  return (env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === 'codex/model-idle-expansion' &&
    env.VERCEL_BRANCH_URL === 'pokedex-review-git-codex-model-idle-expansion-zarnab.vercel.app') ||
    isProtectedIdleExpansionPreview(env);
}
