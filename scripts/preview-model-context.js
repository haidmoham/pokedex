// The extracted-asset exception is confined to the authorized review branch.
// Production and unrelated previews never import its runtime entries.
export function isProtectedModelPreview(env = process.env) {
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === 'codex/model-idle-expansion' &&
    env.VERCEL_BRANCH_URL === 'pokedex-review-git-codex-model-idle-expansion-zarnab.vercel.app';
}
