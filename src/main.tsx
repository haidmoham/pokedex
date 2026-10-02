import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import speciesSnapshot from '../content/species.json';
import cardsSnapshot from '../content/cards.json';
import { ArtGallery } from './art-gallery';
import { useSnapScroll } from './use-snap-scroll';
import { cardSpeciesIds, mergeCardLibrary } from './card-library';
import { adjacentIndex, artwork, dexNumber, FeedPosition, nationalDex, officialEdition, recentPrice, rememberFailedImage, retryFailedImages } from './feed-model';
import type { CardEdition, Pokemon } from './feed-model';
import { ArtistPortfolio, portfolioCards, portfolioCoverage, portfolioTarget } from './artist-portfolio';
import { appendVisit, createVisit, prepareVisits, selectVisit, stepVisit, Visit } from './visit-model';
import { extendTrail, traverseTrail } from './trail-model';
import type { TrailCursor, TrailStep } from './trail-model';
import { admittedModel, modelEdition, modelPreviewEnabled, modelPublicReleaseEnabled, previewModelAttribution } from './model-policy';
import { ModelView } from './model-view';
import { searchSpecies, rememberSearchPick, validRecentPicks } from './search-model';
import { linkedSpecies, speciesLink, speciesAddress } from './species-link';
import './style.css';

const pokemon = nationalDex(speciesSnapshot as Pokemon[]);
const initialIndex = (linkedSpecies(location.search) ?? 1) - 1;
type Drawer = 'search' | 'details' | 'artist' | null;
type TrailResult = { card: CardEdition | null; context?: string; cursor: TrailCursor | null; exhausted: boolean; partial: boolean };
type Candidate = { key: string; state: 'loading' | 'ready' | 'search' | 'exhausted' | 'error'; card?: CardEdition; context?: string; cursor?: TrailCursor | null; error?: string; partial?: boolean };
type Route = { key: number; kind: Exclude<Drawer, null> | 'branch'; artist?: string; visit?: Visit; trail?: TrailStep[]; trailIndex?: number; cursor?: TrailCursor | null; scrollTop: number; focusId?: string; invoker?: HTMLElement | null; originIndex?: number; originLabel?: string };
type Discovery = { scanned: number; total: number; done: boolean; failed: number; error?: string };
function activeBranchIndex(stack: Route[]) {
  for (let index = stack.length - 1; index >= 0; index--) if (stack[index].kind === 'branch') return index;
  return -1;
}
const types = [...new Set(pokemon.flatMap(item => item.types))].sort();
const validSpecies = new Set(pokemon.map(item => item.id));
const exclusionLabels: Record<string, string> = {
  invalid_card_id: 'Invalid source card ID', missing_artist_credit: 'Artist credit missing',
  artist_credit_mismatch: 'Different illustrator credit', not_pokemon: 'Trainer or other non-Pokémon card',
  no_valid_species: 'No supported Pokémon species', invalid_artwork: 'Source artwork missing or invalid',
  missing_card_title: 'Card title missing',
};
const formatPrice = (card: CardEdition, currency: string) => {
  const price = recentPrice(card, currency);
  return price ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price.amount) : null;
};

