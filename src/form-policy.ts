import type { ModelAsset } from './model-policy';

export type FormCandidate = {
  id: string;
  speciesId: number;
  pokemonId: number;
  name: string;
  kind: 'mega' | 'regional';
  types: string[];
  model: {
    url: string;
    bytes: number;
    blobSha: string;
    sha256: string;
    animation: string;
    channels: number;
    duration: number;
    movingSamplers: number;
    decodedTextureBytes: number;
    transferException: boolean;
  };
  provenance: {
    family: 'HOME' | 'Pokemon-3D-api';
    credit?: string | { author: string; license: string; source: string; title: string };
    sourceTerms: string;
    geometry?: { path: string; sha256: string };
    nativeWait?: { path: string; sha256: string };
    path?: string;
  };
  review: { sourceIdentity: string; decodedResources: string; nativeAnimation: string; appearance: string; browserGpu: string; rights: string; publicRelease: boolean };
};

declare const __POKEDEX_FORM_ASSETS__: FormCandidate[];
const candidates = typeof __POKEDEX_FORM_ASSETS__ === 'undefined' ? [] : __POKEDEX_FORM_ASSETS__;
export const formPreviewEnabled = candidates.length === 120;

export function formsForSpecies(speciesId: number): FormCandidate[] {
  return formPreviewEnabled ? candidates.filter(form => form.speciesId === speciesId) : [];
}

export function formModelAsset(form: FormCandidate): ModelAsset | undefined {
  if (!formPreviewEnabled || !candidates.includes(form) ||
    !/^[a-z0-9-]+$/.test(form.id) ||
    form.model.url !== `https://raw.githubusercontent.com/rrih/rrih.github.io/ef25889c60f099aa864bed11042f4054827a78c4/atlas/public/models/forms/${form.id}.glb` ||
    !Number.isInteger(form.model.bytes) || form.model.bytes <= 0 || form.model.bytes > 2_000_000 ||
    !/^[a-f0-9]{40}$/.test(form.model.blobSha) || !/^[a-f0-9]{64}$/.test(form.model.sha256) ||
    !Number.isInteger(form.model.channels) || form.model.channels <= 0 ||
    !Number.isFinite(form.model.duration) || form.model.duration <= 0 ||
    form.model.movingSamplers <= 0 || form.review.decodedResources !== 'cpu-pass' ||
    form.review.sourceIdentity !== 'verified' || form.review.publicRelease !== false) return undefined;
  const external = form.provenance.family === 'Pokemon-3D-api';
  const credit = external && typeof form.provenance.credit === 'object'
    ? `${form.provenance.credit.author}; original Pokémon rights reserved`
    : 'Pokémon / Nintendo / Creatures / GAME FREAK; HOME extraction by Lilothestitch16; web reconstruction by rrih';
  return {
    id: form.speciesId, formId: form.id, bytes: form.model.bytes, url: form.model.url,
    blobSha: form.model.blobSha, sha256: form.model.sha256, admitted: false,
    previewOnly: true, reviewOnly: true, animation: form.model.animation,
    runtime: external ? undefined : 'home-canvas', credit,
    license: 'Source-authored form idle; browser appearance and extracted-asset rights unresolved',
    source: external && typeof form.provenance.credit === 'object'
      ? form.provenance.credit.source : form.model.url,
    rightsStatus: 'unresolved',
  };
}
