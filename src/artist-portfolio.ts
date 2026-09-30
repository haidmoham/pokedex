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

class PortfolioResponseError extends Error {}
export function portfolioResponseError(status: number, body?: unknown) {
  const detail = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const code = typeof detail.code === 'string' && /^[A-Z_]{1,60}$/.test(detail.code) ? detail.code : null;
  const reason = typeof detail.reason === 'string' && /^[a-z_]{1,40}$/.test(detail.reason) ? detail.reason : null;
  const keys = Array.isArray(detail.unexpectedKeys) ? detail.unexpectedKeys.filter((key): key is string => typeof key === 'string' && /^[a-zA-Z0-9_[\].-]{1,40}$/.test(key)).slice(0, 6) : [];
  const diagnostic = [`HTTP ${status}`, code, reason, keys.length ? `keys: ${keys.join(', ')}` : null].filter(Boolean).join(' · ');
  return `Portfolio request failed (${diagnostic}). Your loaded artwork is still here.`;
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
      // Native Window.fetch rejects a foreign receiver. Call the stored function
      // unbound, rather than as this.fetcher(), so browsers can start the request.
      const fetcher = this.fetcher;
      const response = await fetcher(`/api/artists/${encodeURIComponent(artist)}?offset=${offset}`, { signal: controller.signal });
      const contentType = response.headers?.get('content-type');
      if (!response.ok) {
        let detail: unknown;
        if (contentType?.includes('application/json')) {
          try { detail = await response.json(); } catch { /* keep the HTTP status */ }
        }
        throw new PortfolioResponseError(portfolioResponseError(response.status, detail));
      }
      if (contentType && !contentType.includes('application/json')) {
        throw new PortfolioResponseError(`Portfolio endpoint returned a web page instead of data (HTTP ${response.status}). Your loaded artwork is still here.`);
      }
      let page: PortfolioPage;
      try { page = await response.json(); }
      catch { throw new PortfolioResponseError(`Portfolio endpoint returned unreadable data (HTTP ${response.status}). Your loaded artwork is still here.`); }
      if (!current()) return false;
      if (controller.signal.aborted) throw new Error('request timed out');
      if (!page || typeof page !== 'object' || page.artist !== artist || page.offset !== offset || !Array.isArray(page.cards) || !Array.isArray(page.failed) || !Array.isArray(page.skipped) ||
        !Number.isInteger(page.total) || page.total < 0 || !Number.isInteger(page.scanned) || page.scanned < 0 || page.scanned > 12 ||
        (page.nextOffset !== null && (!Number.isInteger(page.nextOffset) || page.nextOffset <= offset))) throw new PortfolioResponseError('Portfolio data did not match the requested artist or page (HTTP 200). Your loaded artwork is still here.');
      state.pages[offset] = page;
      state.order = [...new Set([...state.order, ...page.cards.map(card => card.cardId)])];
      state.failedOffset = null;
      this.mergeCards(page.cards);
      return true;
    } catch (error) {
      if (current()) {
        state.error = timedOut ? 'The artist source took too long. Your loaded artwork is still here.' : error instanceof PortfolioResponseError ? error.message : 'Could not reach the portfolio endpoint (network error). Your loaded artwork is still here.';
        state.failedOffset = offset;
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (current()) { state.loading = false; this.controller = null; this.changed(); }
    }
  }
}