function Icon({ name }: { name: 'search' | 'heart' | 'info' | 'close' | 'left' | 'right' | 'up' | 'down' | 'grid' | 'share' | 'shuffle' }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.1" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    left: <path d="m14 5-7 7 7 7" />,
    right: <path d="m10 5 7 7-7 7" />,
    up: <path d="m5 14 7-7 7 7" />,
    down: <path d="m5 10 7 7 7-7" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    shuffle: <><path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.5 0 3-1.6 4.5-4M14 8c1.5-1.4 2.6-2 4-2h3m-4-4 4 4-4 4" /></>,
    share: <><path d="M12 16V3m-4 4 4-4 4 4M7 11H4v10h16V11h-3" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const activePokemon = pokemon[activeIndex];
  const [shuffle, setShuffle] = useState(() => { try { return localStorage.getItem('pokedex.shuffle.v1') === 'true'; } catch { return false; } });
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  const shufflePast = useRef<number[]>([]);
  const shuffleNext = useRef<number | null>(null);
  if (shuffleNext.current === null) shuffleNext.current = drawSpecies(initialIndex);
  const shuffleCurrent = useRef(initialIndex);
  function rememberSpecies(index: number) {
    if (shuffleRef.current && index !== shuffleCurrent.current) {
      shufflePast.current = [...shufflePast.current.slice(-1999), shuffleCurrent.current];
      shuffleNext.current = drawSpecies(index);
    }
    shuffleCurrent.current = index;
  }
  function feedSlot(index: number) { return shuffleRef.current ? Number(shufflePast.current.length > 0) : index; }
  function placeFeed(feed: HTMLDivElement, index: number) {
    rememberSpecies(index);
    feedPosition.current.jump(feed, feedSlot(index), shuffleRef.current ? 2 + Number(shufflePast.current.length > 0) : pokemon.length);
  }
  const feedIndices: number[] = shuffle ? [...shufflePast.current.slice(-1), activeIndex, shuffleNext.current!] : pokemon.map((_, index) => index);
  const feedSelected = shuffle ? Number(shufflePast.current.length > 0) : activeIndex;
  function drawSpecies(current: number) {
    const draw = Math.floor(Math.random() * (pokemon.length - 1));
    return draw >= current ? draw + 1 : draw;
  }
  function toggleShuffle() {
    setInspectingModel(false);
    shufflePast.current = [];
    shuffleCurrent.current = activeIndexRef.current;
    shuffleNext.current = drawSpecies(activeIndexRef.current);
    const next = !shuffle;
    try { localStorage.setItem('pokedex.shuffle.v1', String(next)); } catch { /* Session mode still works. */ }
    setShuffle(next);
  }
  const [allCards, setAllCards] = useState<CardEdition[]>(cardsSnapshot as CardEdition[]);
  const [, redrawPortfolio] = useState(0);
  const [portfolio] = useState(() => new ArtistPortfolio(() => redrawPortfolio(version => version + 1), incoming => setAllCards(previous => mergeCardLibrary(previous, incoming))));
  const [visits, setVisits] = useState<Record<number, Visit>>(() => prepareVisits({}, pokemon.slice(Math.max(0, initialIndex - 1), initialIndex + 2), cardsSnapshot as CardEdition[], 'USD'));
  const visitsRef = useRef(visits);
  visitsRef.current = visits;
  const [currency, setCurrency] = useState('USD');
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('pokedex.favorites.v1') || '[]');
      return Array.isArray(saved) ? saved.filter((id): id is number => Number.isInteger(id) && pokemon.some(item => item.id === id)) : [];
    } catch { return []; }
  });
  const [routes, setRoutes] = useState<Route[]>([]);
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const routeKey = useRef(0);
  const timeline = useRef<Route[][]>([[]]);
  const drawer: Drawer = routes.at(-1)?.kind === 'branch' ? null : (routes.at(-1)?.kind as Drawer ?? null);
  const activeArtist = routes.at(-1)?.artist ?? '';
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [generation, setGeneration] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recentPicks, setRecentPicks] = useState<number[]>(() => { try { return validRecentPicks(JSON.parse(localStorage.getItem('pokedex.recent.v1') ?? '[]')); } catch { return []; } });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [discovery, setDiscovery] = useState<Record<number, Discovery>>({});
  const [discoveryRetry, setDiscoveryRetry] = useState(0);
  const [manifestFailed, setManifestFailed] = useState(false);
  const [error, setError] = useState('');
  const [artMoving, setArtMoving] = useState(false);
  const [inspectingModel, setInspectingModel] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [manualShare, setManualShare] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const candidateRequest = useRef(0);
  const candidateAbort = useRef<AbortController | null>(null);
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  // Session-only circuit breaker: no retries on navigation, only a deliberate button.
  const [failedModels, setFailedModels] = useState<number[]>([]);
  const [rendererUnavailable, setRendererUnavailable] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const completedDiscovery = useRef(new Set<number>());
  const speciesScroll = useSnapScroll({ axis: 'x', selected: feedSelected, length: feedIndices.length, alignmentKey: activeIndex, suspended: Boolean(drawer) || inspectingModel,
    onMotion: () => {}, onSelect: index => {
      if (drawerRef.current || feedPosition.current.locked) return;
      if (shuffle) { moveSpecies(index > feedSelected ? 1 : -1); return; }
      feedPosition.current.index = index;
      activeIndexRef.current = index; setActiveIndex(index); setHasScrolled(true); enterSpecies(index);
    } });
  const feedRef = speciesScroll.scroller;
  const overlayRef = useRef<HTMLDivElement>(null);
  const [modelControlsTarget, setModelControlsTarget] = useState<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drawerScrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const libraryRef = useRef(allCards);
  libraryRef.current = allCards;
  const activeIndexRef = useRef(initialIndex);
  const feedPosition = useRef(new FeedPosition());
  const drawerRef = useRef<Drawer>(null);
  const baseIndex = useRef(initialIndex);

  useLayoutEffect(() => {
    if (feedRef.current) feedPosition.current.jump(feedRef.current, feedSelected, feedIndices.length);
  }, []);

  useEffect(() => {
    setShareStatus(''); setManualShare('');
    // Update the address without adding history entries or losing drawer depth.
    history.replaceState(history.state, '', speciesAddress(location.href, activePokemon.id));
  }, [activePokemon.id]);

  async function shareSpecies(invoker: HTMLElement) {
    const url = speciesLink(location.origin, activePokemon.id);
    setShareStatus('');
    try {
      if (navigator.share) {
        await navigator.share({ title: `${activePokemon.name} · pokédex`, text: 'a pokédex you can doomscroll', url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus('Species link copied');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setManualShare(url);
      openDrawer('details', undefined, invoker);
      setShareStatus('Copy the species link below');
    }
  }

  // Prepare the same edition that will be selected when the incoming slide
  // becomes active. It must not replace a visible official image mid-swipe.
  useLayoutEffect(() => {
    setVisits(old => prepareVisits(old, pokemon.slice(Math.max(0, activeIndex - 1), activeIndex + 2), libraryRef.current, currency));
  }, [activeIndex, currency]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const feed = feedRef.current;
    if (!overlay || !feed) return;
    const reserveCaption = () => feed.style.setProperty('--art-bottom', `${overlay.getBoundingClientRect().height + 12}px`);
    reserveCaption();
    const resize = new ResizeObserver(reserveCaption);
    resize.observe(overlay);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/cards', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('unavailable');
      return await response.json() as CardEdition[];
    }).then(cards => setAllCards(previous => mergeCardLibrary(cards, previous)))
      .catch(() => { if (!controller.signal.aborted) setManifestFailed(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const recoverImages = () => setBrokenImages(images => retryFailedImages(images));
    window.addEventListener('online', recoverImages);
    return () => window.removeEventListener('online', recoverImages);
  }, []);

  const branch = [...routes].reverse().find(route => route.kind === 'branch');
  const trail = branch?.trail;
  const trailIndex = branch?.trailIndex ?? -1;
  const activeVisit = branch?.visit ?? visits[activePokemon.id] ?? createVisit(activePokemon, allCards, currency);
  const cards = activeVisit.ids.map(id => allCards.find(item => item.cardId === id) ?? (id === `official-${activePokemon.id}` ? officialEdition(activePokemon) : id === `model-${activePokemon.id}` ? modelEdition(activePokemon) : undefined)).filter((item): item is CardEdition => !!item);
  const card = cards.find(item => item.cardId === activeVisit.selectedId) ?? cards[0];
  const cardIndex = cards.findIndex(item => item.cardId === card.cardId);
  const atEnd = trail ? trailIndex === trail.length - 1 : cardIndex === cards.length - 1;
  const edgeCard = trail ? card : cards.at(-1)!;
  const nearEnd = trail ? atEnd : cardIndex >= cards.length - 2;
  const continuationCursor: TrailCursor | null = branch?.cursor === undefined
    ? { artist: edgeCard.artist, speciesId: activePokemon.id, phase: ['official', 'model'].includes(edgeCard.sourceType ?? '') ? 'species' : 'artist', offset: 0, position: 0 }
    : branch.cursor;
  const preparationKey = !drawer && nearEnd
    ? `${branch?.key ?? 'base'}:${activePokemon.id}:${edgeCard.cardId}:${JSON.stringify(continuationCursor)}` : '';
  const continuationKey = atEnd ? preparationKey : '';
  const price = recentPrice(card, currency);
  const status = discovery[activePokemon.id];
  const artistState = portfolio.get(activeArtist);
  const artistCards = portfolioCards(artistState, allCards, activeArtist);
  const artistCoverage = portfolioCoverage(artistState);
  const search = useMemo(() => searchSpecies(pokemon, query, type, generation, favorites, favoritesOnly), [query, type, generation, favorites, favoritesOnly]);
  const filtered = search.results;
  const filterCount = Number(type !== 'all') + Number(generation !== 'all') + Number(favoritesOnly);
  function clearFilters() { setType('all'); setGeneration('all'); setFavoritesOnly(false); setVisibleLimit(60); }
  function pickSearch(item: Pokemon, invoker: HTMLElement) {
    const recent = rememberSearchPick(recentPicks, item.id);
    setRecentPicks(recent);
    try { localStorage.setItem('pokedex.recent.v1', JSON.stringify(recent)); } catch { /* Navigation works when private storage is unavailable. */ }
    openPokemon(item, undefined, invoker);
  }
  function onSearchKey(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    const results = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('[data-search-result]') ?? []);
    if (target.tagName === 'INPUT' && !event.nativeEvent.isComposing && event.key === 'Enter' && results[0]) { event.preventDefault(); results[0].click(); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !results.length || (target.tagName !== 'INPUT' && !target.hasAttribute('data-search-result'))) return;
    event.preventDefault();
    const index = results.indexOf(target as HTMLButtonElement);
    results[Math.max(0, Math.min(results.length - 1, index < 0 ? event.key === 'ArrowDown' ? 0 : results.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
  }

  function requestCandidate(cursor: TrailCursor, key: string) {
    const earlierPartial = candidate?.key === key && candidate.partial;
    candidateAbort.current?.abort();
    const controller = new AbortController();
    candidateAbort.current = controller;
    const request = ++candidateRequest.current;
    const originIds = visitsRef.current[pokemon[baseIndex.current].id]?.ids ?? [];
    const seen = [...new Set([...originIds, ...activeVisit.ids, ...(trail?.map(step => step.visit.selectedId) ?? [])])];
    if (seen.length > 2000) {
      setCandidate({ key, state: 'exhausted', error: 'This session reached the bounded discovery limit.' });
      return;
    }
    setCandidate({ key, state: 'loading', cursor });
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    fetch('/api/trail', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...cursor, seen }), signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('unavailable');
      return await response.json() as TrailResult;
    }).then(result => {
      if (candidateRequest.current !== request || controller.signal.aborted) return;
      if (result.card) {
        const existing = libraryRef.current.find(card => card.cardId === result.card!.cardId);
        if (existing && existing.artist !== result.card.artist) {
          setCandidate({ key, state: 'error', cursor, error: 'Source identity changed. Your place is safe.' });
          return;
        }
        setCandidate({ key, state: 'ready', card: existing ?? result.card, context: result.context, cursor: result.cursor, partial: earlierPartial || result.partial });
      } else setCandidate({ key, state: result.partial ? 'error' : result.exhausted ? 'exhausted' : 'search', cursor: result.cursor, partial: earlierPartial || result.partial });
    }).catch(() => {
      if (candidateRequest.current === request && (!controller.signal.aborted || controller.signal.reason === 'timeout'))
        setCandidate({ key, state: 'error', cursor, error: 'Related artwork is unavailable. Your place is safe.' });
    }).finally(() => window.clearTimeout(timeout));
  }
  useEffect(() => {
    candidateAbort.current?.abort();
    candidateRequest.current++;
    if (!preparationKey) { setCandidate(null); return; }
    if (!continuationCursor) { setCandidate({ key: preparationKey, state: 'exhausted' }); return; }
    requestCandidate(continuationCursor, preparationKey);
    return () => { candidateAbort.current?.abort(); candidateRequest.current++; };
  }, [preparationKey]);

  useEffect(() => {
    if (candidate?.state !== 'ready' || !candidate.card) return;
    // One lightweight next-card image; decoding never selects it.
    const image = new Image();
    image.src = candidate.card.image;
    void image.decode().catch(() => {});
    return () => { image.src = ''; };
  }, [candidate?.key, candidate?.card?.cardId]);

  useEffect(() => {
    setVisits(old => {
      const next = Object.fromEntries(Object.entries(old).map(([id, visit]) => [id, appendVisit(visit, allCards, currency)]));
      return Object.keys(old).some(id => next[id] !== old[Number(id)]) ? next : old;
    });
    const stack = routesRef.current;
    const branchIndex = activeBranchIndex(stack);
    if (branchIndex >= 0 && stack[branchIndex].visit) {
      const updated = appendVisit(stack[branchIndex].visit!, allCards, currency);
      if (updated !== stack[branchIndex].visit) {
        const route = stack[branchIndex];
        replaceRoute(branchIndex, { ...route, visit: updated, trail: route.trail?.map((step, index) => index === route.trailIndex ? { ...step, visit: updated } : step) });
      }
    }
  }, [allCards]);

  useEffect(() => {
    const id = activePokemon.id;
    if (completedDiscovery.current.has(id)) return;
    const controller = new AbortController(); let live = true;
    async function discover() {
      let offset: number | null = 0, scanned = 0, failed = 0;
      while (offset !== null && live) {
        try {
          const response: Response = await fetch(`/api/discovery/${id}?offset=${offset}`, { signal: controller.signal });
          if (!response.ok) throw new Error('unavailable');
          const data: { cards: CardEdition[]; scanned: number; failed: string[]; total: number; nextOffset: number | null } = await response.json();
          if (!live) return;
          scanned += data.scanned; failed += data.failed.length;
          setAllCards(previous => mergeCardLibrary(previous, data.cards));
          offset = data.nextOffset;
          setDiscovery(old => ({ ...old, [id]: { scanned, total: data.total, failed, done: offset === null } }));
        } catch {
          if (live) setDiscovery(old => ({ ...old, [id]: { scanned, total: old[id]?.total ?? 0, failed, done: false, error: 'Card source unavailable. Official art is still here.' } }));
          return;
        }
      }
      if (live) completedDiscovery.current.add(id);
    }
    // Fast swipes should feel instant without starting a request for every passed species.
    const timer = window.setTimeout(discover, 180);
    return () => { live = false; window.clearTimeout(timer); controller.abort(); };
  }, [activePokemon.id, discoveryRetry]);

  function replaceRoute(index: number, route: Route) {
    const stack = [...routesRef.current];
    stack[index] = route;
    routesRef.current = stack;
    for (let depth = index + 1; depth < timeline.current.length; depth++) {
      const snapshot = timeline.current[depth];
      if (snapshot?.[index]?.key === route.key) timeline.current[depth] = snapshot.map((entry, position) => position === index ? route : entry);
    }
    timeline.current[stack.length] = stack;
    setRoutes(stack);
  }
  function replaceTop(route: Route) { replaceRoute(routesRef.current.length - 1, route); }
  function savePanel() {
    const stack = routesRef.current;
    const top = stack.at(-1);
    if (!top || top.kind === 'branch') return;
    const focus = document.activeElement as HTMLElement | null;
    const focusId = focus?.dataset?.focusId;
    replaceTop({ ...top, scrollTop: drawerScrollRef.current?.scrollTop ?? top.scrollTop, focusId: focusId ?? top.focusId });
  }
  function pushRoute(route: Omit<Route, 'key' | 'scrollTop'>) {
    savePanel();
    const next = [...routesRef.current, { ...route, key: ++routeKey.current, scrollTop: 0 }];
    routesRef.current = next;
    timeline.current = timeline.current.slice(0, next.length);
    timeline.current[next.length] = next;
    history.pushState({ pokedexDepth: next.length }, '');
    setRoutes(next);
  }
  function applyStack(stack: Route[]) {
    routesRef.current = stack;
    setRoutes(stack);
    const top = stack.at(-1);
    const activeBranch = [...stack].reverse().find(route => route.kind === 'branch');
    const index = activeBranch?.visit ? pokemon.findIndex(item => item.id === activeBranch.visit!.speciesId) : baseIndex.current;
    const feed = feedRef.current;
    if (feed) {
      feedPosition.current.unlock(feed);
      placeFeed(feed, index);
      activeIndexRef.current = index;
      setActiveIndex(index);
      if (top && top.kind !== 'branch') feedPosition.current.lock(feed, feedSlot(index));
    }
  }
  useEffect(() => {
    history.replaceState({ pokedexDepth: 0 }, '');
    const onPop = (event: PopStateEvent) => {
      const depth = event.state?.pokedexDepth;
      const stack = Number.isInteger(depth) && timeline.current[depth] ? timeline.current[depth] : [];
      // History entries survive reload; the in-memory drawer timeline does not.
      // Restore the address's species whenever there is no live excursion.
      if (!stack.some(route => route.kind === 'branch')) baseIndex.current = (linkedSpecies(location.search) ?? 1) - 1;
      savePanel(); applyStack(stack);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  function goBack() {
    if (!routesRef.current.length) return;
    savePanel();
    history.back();
  }
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const top = routes.at(-1);
    drawerRef.current = drawer;
    if (drawer && dialog && !dialog.open) dialog.showModal();
    if (!drawer && dialog?.open) {
      const invoker = routes.length ? null : timeline.current[1]?.[0]?.invoker;
      pendingFocus.current = invoker?.isConnected ? invoker : feedRef.current;
      dialog.close();
    }

    if (drawer && dialog?.open) {
      if (drawerScrollRef.current) drawerScrollRef.current.scrollTop = top?.scrollTop ?? 0;
      const target = (top?.focusId ? dialog.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(top.focusId)}"]`) : null)
        ?? (drawer === 'search' ? dialog.querySelector<HTMLElement>('.search-field input') : dialog.querySelector<HTMLElement>('#drawer-title'));
      target?.focus({ preventScroll: true });
    } else if (!drawer && !dialog?.open && !pendingFocus.current) {
      const invoker = routes.length ? null : timeline.current[1]?.[0]?.invoker;
      if (invoker?.isConnected) invoker.focus({ preventScroll: true });
      else feedRef.current?.focus({ preventScroll: true });
    }
  }, [routes.at(-1)?.key, drawer]);

  useLayoutEffect(() => {
    if (drawer === 'artist' && document.activeElement === document.body) {
      dialogRef.current?.querySelector<HTMLElement>('.portfolio-status')?.focus({ preventScroll: true });
    }
  }, [drawer, artistState.loading, artistCoverage.scanned]);

  useEffect(() => {
    if (drawer !== 'artist' || !activeArtist) return;
    portfolio.open(activeArtist, libraryRef.current);
    return () => portfolio.close();
  }, [drawer, activeArtist, portfolio]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    feed.focus({ preventScroll: true });
  }, []);

  function jumpTo(index: number) {
    if (feedRef.current && !drawerRef.current) feedPosition.current.unlock(feedRef.current);
    const feed = feedRef.current;
    if (!feed) return;
    const next = adjacentIndex(index, 0, pokemon.length);
    placeFeed(feed, next);
    if (next !== activeIndexRef.current) setHasScrolled(true);
    activeIndexRef.current = next;
    setActiveIndex(next);
    enterSpecies(next);

  }
  function positionFeed(index: number) {
    const feed = feedRef.current;
    if (!feed) return;
    feedPosition.current.unlock(feed);
    const next = adjacentIndex(index, 0, pokemon.length);
    placeFeed(feed, next);
    activeIndexRef.current = next;
    setActiveIndex(next);

  }
  function moveSpecies(direction: number) {
    if (inspectingModel || drawerRef.current) return;
    if (!shuffle) { jumpTo(adjacentIndex(activeIndexRef.current, direction, pokemon.length)); return; }
    const current = activeIndexRef.current;
    const next = direction < 0 ? shufflePast.current.pop() : shuffleNext.current;
    if (next == null) return;
    if (direction > 0) shufflePast.current = [...shufflePast.current.slice(-1999), current];
    shuffleNext.current = drawSpecies(next);
    shuffleCurrent.current = next;
    jumpTo(next);
  }
  function enterSpecies(index: number) {
    const item = pokemon[index];
    if (routesRef.current.at(-1)?.kind === 'branch') {
      replaceTop({ ...routesRef.current.at(-1)!, visit: createVisit(item, libraryRef.current, currency, undefined, routesRef.current.at(-1)?.visit?.context), trail: undefined, trailIndex: undefined, cursor: undefined });
    } else {
      baseIndex.current = index;
      setVisits(old => old[item.id] ? old : { ...old, [item.id]: createVisit(item, libraryRef.current, currency) });
    }
  }
  function changeVisit(change: (visit: Visit) => Visit) {
    const stack = routesRef.current;
    const branchIndex = activeBranchIndex(stack);
    if (branchIndex >= 0 && stack[branchIndex].visit) {
      const current = stack[branchIndex];
      const visit = change(current.visit!);
      const updatedTrail = current.trail?.map((step, index) => index === current.trailIndex ? { ...step, visit } : step);
      replaceRoute(branchIndex, { ...current, visit, trail: updatedTrail });
    }
    else setVisits(old => ({ ...old, [activePokemon.id]: change(old[activePokemon.id] ?? createVisit(activePokemon, libraryRef.current, currency)) }));
  }
  function moveArt(direction: number) {
    if (inspectingModel) return;
    if (trail) {
      const next = traverseTrail({ steps: trail, index: trailIndex, cursor: branch?.cursor ?? null }, direction);
      if (next.index !== trailIndex) {
        const step = next.steps[next.index];
        replaceRoute(activeBranchIndex(routesRef.current), { ...branch!, trailIndex: next.index, visit: step.visit });
        positionFeed(pokemon.findIndex(item => item.id === step.visit.speciesId));
      } else if (direction > 0) acceptCandidate();
      return;
    }
    const next = cardIndex + direction;
    if (next >= 0 && next < cards.length) changeVisit(visit => stepVisit(visit, direction));
    else if (direction > 0) acceptCandidate();
  }
  function selectArtwork(index: number) {
    if (trail) {
      const step = trail[index];
      if (!step || index === trailIndex) return;
      replaceRoute(activeBranchIndex(routesRef.current), { ...branch!, trailIndex: index, visit: step.visit });
      positionFeed(step.visit.speciesId - 1);
    } else if (cards[index]) {
      const id = cards[index].cardId;
      changeVisit(visit => selectVisit(visit, id));
    }
  }
  function acceptCandidate() {
    if (candidate?.key !== continuationKey) return;
    if (candidate.state === 'search' || candidate.state === 'error') {
      if (candidate.cursor) requestCandidate(candidate.cursor, continuationKey);
      return;
    }
    if (candidate.state !== 'ready' || !candidate.card) return;
    // Preparation stays outside visit libraries until deliberately accepted.
    setAllCards(previous => mergeCardLibrary(previous, [candidate.card!]));
    const target = portfolioTarget(candidate.card, activePokemon.id, validSpecies);
    const item = pokemon.find(species => species.id === target);
    if (!item) return;
    const visit = createVisit(item, [...libraryRef.current, candidate.card], currency, candidate.card.cardId, candidate.context);
    const nextPath = extendTrail(trail ? { steps: trail, index: trailIndex, cursor: branch?.cursor ?? null } : null,
      { visit: activeVisit, context: branch?.visit?.context ?? `Pokédex #${dexNumber(activePokemon.id)}` },
      { visit, context: candidate.context ?? 'Related artwork' }, candidate.cursor ?? null);
    if (branch) replaceRoute(activeBranchIndex(routesRef.current), { ...branch, visit, trail: nextPath.steps, trailIndex: nextPath.index, cursor: nextPath.cursor });
    else {
      baseIndex.current = activeIndexRef.current;
      pushRoute({ kind: 'branch', visit, trail: nextPath.steps, trailIndex: nextPath.index, cursor: nextPath.cursor, originIndex: baseIndex.current, originLabel: activePokemon.name });
    }
    positionFeed(pokemon.findIndex(species => species.id === target));
  }
  function openDrawer(next: Exclude<Drawer, null>, artist?: string, invoker?: HTMLElement | null) {
    if (!routesRef.current.length) baseIndex.current = activeIndexRef.current;
    if (routesRef.current.length && invoker?.dataset.focusId) replaceTop({ ...routesRef.current.at(-1)!, focusId: invoker.dataset.focusId });
    drawerRef.current = next;
    if (feedRef.current) feedPosition.current.lock(feedRef.current, feedSelected);

    pushRoute({ kind: next, artist, invoker: invoker ?? (document.activeElement as HTMLElement), originIndex: baseIndex.current });
  }
  function closeDrawer() { goBack(); }
  function openPokemon(item: Pokemon, selectedId?: string, invoker?: HTMLElement | null) {
    if (routesRef.current.length && invoker?.dataset.focusId) replaceTop({ ...routesRef.current.at(-1)!, focusId: invoker.dataset.focusId });
    const target = createVisit(item, libraryRef.current, currency, selectedId, routesRef.current.at(-1)?.artist);
    pushRoute({ kind: 'branch', visit: target, originIndex: baseIndex.current, originLabel: routesRef.current.at(-1)?.artist ?? activePokemon.name });
    const feed = feedRef.current;
    if (feed) {
      feedPosition.current.unlock(feed);
      const index = pokemon.findIndex(entry => entry.id === item.id);
      placeFeed(feed, index);
      activeIndexRef.current = index;
      setActiveIndex(index);
    }
  }
  function toggleFavorite() {
    const next = favorites.includes(activePokemon.id) ? favorites.filter(id => id !== activePokemon.id) : [...favorites, activePokemon.id];
    try { localStorage.setItem('pokedex.favorites.v1', JSON.stringify(next)); setFavorites(next); }
    catch { setError('This browser could not save favorites.'); }
  }

  function onFeedKey(event: React.KeyboardEvent) {
    if (drawer || inspectingModel || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]'))) return;
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowDown' || event.key === 'PageDown') moveArt(1);
    if (event.key === 'ArrowUp' || event.key === 'PageUp') moveArt(-1);
    if (event.key === 'ArrowLeft') moveSpecies(-1);
    if (event.key === 'ArrowRight') moveSpecies(1);
    if (event.key === 'Home') jumpTo(0);
    if (event.key === 'End') jumpTo(pokemon.length - 1);
  }

  return <main className={`app-shell type-${activePokemon.types[0]} ${branch ? 'has-branch' : ''}`} onKeyDown={onFeedKey}>
    <header className="topbar">
      <button className="brand" onClick={() => jumpTo(0)} aria-label="Pokédex, back to Bulbasaur"><span className="brand-ball" aria-hidden="true" /><span className="brand-name">pokédex<span className="brand-dot">.</span></span></button>
      <div className="dex-navigation">
        <button className="dex-position dex-jump" onClick={event => { setQuery(''); openDrawer('search', undefined, event.currentTarget); }} aria-label={`Jump to Pokédex number. Current ${activePokemon.id} of ${pokemon.length}`}>{dexNumber(activePokemon.id)} <span>/ {pokemon.length.toLocaleString('en-US')}</span></button>
        <button className="random-pokemon" onClick={toggleShuffle} role="switch" aria-checked={shuffle} aria-label="Shuffle species"><Icon name="shuffle" /><span>Shuffle</span><span className="shuffle-track" aria-hidden="true"><span /></span></button>
      </div>
      <button className="icon-button search-button" onClick={() => openDrawer('search')} aria-label="Search Pokédex"><Icon name="search" /></button>
    </header>

    <div ref={feedRef} className={`species-feed ${speciesScroll.nativeEnd ? '' : 'species-fallback'}`} {...speciesScroll.events} tabIndex={0} role="region" aria-label="Pokédex feed. Swipe horizontally or use left and right arrows for species. Scroll vertically or use up and down arrows to explore artwork."
      onDragStart={event => event.preventDefault()}>
      {feedIndices.map((index, slot) => {
        const item = pokemon[index];
        const nearby = Math.abs(slot - speciesScroll.center) <= 1 || index === activeIndex;
        const visit = index === activeIndex ? activeVisit : visits[item.id];
        const chosenId = visit?.selectedId ?? `official-${item.id}`;
        const edition = nearby ? (allCards.find(entry => entry.cardId === chosenId) ?? (chosenId === `model-${item.id}` ? modelEdition(item) : undefined) ?? officialEdition(item)) : undefined;
        return <section className={`species-slide type-${item.types[0]}`} key={`${shuffle}-${slot}-${item.id}`} aria-label={`Number ${item.id}, ${item.name}`} aria-hidden={index !== activeIndex}>
          {edition && <>
            <span className="ghost-number" aria-hidden="true">{dexNumber(item.id)}</span>
            {speciesScroll.moving && <div className="species-preview-name">#{dexNumber(item.id)} · {item.name}</div>}
            {index === activeIndex ? <ArtGallery key={item.id} editions={trail ? trail.map(step => {
              const species = pokemon[step.visit.speciesId - 1];
              return allCards.find(entry => entry.cardId === step.visit.selectedId) ?? (step.visit.selectedId === `model-${species.id}` ? modelEdition(species) : undefined) ?? officialEdition(species);
            }) : cards} selected={trail ? trailIndex : cardIndex} suspended={Boolean(drawer)} onMotion={setArtMoving} onSelect={selectArtwork}
              render={(frame, selected, moving, inspectGallery) => {
                const species = pokemon[frame.pokemonId - 1] ?? item;
                return frame.sourceType === 'model' && selected && !failedModels.includes(species.id) && admittedModel(species.id) ? <ModelView key={frame.cardId} asset={admittedModel(species.id)!} name={species.name} controlsTarget={modelControlsTarget} suspended={Boolean(drawer) || moving || speciesScroll.moving} onInspect={inspecting => {
                  inspectGallery(inspecting);
                  setInspectingModel(inspecting);
                  const feed = feedRef.current; if (!feed) return;
                  if (inspecting) feedPosition.current.lock(feed, feedSelected); else if (!drawerRef.current) feedPosition.current.unlock(feed);
                }} onFailure={reason => {
                  if (reason === 'unsupported') setRendererUnavailable(true);
                  setFailedModels(previous => previous.includes(species.id) ? previous : [...previous, species.id]);
                  changeVisit(visit => selectVisit(visit, `official-${species.id}`));
                }} onFallback={() => changeVisit(visit => selectVisit(visit, `official-${species.id}`))} /> : brokenImages.includes(frame.image) ?
                <div className="image-unavailable"><Icon name="grid" /><span>Image unavailable</span><small>{frame.title}</small><button className="image-retry" tabIndex={selected ? 0 : -1} onClick={() => setBrokenImages(images => retryFailedImages(images, frame.image))}>Retry image</button></div> :
                <><img key={frame.image} className="hero-art" src={frame.image} alt={frame.sourceType === 'official' || frame.sourceType === 'model' ? `${species.name}, official species artwork${frame.sourceType === 'model' ? ' while 3D is inactive' : ''}` : `${frame.title} Pokémon TCG card, illustrated by ${frame.artist}`} draggable={false} fetchPriority={selected ? 'high' : 'low'} onError={() => setBrokenImages(old => rememberFailedImage(old, frame.image))} />
                {selected && failedModels.includes(species.id) && ['official', 'model'].includes(frame.sourceType ?? '') &&
                  <div className="model-recovery"><span role="status">{rendererUnavailable ? '3D is unavailable in this browser. Showing official art.' : '3D unavailable. Showing official art.'}</span>{!rendererUnavailable && <button onClick={() => {
                    setFailedModels(previous => previous.filter(id => id !== species.id));
                    changeVisit(visit => selectVisit(visit, `model-${species.id}`));
                  }}>Retry 3D</button>}</div>}
                </>;
              }} /> : <div className={`art-stage ${['official','model'].includes(edition.sourceType ?? '') ? 'is-official' : 'is-card'}`}><img className="hero-art" src={edition.image} alt="" draggable={false} fetchPriority="low" /></div>}
          </>}
        </section>;
      })}
    </div>

    <div ref={overlayRef} className={`feed-overlay ${card.sourceType === 'model' && !failedModels.includes(activePokemon.id) ? 'has-model-controls' : ''}`}>
      {branch && <button className="branch-back" onClick={goBack} aria-label={`Back to ${branch.originLabel ?? 'previous view'}`}><Icon name="left" /> Back to {branch.originLabel ?? 'previous view'}</button>}
      <div className={`feed-caption ${artMoving ? 'caption-in-motion' : ''}`} key={activePokemon.id} inert={artMoving}>
        <span className="species-types">{trail ? trail[trailIndex]?.context : activeVisit.context ?? activePokemon.types.join(' · ')}</span>
        <div className="species-heading"><h1>{activePokemon.name}</h1><button className="icon-button share-species" aria-label={`Share ${activePokemon.name}`} onClick={event => shareSpecies(event.currentTarget)}><Icon name="share" /></button></div>
        {card.sourceType === 'model' && failedModels.includes(activePokemon.id) ? <span className="credit-link">Official art · PokéAPI</span> : card.sourceType === 'model' ? <button className="credit-link" onClick={event => openDrawer('details', undefined, event.currentTarget)}>3D · {card.artist} <span>›</span></button> : card.sourceType === 'official' ? <button className="credit-link" onClick={event => openDrawer('details', undefined, event.currentTarget)}>Official art <span>· PokéAPI</span></button> :
          <button className="credit-link" onClick={event => openDrawer('artist', card.artist, event.currentTarget)}>Art by {card.artist} <span>›</span></button>}
      </div>
      <div ref={setModelControlsTarget} className={`model-controls-row ${artMoving ? 'caption-in-motion' : ''}`} inert={artMoving} />
      {continuationKey && <button className={`continuation continuation-${candidate?.state ?? 'loading'}`} onClick={acceptCandidate} disabled={!candidate || candidate.state === 'loading' || candidate.state === 'exhausted'} aria-label={candidate?.state === 'ready' ? `Continue to ${candidate.card?.title} by ${candidate.card?.artist}. ${candidate.context}` : candidate?.state === 'search' ? 'Search next page for related artwork' : candidate?.state === 'error' ? 'Retry related artwork' : undefined}>
        {candidate?.state === 'ready' && candidate.card ? <><img src={candidate.card.image} alt="" /><span><small>DISCOVER NEXT · {candidate.context}</small><strong>{candidate.card.title}</strong><em>Art by {candidate.card.artist}</em></span><Icon name="down" /></> :
          <span><small>RELATED ARTWORK</small><strong>{candidate?.state === 'search' ? 'Search more source editions' : candidate?.state === 'exhausted' ? 'No unseen art in checked sources' : candidate?.state === 'error' ? 'Retry related artwork' : 'Looking for the next artwork…'}</strong>{candidate?.partial && <em>Some source editions were unavailable</em>}{candidate?.error && <em>{candidate.error}</em>}</span>}
      </button>}
      <div className="feed-bottom">
        <nav className="art-controls" aria-label="Artwork editions">
          <button className="mini-button" onClick={() => moveArt(-1)} disabled={trail ? trailIndex === 0 : cardIndex === 0} aria-label={trail ? 'Previous discovery' : 'Previous artwork'}><Icon name="up" /></button>
          <button className="edition-count" onClick={event => openDrawer('details', undefined, event.currentTarget)} aria-label={trail ? `Discovery ${trailIndex + 1} of ${trail.length}. Open details` : `Artwork ${cardIndex + 1} of ${cards.length} loaded. Open details`}>{trail ? trailIndex + 1 : cardIndex + 1}<span> / {trail ? `${trail.length} trail` : `${cards.length} loaded`}</span></button>
          <button className="mini-button" onClick={() => moveArt(1)} disabled={trail ? trailIndex === trail.length - 1 && candidate?.state !== 'ready' : cardIndex === cards.length - 1 && candidate?.state !== 'ready'} aria-label={trail ? 'Next discovery' : 'Next artwork'}><Icon name="down" /></button>
        </nav>
        <nav className="species-controls" aria-label="Species navigation">
          <button className="mini-button previous-species" onClick={() => moveSpecies(-1)} disabled={(shuffle ? !shufflePast.current.length : activeIndex === 0) || inspectingModel} aria-label="Previous species"><Icon name="left" /></button>
          <button className="next-species" onClick={() => moveSpecies(1)} disabled={(!shuffle && activeIndex === pokemon.length - 1) || inspectingModel} aria-label="Next species"><span>{shuffle ? 'Random species' : activeIndex === pokemon.length - 1 ? 'End of the dex' : !hasScrolled ? 'Swipe left' : pokemon[activeIndex + 1].name}</span><Icon name="right" /></button>
        </nav>
      </div>
    </div>
    <span className="share-status" role="status">{shareStatus}</span>
    <div className="dex-progress" aria-hidden="true"><span style={{ width: `${((activeIndex + 1) / pokemon.length) * 100}%` }} /></div>
    <span className="sr-only" aria-live="polite">{activePokemon.name}, number {activePokemon.id}. {card.sourceType === 'model' && failedModels.includes(activePokemon.id) ? '3D unavailable. Official art via PokéAPI.' : card.sourceType === 'model' ? `Community 3D model credited to ${card.artist}.` : card.sourceType === 'official' ? 'Official art via PokéAPI. Individual artist not specified.' : `Artwork by ${card.artist}.`} {trail ? trail[trailIndex]?.context : ''}</span>
    {error && <button className="toast" role="alert" onClick={() => setError('')}>{error} ×</button>}

    <dialog ref={dialogRef} className={`drawer drawer-${drawer ?? 'closed'}`} aria-labelledby="drawer-title" onCancel={event => { event.preventDefault(); closeDrawer(); }} onClose={() => { pendingFocus.current?.focus({ preventScroll: true }); pendingFocus.current = null; }} onClick={event => { if (event.target === event.currentTarget) closeDrawer(); }}>
      <div className="drawer-surface">
        <header className="drawer-header"><div><span className="drawer-eyebrow">{drawer === 'search' ? 'Find your next favorite' : drawer === 'artist' ? 'Follow the illustrator' : `#${dexNumber(activePokemon.id)} · ${activePokemon.name}`}</span><h2 id="drawer-title" tabIndex={-1}>{drawer === 'search' ? 'Jump in.' : drawer === 'artist' ? activeArtist : 'Behind the art.'}</h2></div><button className="icon-button" onClick={closeDrawer} aria-label={routes.length > 1 ? 'Back to previous view' : 'Close panel'}><Icon name={routes.length > 1 ? 'left' : 'close'} /></button></header>
        <div ref={drawerScrollRef} className="drawer-scroll" onScroll={event => { if (drawer === 'artist') portfolio.saveScroll(activeArtist, event.currentTarget.scrollTop); }}>
          {drawer === 'search' && <div className="jump-search" onKeyDown={onSearchKey}>
            <label className="search-field"><Icon name="search" /><input autoFocus type="search" enterKeyHint="go" autoComplete="off" spellCheck={false} value={query} onChange={event => { setQuery(event.target.value); setVisibleLimit(60); }} placeholder="Name or #001–1025" aria-label="Search by name or Pokédex number" /><button className="search-clear" onClick={() => { setQuery(''); dialogRef.current?.querySelector<HTMLInputElement>('.search-field input')?.focus(); }} aria-label="Clear search" hidden={!query}>×</button></label>
            <div className="search-tools"><span role="status">{search.invalidNumber ? 'Use a number from 1 to 1025' : `${filtered.length.toLocaleString('en-US')} Pokémon`}</span><button className={`filter-chip ${filterCount ? 'active' : ''}`} aria-expanded={filtersOpen} aria-controls="search-filter-panel" onClick={() => setFiltersOpen(value => !value)}>Filters{filterCount ? ` · ${filterCount}` : ''}</button></div>
            {filtersOpen && <div className="search-filter-panel" id="search-filter-panel"><label>Type<select aria-label="Pokémon type" value={type} onChange={event => { setType(event.target.value); setVisibleLimit(60); }}><option value="all">All types</option>{types.map(name => <option key={name} value={name}>{name}</option>)}</select></label><label>Generation<select aria-label="Pokémon generation" value={generation} onChange={event => { setGeneration(event.target.value); setVisibleLimit(60); }}><option value="all">All generations</option>{Array.from({ length: 9 }, (_, index) => <option key={index} value={index + 1}>Generation {index + 1}</option>)}</select></label><button className={`filter-chip ${favoritesOnly ? 'active' : ''}`} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly(value => !value); setVisibleLimit(60); }}><Icon name="heart" />Saved · {favorites.length}</button></div>}
            {!!filterCount && <div className="active-filters" aria-label="Active search filters">{type !== 'all' && <button onClick={() => setType('all')} aria-label={`Remove ${type} type filter`}>{type} ×</button>}{generation !== 'all' && <button onClick={() => setGeneration('all')} aria-label="Remove generation filter">Gen {generation} ×</button>}{favoritesOnly && <button onClick={() => setFavoritesOnly(false)} aria-label="Remove saved filter">Saved ×</button>}<button className="clear-filters" onClick={clearFilters}>Clear all</button></div>}
            {!query.trim() && !filterCount && !!recentPicks.length && <section className="recent-picks" aria-label="Recent picks"><h3>Recently visited</h3><div>{recentPicks.map(id => { const item = pokemon[id - 1]; return <button key={id} data-focus-id={`recent-${id}`} onClick={event => pickSearch(item, event.currentTarget)} aria-label={`Recent #${dexNumber(id)} ${item.name}`}><img src={artwork(id)} alt="" loading="lazy" /><span>#{dexNumber(id)}<strong>{item.name}</strong></span></button>; })}</div></section>}
            <div className="species-grid">{filtered.slice(0, visibleLimit).map(item => <button className={`species-tile type-${item.types[0]}`} key={item.id} data-search-result data-focus-id={`species-${item.id}`} aria-label={`#${dexNumber(item.id)} ${item.name}`} onClick={event => pickSearch(item, event.currentTarget)}><span>#{dexNumber(item.id)}</span><img src={artwork(item.id)} alt="" loading="lazy" /><strong>{item.name}</strong>{favorites.includes(item.id) && <span className="tile-heart" aria-label="Saved">♥</span>}</button>)}</div>
            {!filtered.length && <div className="empty-state"><p>{search.invalidNumber ? 'Enter a national-dex number from 1 to 1025.' : query.trim() ? `No Pokémon match “${query.trim()}”${filterCount ? ' with these filters' : ''}.` : 'No Pokémon match these filters.'}</p>{!!filterCount && <button className="inline-link" onClick={clearFilters}>Clear filters</button>}</div>}
            {filtered.length > visibleLimit && <button className="load-more" onClick={() => setVisibleLimit(limit => limit + 60)}>Show more</button>}
            <p className="quiet-note">Names, 150 or #001. Search jumps to a species; Shuffle changes how you move forward.</p>
          </div>}
          {drawer === 'details' && <>
            {manualShare && <label className="manual-share">Species link<input readOnly value={manualShare} onFocus={event => event.currentTarget.select()} aria-label="Species link to copy" /></label>}
            <p className="creator-credit">made by <a href="https://mhaider.dev" target="_blank" rel="noreferrer">haider ↗</a> · a pokédex you can doomscroll</p>
            <div className="details-identity"><img src={card.image} alt="" /><div><h3>{card.title}</h3><p>{card.set}{card.language && ` · ${card.number} · ${card.language.toUpperCase()}`}</p>{card.sourceType === 'official' ? <p>Individual artist not specified</p> : card.sourceType === 'model' ? <p>{failedModels.includes(activePokemon.id) ? 'Official-art fallback via PokéAPI. 3D source credits below.' : `3D source: ${card.artist}`}</p> : <button className="inline-link" data-focus-id="details-artist" onClick={event => openDrawer('artist', card.artist, event.currentTarget)}>Art by {card.artist} ›</button>}</div></div>
            <button className={`save-pokemon ${favorites.includes(activePokemon.id) ? 'is-saved' : ''}`} onClick={toggleFavorite} aria-pressed={favorites.includes(activePokemon.id)}><Icon name="heart" /> {favorites.includes(activePokemon.id) ? 'Saved Pokémon' : 'Save Pokémon'}</button>
            <section className="detail-section"><div className="detail-heading"><h3>Artwork</h3><span>{cardIndex + 1} / {cards.length} loaded</span></div><div className="art-rail">{cards.map(edition => <button className={card.cardId === edition.cardId ? 'selected' : ''} key={edition.cardId} onClick={() => changeVisit(visit => selectVisit(visit, edition.cardId))} aria-label={`${edition.title}, ${edition.sourceType === 'model' ? 'interactive 3D model' : edition.sourceType === 'official' ? 'official artwork' : `${edition.set}, art by ${edition.artist}`}`} aria-current={card.cardId === edition.cardId ? 'true' : undefined}><img src={edition.image} alt="" loading="lazy" /></button>)}</div></section>
            <section className="detail-section"><div className="detail-heading"><h3>Market price</h3><select aria-label="Price currency and provider" value={currency} onChange={event => setCurrency(event.target.value)}><option value="USD">USD · TCGplayer</option><option value="EUR">EUR · Cardmarket</option></select></div>
              <p className="price-value">{formatPrice(card, currency) ?? 'No recent price'}</p>
              {price && <p className="detail-copy">{price.variant} · {price.metric} · updated {new Date(price.updatedAt).toLocaleDateString()}<br /><a href={price.url} target="_blank" rel="noreferrer">{price.provider} ↗</a></p>}
              <p className="quiet-note">After official art, loaded cards start with the highest available {currency} provider value. English, ungraded editions. Prices older than 7 days are excluded; currencies are never mixed.</p>
              <p className="quiet-note">Provider matching can confuse card variants or marketplace IDs. <a href="https://tcgdex.dev/faq" target="_blank" rel="noreferrer">Check the exact edition ↗</a></p>
              <p className="source-status" role="status">{status?.error ?? (status?.done ? `${status.scanned} / ${status.total} source editions checked${status.failed ? ` · ${status.failed} unavailable` : ''}` : `Finding card editions… ${status?.scanned ?? 0} / ${status?.total || '…'}`)}{!status?.done && !status?.error && ' · coverage is partial'}</p>
              {(status?.error || (status?.failed ?? 0) > 0) && <button className="inline-link" onClick={() => { completedDiscovery.current.delete(activePokemon.id); setDiscoveryRetry(count => count + 1); }}>Retry card sources ↻</button>}
              {manifestFailed && <p className="quiet-note">Saved card collection unavailable. Live discovery and official species artwork remain available.</p>}
            </section>
            <section className="detail-section"><h3>Credit & source</h3><p className="detail-copy">{card.sourceType === 'model' && failedModels.includes(activePokemon.id) ? (rendererUnavailable ? '3D is unavailable in this browser. The displayed fallback is official species artwork via PokéAPI.' : 'This 3D model failed to load. The displayed fallback is official species artwork via PokéAPI. Retry 3D is available in the feed.') : card.sourceType === 'model' ? `Community 3D asset. ${card.artist}. ${card.artistEvidenceMethod}. Underlying Pokémon IP belongs to its owners; source licensing is not blanket rights clearance.` : card.sourceType === 'official' ? 'Official species artwork via PokéAPI sprites. No individual artist is specified by this source.' : card.sourceType === 'catalog' ? 'Artist credit from TCGdex metadata. This edition has not been independently reviewed.' : `Reviewed edition. Artist evidence: ${card.artistEvidenceMethod}.`}</p><div className="source-links"><a href={card.image} target="_blank" rel="noreferrer">Original image ↗</a><a href={card.tcgdexUrl} target="_blank" rel="noreferrer">{card.sourceType === 'model' ? 'Model source' : card.sourceType === 'official' ? 'PokéAPI source' : 'TCGdex record'} ↗</a>{card.publisherUrl && <a href={card.publisherUrl} target="_blank" rel="noreferrer">Publisher page ↗</a>}{card.sourceType !== 'official' && <a href={card.artistEvidenceUrl} target="_blank" rel="noreferrer">{card.sourceType === 'catalog' ? 'Credit metadata' : 'Credit evidence'} ↗</a>}</div></section>
            {card.sourceType === 'model' && (admittedModel(activePokemon.id)?.previewOnly || admittedModel(activePokemon.id)?.publicRelease) && (() => {
              const credit = previewModelAttribution(admittedModel(activePokemon.id)!);
              return <section className="detail-section"><h3>Extracted model credits</h3><p className="detail-copy">{credit.description}</p><div className="source-links">{credit.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div></section>;
            })()}
            {(modelPreviewEnabled || modelPublicReleaseEnabled) && <details className="detail-section asset-rights-details"><summary>3D asset credits &amp; rights</summary><p className="detail-copy">{modelPreviewEnabled && 'Protected research draft. '}Pokémon character models, textures and motion belong to Pokémon / Nintendo / Creatures / GAME FREAK. Extracted asset rights remain unresolved.</p><div className="source-links"><a href="/models/attribution.json" target="_blank" rel="noreferrer">Per-asset credits, provenance and rights ↗</a></div></details>}
            <section className="detail-section"><h3>Keep exploring</h3><div className="source-links"><a href={`https://www.deviantart.com/search?q=${encodeURIComponent(activePokemon.name + ' pokemon')}`} target="_blank" rel="noreferrer">DeviantArt ↗</a><a href={`https://www.pixiv.net/en/tags/${encodeURIComponent(activePokemon.name)}/artworks`} target="_blank" rel="noreferrer">Pixiv ↗</a></div><p className="quiet-note">Opens the original communities. These are discovery links, not imported fan-art galleries.</p></section>
          </>}
          {drawer === 'artist' && <>
            <div className="artist-intro"><p className="artist-summary">{artistCards.length} loaded artworks · {new Set(artistCards.flatMap(cardSpeciesIds)).size} Pokémon</p><a href={artistCoverage.sourceUrl ?? `https://api.tcgdex.net/v2/en/illustrators/${encodeURIComponent(activeArtist)}`} target="_blank" rel="noreferrer">TCGdex ↗</a></div>
            <div className="artist-grid">{artistCards.map(edition => <button key={edition.cardId} data-focus-id={`artist-${edition.cardId}`} onClick={event => { const target = portfolioTarget(edition, activePokemon.id, validSpecies); const item = pokemon.find(entry => entry.id === target); if (item) openPokemon(item, edition.cardId, event.currentTarget); }} aria-label={`Open ${edition.title}, ${edition.set}, artwork by ${edition.artist}`}><img src={edition.image} alt={`${edition.title}, ${edition.set}`} loading="lazy" /><strong>{edition.title}</strong><span>{edition.set} · {edition.number}</span></button>)}</div>
            {!artistCards.length && <p className="empty-state">{artistState.loading ? 'Finding their artwork…' : 'No usable Pokémon artwork loaded yet.'}</p>}
            <div className="portfolio-status" role="status" aria-live="polite" tabIndex={-1}><span>{artistCoverage.scanned} / {artistCoverage.total ?? '…'} editions checked</span>{artistCoverage.failed.length > 0 && <span>{artistCoverage.failed.length} unavailable</span>}{artistCoverage.skipped.length > 0 && <span>{artistCoverage.skipped.length} excluded</span>}{artistState.loading && <span className="portfolio-loading">Loading artwork…</span>}</div>
            {artistState.error && <p className="portfolio-error" role="alert">{artistState.error}</p>}
            <div className="portfolio-actions">
              {(artistState.error || artistCoverage.failed.length > 0) && <button className="load-more" disabled={artistState.loading} onClick={() => void portfolio.retryFailed()}>Retry unavailable sources</button>}
              {artistCoverage.nextOffset !== null && !artistState.error && <button className="load-more primary" disabled={artistState.loading} onClick={() => void portfolio.loadMore()}>{artistState.loading ? 'Loading…' : 'Load more artwork'}</button>}
              {artistCoverage.nextOffset === null && !artistState.loading && <p className="quiet-note">{artistCoverage.failed.length ? 'All pages checked. Some sources can be retried.' : 'All source editions checked.'}</p>}
            </div>
            {artistCoverage.skipped.length > 0 && <details className="portfolio-exclusions"><summary>Why some editions are excluded</summary><p>Only cards with exact illustrator credit, usable source art and a valid Pokémon species appear here.</p><ul>{Object.entries(artistCoverage.skipped.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] ?? 0) + 1 }), {})).map(([reason, count]) => <li key={reason}>{exclusionLabels[reason] ?? reason.replaceAll('_', ' ')}: {count}</li>)}</ul></details>}
            <p className="quiet-note">Exact card credits from TCGdex. New source metadata is not independently reviewed. Tap an artwork to open its edition; your place in this portfolio is kept.</p>
          </>}
        </div>
      </div>
    </dialog>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
