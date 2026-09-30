// Embedded terms are uploader evidence; underlying character rights stay unknown.
export function assetUseTerms(provenance = {}) {
  if (!provenance.author || !provenance.source || !provenance.license) return null;
  const license = /^CC-BY(?:-SA)?-4\.0 \(https?:\/\/creativecommons\.org\/licenses\/(by|by-sa)\/4\.0\/\)$/.exec(provenance.license);
  if (!license) return null;
  return { license: provenance.license, attribution: provenance.author, source: provenance.source,
    evidence: 'embedded uploader claim', derivativesPermitted: true,
    shareAlike: license[1] === 'by-sa', underlyingRights: 'unknown' };
}

export function selectedIdle(names) {
  return names.find(name => /defaultwait01_loop$/i.test(name ?? '')) ??
    names.find(name => /^(idle|standing idle)$/i.test(name ?? '')) ?? null;
}

export function proposedAdmission(source, overrides = {}) {
  const terms = assetUseTerms(source.provenance);
  if (!terms || source.id === 1000) return null;
  return { id: source.id, bytes: source.bytes, blobSha: source.blobSha, sha256: source.sha256, url: source.url,
    credit: terms.attribution, license: terms.license, source: terms.source,
    animation: selectedIdle(source.animations ?? []), assetUseTerms: terms,
    machineChecked: source.status === 'machine-candidate', textureDecoded: false,
    ...overrides, assetUseTerms: terms, visualReviewed: false, admitted: false };
}
