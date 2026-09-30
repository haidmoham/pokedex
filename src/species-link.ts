export function linkedSpecies(search: string): number | null {
  const value = new URLSearchParams(search).get('pokemon');
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const id = Number(value);
  return id >= 1 && id <= 1025 ? id : null;
}

export function speciesLink(origin: string, id: number): string {
  if (!Number.isInteger(id) || id < 1 || id > 1025) throw new Error('Invalid national number');
  const url = new URL('/', origin);
  url.searchParams.set('pokemon', String(id));
  return url.href;
}

export function speciesAddress(href: string, id: number): string {
  speciesLink(href, id); // Apply the same national-number validation.
  const url = new URL(href);
  url.searchParams.set('pokemon', String(id));
  return url.href;
}
