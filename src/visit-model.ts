import { CardEdition, officialEdition, Pokemon, rankedCards } from './feed-model';

// A visit is view state. Network responses may enrich its library, but they
// cannot pick a new lead or reorder anything the visitor has already seen.
export type Visit = {
  speciesId: number;
  ids: string[];
  selectedId: string;
  context?: string;
};

export function createVisit(species: Pokemon, available: CardEdition[], currency: string, targetId?: string, context?: string): Visit {
  const eligible = available.filter(card => card.cardId !== `official-${species.id}` &&
    [card.pokemonId, ...(card.pokemonIds ?? [])].includes(species.id));
  const ids = [...new Set([...rankedCards(eligible, currency).map(card => card.cardId), officialEdition(species).cardId])];
  // An explicit portfolio tile is always the viewed card, even when a newer
  // market value would have led an ordinary visit.
  if (targetId && !ids.includes(targetId)) ids.push(targetId);
  return { speciesId: species.id, ids, selectedId: targetId ?? ids[0], context };
}

export function appendVisit(visit: Visit, available: CardEdition[]): Visit {
  const seen = new Set(visit.ids);
  const added = available.filter(card => [card.pokemonId, ...(card.pokemonIds ?? [])].includes(visit.speciesId) && !seen.has(card.cardId))
    .map(card => card.cardId).sort();
  return added.length ? { ...visit, ids: [...visit.ids, ...new Set(added)] } : visit;
}

export function selectVisit(visit: Visit, cardId: string): Visit {
  return visit.ids.includes(cardId) ? { ...visit, selectedId: cardId } : visit;
}

export function stepVisit(visit: Visit, direction: number): Visit {
  const index = visit.ids.indexOf(visit.selectedId);
  const next = index + direction;
  return next < 0 || next >= visit.ids.length ? visit : { ...visit, selectedId: visit.ids[next] };
}
