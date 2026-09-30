import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import speciesSnapshot from '../content/species.json';
import { PointerGesture, WheelGesture, wrapIndex } from './navigation';
import { belongsToSpecies, cardSpeciesIds, mergeCardLibrary } from './card-library';
import { adjacentIndex, artwork, dexNumber, nationalDex, officialEdition, rankedCards, recentPrice, selectedCard as resolveCard } from './feed-model';
import type { CardEdition, Pokemon } from './feed-model';
import './style.css';

const pokemon = nationalDex(speciesSnapshot as Pokemon[]);
type Drawer = 'search' | 'details' | 'artist' | null;
type Discovery = { scanned: number; total: number; done: boolean; failed: number; error?: string };
const types = [...new Set(pokemon.flatMap(item => item.types))].sort();
const formatPrice = (card: CardEdition, currency: string) => {
  const price = recentPrice(card, currency);
  return price ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price.amount) : null;
};

function Icon({ name }: { name: 'search' | 'heart' | 'info' | 'close' | 'left' | 'right' | 'up' | 'down' | 'grid' }) {
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
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activePokemon = pokemon[activeIndex];
  const [allCards, setAllCards] = useState<CardEdition[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<number, string>>({});
  const [currency, setCurrency] = useState('USD');
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('pokedex.favorites.v1') || '[]');
      return Array.isArray(saved) ? saved.filter((id): id is number => Number.isInteger(id) && pokemon.some(item => item.id === id)) : [];
    } catch { return []; }
  });
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [activeArtist, setActiveArtist] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [discovery, setDiscovery] = useState<Record<number, Discovery>>({});
  const [discoveryRetry, setDiscoveryRetry] = useState(0);
  const [manifestFailed, setManifestFailed] = useState(false);
  const [error, setError] = useState('');
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  const [hasScrolled, setHasScrolled] = useState(false);
  const completedDiscovery = useRef(new Set<number>());
  const feedRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointer = useRef(new PointerGesture());
  const wheel = useRef(new WheelGesture());
  const activeIndexRef = useRef(0);
  const drawerRef = useRef<Drawer>(null);
  activeIndexRef.current = activeIndex;
  drawerRef.current = drawer;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/cards', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('unavailable');
      return await response.json() as CardEdition[];
    }).then(cards => setAllCards(previous => mergeCardLibrary(cards, previous)))
      .catch(() => { if (!controller.signal.aborted) setManifestFailed(true); });
    return () => controller.abort();
  }, []);

  const galleries = useMemo(() => {
    const bySpecies = new Map<number, CardEdition[]>();
    for (const card of allCards) {
      for (const id of cardSpeciesIds(card)) bySpecies.set(id, [...(bySpecies.get(id) ?? []), card]);
    }
    return bySpecies;
  }, [allCards]);
  function cardsFor(item: Pokemon) {
    return [...rankedCards(galleries.get(item.id) ?? [], currency), officialEdition(item)];
  }
  const cards = cardsFor(activePokemon);
  const card = resolveCard(cards, selectedIds[activePokemon.id])!;
  const cardIndex = cards.findIndex(item => item.cardId === card.cardId);
  const price = recentPrice(card, currency);
  const status = discovery[activePokemon.id];
  const artistCards = useMemo(() => rankedCards(allCards.filter(item => item.artist === activeArtist), currency), [allCards, activeArtist, currency]);
  const filtered = useMemo(() => pokemon.filter(item => {
    const search = query.trim().toLowerCase().replace(/^#0*/, '');
    return (!search || item.name.toLowerCase().includes(search) || String(item.id) === search || dexNumber(item.id) === search) &&
      (type === 'all' || item.types.includes(type)) && (!favoritesOnly || favorites.includes(item.id));
  }), [query, type, favoritesOnly, favorites]);

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (drawer && dialog && !dialog.open) dialog.showModal();
    if (!drawer && dialog?.open) dialog.close();
    pointer.current.cancel(); wheel.current.reset();
  }, [drawer]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    feed.focus({ preventScroll: true });
    let frame = 0;
    const syncIndex = () => {
      const index = adjacentIndex(Math.round(feed.scrollTop / feed.clientHeight), 0, pokemon.length);
      if (index !== activeIndexRef.current) { activeIndexRef.current = index; setActiveIndex(index); setHasScrolled(true); pointer.current.cancel(); }
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(syncIndex); };
    feed.addEventListener('scroll', onScroll, { passive: true });
    const resize = new ResizeObserver(() => { feed.scrollTop = activeIndexRef.current * feed.clientHeight; });
    resize.observe(feed);
    return () => { feed.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); resize.disconnect(); };
  }, []);

  function jumpTo(index: number, smooth = true) {
    const feed = feedRef.current;
    if (!feed) return;
    const next = adjacentIndex(index, 0, pokemon.length);
    feed.scrollTo({ top: next * feed.clientHeight, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }
  function moveSpecies(direction: number) { jumpTo(adjacentIndex(activeIndex, direction, pokemon.length)); }
  function moveArt(direction: number) {
    setSelectedIds(ids => {
      const current = resolveCard(cards, ids[activePokemon.id])!;
      const index = cards.findIndex(item => item.cardId === current.cardId);
      return { ...ids, [activePokemon.id]: cards[wrapIndex(index, direction, cards.length)].cardId };
    });
  }
  function openDrawer(next: Drawer) {
    // Inspecting a card is a deliberate selection, so incoming prices cannot swap it.
    if (next === 'details' || next === 'artist') setSelectedIds(ids => ({ ...ids, [activePokemon.id]: card.cardId }));
    setDrawer(next);
  }
  function closeDrawer() { setDrawer(null); }
  function openPokemon(item: Pokemon, selectedId?: string) {
    if (selectedId) setSelectedIds(ids => ({ ...ids, [item.id]: selectedId }));
    setDrawer(null); jumpTo(pokemon.findIndex(entry => entry.id === item.id), false);
    feedRef.current?.focus({ preventScroll: true });
  }
  function toggleFavorite() {
    const next = favorites.includes(activePokemon.id) ? favorites.filter(id => id !== activePokemon.id) : [...favorites, activePokemon.id];
    try { localStorage.setItem('pokedex.favorites.v1', JSON.stringify(next)); setFavorites(next); }
    catch { setError('This browser could not save favorites.'); }
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (!event.isPrimary) { pointer.current.cancel(); return; }
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button, a, input, select'))) return;
    pointer.current.start(event.pointerId, event.clientX, event.clientY);
    // Do not capture or prevent default: the browser owns vertical swipes and pinch zoom.
  }
  function handlePointerUp(event: React.PointerEvent) {
    const navigation = pointer.current.end(event.pointerId, event.clientX, event.clientY);
    if (navigation?.axis === 'x') moveArt(navigation.direction);
  }
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || drawerRef.current) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? feed.clientHeight : 1;
      const result = wheel.current.handle(event.deltaX * unit, event.deltaY * unit, event.timeStamp, false);
      if (result.preventDefault) event.preventDefault();
      if (result.navigation?.axis === 'x') moveArt(result.navigation.direction);
    };
    feed.addEventListener('wheel', onWheel, { passive: false });
    return () => feed.removeEventListener('wheel', onWheel);
  });

  function onFeedKey(event: React.KeyboardEvent) {
    if (drawer || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable]'))) return;
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowDown' || event.key === 'PageDown') moveSpecies(1);
    if (event.key === 'ArrowUp' || event.key === 'PageUp') moveSpecies(-1);
    if (event.key === 'ArrowLeft') moveArt(-1);
    if (event.key === 'ArrowRight') moveArt(1);
    if (event.key === 'Home') jumpTo(0);
    if (event.key === 'End') jumpTo(pokemon.length - 1);
  }

  return <main className={`app-shell type-${activePokemon.types[0]}`} onKeyDown={onFeedKey}>
    <div className="feed-backdrop" style={{ backgroundImage: `url("${card.image}")` }} aria-hidden="true" />
    <header className="topbar">
      <button className="brand" onClick={() => jumpTo(0)} aria-label="Pokédex, back to Bulbasaur"><span className="brand-ball" aria-hidden="true" />pokédex<span className="brand-dot">.</span></button>
      <span className="dex-position" aria-label={`Pokédex number ${activePokemon.id} of ${pokemon.length}`}>{dexNumber(activePokemon.id)} <span>/ {pokemon.length.toLocaleString('en-US')}</span></span>
      <button className="icon-button search-button" onClick={() => openDrawer('search')} aria-label="Search Pokédex"><Icon name="search" /></button>
    </header>

    <div ref={feedRef} className="species-feed" tabIndex={0} role="region" aria-label="Pokédex feed. Scroll vertically for species. Swipe horizontally or use left and right arrow keys for artwork."
      onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => pointer.current.cancel()} onLostPointerCapture={() => pointer.current.cancel()} onDragStart={event => event.preventDefault()}>
      {pokemon.map((item, index) => {
        const nearby = Math.abs(index - activeIndex) <= 1;
        const edition = nearby ? resolveCard(cardsFor(item), selectedIds[item.id])! : undefined;
        return <section className={`species-slide type-${item.types[0]}`} key={item.id} aria-label={`Number ${item.id}, ${item.name}`} aria-hidden={index !== activeIndex}>
          {edition && <>
            <span className="ghost-number" aria-hidden="true">{dexNumber(item.id)}</span>
            <div className={`art-stage ${edition.sourceType === 'official' ? 'is-official' : 'is-card'}`}>
              {brokenImages.includes(edition.image) ? <div className="image-unavailable"><Icon name="grid" /><span>Image unavailable</span><small>{edition.sourceType === 'official' ? item.name : edition.title}</small></div> :
                <img key={edition.image} className="hero-art" src={edition.image} alt={edition.sourceType === 'official' ? `${item.name}, official species artwork` : `${edition.title} Pokémon TCG card, illustrated by ${edition.artist}`} draggable={false} fetchPriority={index === activeIndex ? 'high' : 'low'} onError={() => setBrokenImages(old => [...old, edition.image])} />}
            </div>
          </>}
        </section>;
      })}
    </div>

    <div className="feed-overlay">
      <nav className="side-actions" aria-label="Species actions">
        <button className={`icon-button favorite-button ${favorites.includes(activePokemon.id) ? 'is-saved' : ''}`} onClick={toggleFavorite} aria-pressed={favorites.includes(activePokemon.id)} aria-label={`${favorites.includes(activePokemon.id) ? 'Unsave' : 'Save'} ${activePokemon.name}`}><Icon name="heart" /></button>
        <button className="icon-button" onClick={() => openDrawer('details')} aria-label="Artwork details, prices and sources"><Icon name="info" /></button>
      </nav>
      <div className="feed-caption" key={activePokemon.id}>
        <span className="species-types">{activePokemon.types.join(' · ')}</span>
        <h1>{activePokemon.name}</h1>
        {card.sourceType === 'official' ? <button className="credit-link" onClick={() => openDrawer('details')}>Official art <span>· PokéAPI ↗</span></button> :
          <button className="credit-link" onClick={() => { setActiveArtist(card.artist); openDrawer('artist'); }}>Art by {card.artist} <span>↗</span></button>}
      </div>
      <div className="feed-bottom">
        <nav className="art-controls" aria-label="Artwork editions">
          <button className="mini-button" onClick={() => moveArt(-1)} disabled={cards.length < 2} aria-label="Previous artwork"><Icon name="left" /></button>
          <button className="edition-count" onClick={() => openDrawer('details')} aria-label={`Artwork ${cardIndex + 1} of ${cards.length}. Open details`}>{cardIndex + 1}<span> / {cards.length}</span><span className="edition-word"> art</span></button>
          <button className="mini-button" onClick={() => moveArt(1)} disabled={cards.length < 2} aria-label="Next artwork"><Icon name="right" /></button>
        </nav>
        <nav className="species-controls" aria-label="Species navigation">
          <button className="mini-button previous-species" onClick={() => moveSpecies(-1)} disabled={activeIndex === 0} aria-label="Previous species"><Icon name="up" /></button>
          <button className="next-species" onClick={() => moveSpecies(1)} disabled={activeIndex === pokemon.length - 1} aria-label="Next species"><span>{activeIndex === pokemon.length - 1 ? 'End of the dex' : !hasScrolled ? 'Swipe up' : pokemon[activeIndex + 1].name}</span><Icon name="down" /></button>
        </nav>
      </div>
    </div>
    <div className="dex-progress" aria-hidden="true"><span style={{ width: `${((activeIndex + 1) / pokemon.length) * 100}%` }} /></div>
    <span className="sr-only" aria-live="polite">{activePokemon.name}, number {activePokemon.id}. {card.sourceType === 'official' ? 'Official art via PokéAPI. Individual artist not specified.' : `Artwork by ${card.artist}.`} Artwork {cardIndex + 1} of {cards.length}.</span>
    {error && <button className="toast" role="alert" onClick={() => setError('')}>{error} ×</button>}

    <dialog ref={dialogRef} className={`drawer drawer-${drawer ?? 'closed'}`} aria-labelledby="drawer-title" onCancel={closeDrawer} onClose={() => setDrawer(null)} onClick={event => { if (event.target === event.currentTarget) closeDrawer(); }}>
      <div className="drawer-surface">
        <header className="drawer-header"><div><span className="drawer-eyebrow">{drawer === 'search' ? 'Find your next favorite' : drawer === 'artist' ? 'Follow the illustrator' : `#${dexNumber(activePokemon.id)} · ${activePokemon.name}`}</span><h2 id="drawer-title">{drawer === 'search' ? 'Jump in.' : drawer === 'artist' ? activeArtist : 'Behind the art.'}</h2></div><button className="icon-button" onClick={closeDrawer} aria-label="Close panel"><Icon name="close" /></button></header>
        <div className="drawer-scroll">
          {drawer === 'search' && <>
            <label className="search-field"><Icon name="search" /><input autoFocus value={query} onChange={event => { setQuery(event.target.value); setVisibleLimit(60); }} placeholder="Name or number" aria-label="Search by name or Pokédex number" /></label>
            <div className="search-filters"><label className="sr-only" htmlFor="type-filter">Pokémon type</label><select id="type-filter" value={type} onChange={event => { setType(event.target.value); setVisibleLimit(60); }}><option value="all">All types</option>{types.map(name => <option key={name} value={name}>{name}</option>)}</select><button className={`filter-chip ${favoritesOnly ? 'active' : ''}`} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly(value => !value); setVisibleLimit(60); }}><Icon name="heart" />Saved {favorites.length}</button><span>{filtered.length.toLocaleString('en-US')}</span></div>
            <div className="species-grid">{filtered.slice(0, visibleLimit).map(item => <button className={`species-tile type-${item.types[0]}`} key={item.id} onClick={() => openPokemon(item)}><span>#{dexNumber(item.id)}</span><img src={artwork(item.id)} alt="" loading="lazy" /><strong>{item.name}</strong>{favorites.includes(item.id) && <span className="tile-saved" aria-label="Saved">♥</span>}</button>)}</div>
            {!filtered.length && <p className="empty-state">No matches. Try another name or number.</p>}
            {filtered.length > visibleLimit && <button className="load-more" onClick={() => setVisibleLimit(count => count + 60)}>Show more</button>}
            <p className="quiet-note">Saved on this browser. Search jumps to a species; the feed always stays in Pokédex order.</p>
          </>}
          {drawer === 'details' && <>
            <div className="details-identity"><img src={card.image} alt="" /><div><h3>{card.title}</h3><p>{card.set}{card.language && ` · ${card.number} · ${card.language.toUpperCase()}`}</p>{card.sourceType === 'official' ? <p>Individual artist not specified</p> : <button className="inline-link" onClick={() => { setActiveArtist(card.artist); setDrawer('artist'); }}>Art by {card.artist} ↗</button>}</div></div>
            <section className="detail-section"><div className="detail-heading"><h3>Artwork</h3><span>{cardIndex + 1} / {cards.length}</span></div><div className="art-rail">{cards.map(edition => <button className={card.cardId === edition.cardId ? 'selected' : ''} key={edition.cardId} onClick={() => setSelectedIds(ids => ({ ...ids, [activePokemon.id]: edition.cardId }))} aria-label={`${edition.title}, ${edition.sourceType === 'official' ? 'official artwork' : `${edition.set}, art by ${edition.artist}`}`} aria-current={card.cardId === edition.cardId ? 'true' : undefined}><img src={edition.image} alt="" loading="lazy" /></button>)}</div></section>
            <section className="detail-section"><div className="detail-heading"><h3>Market price</h3><select aria-label="Price currency and provider" value={currency} onChange={event => setCurrency(event.target.value)}><option value="USD">USD · TCGplayer</option><option value="EUR">EUR · Cardmarket</option></select></div>
              <p className="price-value">{formatPrice(card, currency) ?? 'No recent price'}</p>
              {price && <p className="detail-copy">{price.variant} · {price.metric} · updated {new Date(price.updatedAt).toLocaleDateString()}<br /><a href={price.url} target="_blank" rel="noreferrer">{price.provider} ↗</a></p>}
              <p className="quiet-note">Highest available {currency} price leads newly opened galleries. English, ungraded editions. Prices older than 7 days are excluded; currencies are never mixed.</p>
              <p className="source-status" role="status">{status?.error ?? (status?.done ? `${status.scanned} / ${status.total} source editions checked${status.failed ? ` · ${status.failed} unavailable` : ''}` : `Finding card editions… ${status?.scanned ?? 0} / ${status?.total || '…'}`)}{!status?.done && !status?.error && ' · coverage is partial'}</p>
              {(status?.error || (status?.failed ?? 0) > 0) && <button className="inline-link" onClick={() => { completedDiscovery.current.delete(activePokemon.id); setDiscoveryRetry(count => count + 1); }}>Retry card sources ↻</button>}
              {manifestFailed && <p className="quiet-note">Saved card collection unavailable. Live discovery and official species artwork remain available.</p>}
            </section>
            <section className="detail-section"><h3>Credit & source</h3><p className="detail-copy">{card.sourceType === 'official' ? 'Official species artwork via PokéAPI sprites. No individual artist is specified by this source.' : card.sourceType === 'catalog' ? 'Artist credit from TCGdex metadata. This edition has not been independently reviewed.' : `Reviewed edition. Artist evidence: ${card.artistEvidenceMethod}.`}</p><div className="source-links"><a href={card.image} target="_blank" rel="noreferrer">Original image ↗</a><a href={card.tcgdexUrl} target="_blank" rel="noreferrer">{card.sourceType === 'official' ? 'PokéAPI source' : 'TCGdex record'} ↗</a>{card.publisherUrl && <a href={card.publisherUrl} target="_blank" rel="noreferrer">Publisher page ↗</a>}{card.sourceType !== 'official' && <a href={card.artistEvidenceUrl} target="_blank" rel="noreferrer">{card.sourceType === 'catalog' ? 'Credit metadata' : 'Credit evidence'} ↗</a>}</div></section>
            <section className="detail-section"><h3>Keep exploring</h3><div className="source-links"><a href={`https://www.deviantart.com/search?q=${encodeURIComponent(activePokemon.name + ' pokemon')}`} target="_blank" rel="noreferrer">DeviantArt ↗</a><a href={`https://www.pixiv.net/en/tags/${encodeURIComponent(activePokemon.name)}/artworks`} target="_blank" rel="noreferrer">Pixiv ↗</a></div><p className="quiet-note">Opens the original communities. These are discovery links, not imported fan-art galleries.</p></section>
          </>}
          {drawer === 'artist' && <><p className="artist-summary">{artistCards.length} loaded artworks · {new Set(artistCards.flatMap(cardSpeciesIds)).size} Pokémon</p><div className="artist-grid">{artistCards.map(edition => <button key={edition.cardId} onClick={() => { const item = pokemon.find(entry => belongsToSpecies(edition, entry.id)); if (item) openPokemon(item, edition.cardId); }}><img src={edition.image} alt={`${edition.title}, ${edition.set}`} loading="lazy" /><strong>{edition.title}</strong><span>{edition.set} · {edition.number}</span></button>)}</div><p className="quiet-note">Only artworks already loaded in this session. Each edition keeps its own credit and source.</p><button className="load-more" onClick={() => setDrawer('details')}>Back to artwork details</button></>}
        </div>
      </div>
    </dialog>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
