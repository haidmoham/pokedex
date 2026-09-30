export function runtimeManifest(entries) {
  return entries.map(({ id, bytes, url, blobSha, sha256, credit, license, source, animation, admitted }) =>
    ({ id, bytes, url, blobSha, sha256, credit, license, source, animation: animation ?? null, admitted }));
}
