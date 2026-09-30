import type { Pokemon } from './feed-model';

const generationEnds = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
export const generationOf = (id: number) => generationEnds.findIndex(end => id <= end) + 1;
export const searchName = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('♀', 'f').replaceAll('♂', 'm').replace(/[^a-z0-9]/g, '');
function oneEdit(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0, j = 0, differences = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++differences > 1) return false;
    if (left.length >= right.length) i++;
    if (right.length >= left.length) j++;
  }
  return differences + Number(i < left.length || j < right.length) <= 1;
}
export function searchSpecies(species: Pokemon[], query: string, type = 'all', generation = 'all', saved: number[] = [], savedOnly = false) {
  const text = query.trim();
  const numeric = /^#|^[+-]?\d/.test(text);
  const id = /^#?\s*\d+$/.test(text) ? Number(text.replace(/^#\s*/, '')) : NaN;
  const invalidNumber = numeric && (!Number.isSafeInteger(id) || id < 1 || id > 1025);
  if (invalidNumber) return { results: [], invalidNumber: true };
  const normalized = searchName(text);
  const score = (item: Pokemon) => {
    if (numeric) return item.id === id ? 0 : 9;
    const name = searchName(item.name);
    return !normalized || name === normalized ? 0 : name.startsWith(normalized) ? 1 : name.includes(normalized) ? 2 : normalized.length >= 4 && oneEdit(name, normalized) ? 3 : 9;
  };
  const results = species.filter(item => score(item) < 9 && (type === 'all' || item.types.includes(type)) &&
    (generation === 'all' || generationOf(item.id) === Number(generation)) && (!savedOnly || saved.includes(item.id)))
    .sort((left, right) => score(left) - score(right) || left.id - right.id);
  return { results, invalidNumber: false };
}
export function rememberSearchPick(recent: number[], id: number) {
  return Number.isInteger(id) && id >= 1 && id <= 1025 ? [id, ...recent.filter(value => value !== id)].slice(0, 8) : recent;
}
export function validRecentPicks(value: unknown): number[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 1025))].slice(0, 8) : [];
}
