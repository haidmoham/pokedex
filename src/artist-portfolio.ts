import type { CardEdition } from './feed-model';

export type PortfolioPage = {
  artist: string; cards: CardEdition[]; offset: number; nextOffset: number | null;
  total: number; scanned: number; failed: string[];
  skipped: { cardId: string; reason: string }[]; sourceUrl: string; fetchedAt: string;
};
export type PortfolioState = {
  pages: Record<number, PortfolioPage>; order: string[]; loading: boolean;
  error: string | null; failedOffset: number | null; scrollTop: number;
};
const emptyState = (): PortfolioState => ({ pages: {}, order: [], loading: false, error: null, failedOffset: null, scrollTop: 0 });
export function portfolioCoverage(state: PortfolioState) {
  const pages = Object.values(state.pages).sort((a, b) => a.offset - b.offset);
  let nextOffset: number | null = 0;
  const visited = new Set<number>();
  while (nextOffset !== null && state.pages[nextOffset] && !visited.has(nextOffset)) {
    visited.add(nextOffset);
    nextOffset = state.pages[nextOffset].nextOffset;
  }
  return {
    total: pages[0]?.total ?? null,
    scanned: pages.reduce((count, page) => count + page.scanned, 0),
    failed: [...new Set(pages.flatMap(page => page.failed))],
    skipped: [...new Map(pages.flatMap(page => page.skipped).map(item => [item.cardId, item])).values()],
    nextOffset,
    sourceUrl: pages[0]?.sourceUrl,
  };
}
export function portfolioCards(state: PortfolioState, library: CardEdition[], artist: string) {
  const matching = library.filter(card => card.artist === artist && card.sourceType !== 'official');
  const byId = new Map(matching.map(card => [card.cardId, card]));
  const seen = new Set<string>();
  return [...state.order, ...matching.map(card => card.cardId).sort()].flatMap(id => {
    const card = byId.get(id);
    if (!card || seen.has(id)) return [];
    seen.add(id); return [card];
  });
}
export function portfolioTarget(card: Pick<CardEdition, 'pokemonId' | 'pokemonIds'>, currentSpecies: number, validSpecies: Set<number>) {
  const ids = [...new Set([card.pokemonId, ...(card.pokemonIds ?? [])])].filter(id => validSpecies.has(id)).sort((a, b) => a - b);
  return ids.includes(currentSpecies) ? currentSpecies : ids[0];
}

// A session cache with one explicitly requested page at a time. Closing the
// drawer cancels transport and invalidates response ownership, even if a source
// ignores AbortSignal. Previously loaded pages and scroll position survive.
export class ArtistPortfolio {
  private states = new Map<string, PortfolioState>();
  private controller: AbortController | null = null;
  private session = 0;
  private request = 0;
  activeArtist: string | null = null;

  constructor(
    private changed: () => void,
    private mergeCards: (cards: CardEdition[]) => void,
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 65000,
  ) {}

  get(artist: string) { return this.states.get(artist) ?? emptyState(); }
  saveScroll(artist: string, scrollTop: number) {
    const state = this.states.get(artist);
    if (state) state.scrollTop = Math.max(0, scrollTop);
  }
  open(artist: string, loaded: CardEdition[]) {
    this.close();
    this.activeArtist = artist;
    const state = this.get(artist);
    state.order = [...new Set([...state.order, ...loaded.filter(card => card.artist === artist).map(card => card.cardId).sort()])];
    this.states.set(artist, state);
    this.changed();
    if (!Object.keys(state.pages).length) void this.loadPage(0);
  }
  close() {
    this.session++;
    this.controller?.abort(); this.controller = null;
    if (this.activeArtist) {
      const state = this.get(this.activeArtist);
      state.loading = false;
    }
    this.activeArtist = null;
    this.changed();
  }
  async loadMore() {
    if (!this.activeArtist) return;
    const next = portfolioCoverage(this.get(this.activeArtist)).nextOffset;
    if (next !== null) await this.loadPage(next);
  }
  async retryFailed() {
    const artist = this.activeArtist;
    if (!artist) return;
    const state = this.get(artist), session = this.session;
    const offsets = [...new Set([
      ...(state.failedOffset === null ? [] : [state.failedOffset]),
      ...Object.values(state.pages).filter(page => page.failed.length).map(page => page.offset),
    ])].sort((a, b) => a - b);
    for (const offset of offsets) {
      if (this.session !== session || this.activeArtist !== artist || !await this.loadPage(offset)) break;
    }
  }
  private async loadPage(offset: number) {
    const artist = this.activeArtist;
    if (!artist) return false;
    const state = this.get(artist);
    if (state.loading) return false;
    const session = this.session, request = ++this.request;
    const controller = new AbortController(); this.controller = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const current = () => this.session === session && this.request === request && this.activeArtist === artist;
    state.loading = true; state.error = null; this.changed();
    try {
      const response = await this.fetcher(`/api/artists/${encodeURIComponent(artist)}?offset=${offset}`, { signal: controller.signal });
      if (!response.ok) throw new Error('source unavailable');
      const page: PortfolioPage = await response.json();
      if (!current()) return false;
      if (controller.signal.aborted) throw new Error('request timed out');
      if (page.artist !== artist || page.offset !== offset || !Array.isArray(page.cards) || !Array.isArray(page.failed) || !Array.isArray(page.skipped) ||
        !Number.isInteger(page.total) || page.total < 0 || !Number.isInteger(page.scanned) || page.scanned < 0 || page.scanned > 12 ||
        (page.nextOffset !== null && (!Number.isInteger(page.nextOffset) || page.nextOffset <= offset))) throw new Error('invalid portfolio response');
      state.pages[offset] = page;
      state.order = [...new Set([...state.order, ...page.cards.map(card => card.cardId)])];
      state.failedOffset = null;
      this.mergeCards(page.cards);
      return true;
    } catch {
      if (current()) {
        state.error = timedOut ? 'The artist source took too long. Your loaded artwork is still here.' : 'The artist source is unavailable. Your loaded artwork is still here.';
        state.failedOffset = offset;
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (current()) { state.loading = false; this.controller = null; this.changed(); }
    }
  }
}
