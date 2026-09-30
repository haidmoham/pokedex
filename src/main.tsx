import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { PointerGesture, WheelGesture, wrapIndex } from "./navigation";

type Pokemon = {
  id: number;
  name: string;
  types: string[];
  height: number;
  weight: number;
};
type Price = { amount:number; currency:string; variant:string; updatedAt:string; provider:string; metric:string; url:string };
type CardEdition = {
  prices?: Price[];
  sourceType?: string;
  pokemonId: number;
  pokemonName: string;
  cardId: string;
  title: string;
  set: string;
  number: string;
  language: string;
  rarity: string;
  artist: string;
  image: string;
  imageProvider: string;
  imageSha256: string;
  imageDimensions?: { width: number; height: number };
  tcgdexUrl: string;
  publisherUrl?: string;
  publisherCheck: string;
  artistEvidenceMethod: string;
  artistEvidenceUrl: string;
  artistObservedText: string;
};
type Page = "index" | "museum" | "artist";

const artwork = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const number = (id: number) => `#${String(id).padStart(3, "0")}`;

function App() {
  const [pokemon, setPokemon] = useState<Pokemon[]>([]);
  const [allCards, setAllCards] = useState<CardEdition[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [page, setPage] = useState<Page>("museum");
  const [activePokemonId, setActivePokemonId] = useState(887);
  const [activeArtist, setActiveArtist] = useState("");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [type, setType] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("USD");
  const [discovery, setDiscovery] = useState<Record<number,{scanned:number;total:number;done:boolean;failed:number;error?:string}>>({});
  const completedDiscovery = useRef(new Set<number>());
  const [discoveryRetry,setDiscoveryRetry]=useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  const savingId: number | null = null;
  const pointerGesture = useRef(new PointerGesture());
  const wheelGesture = useRef(new WheelGesture());
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    Promise.all([
      fetch("/api/pokemon").then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        return (await response.json()) as Pokemon[];
      }),
      Promise.resolve().then(() => {
        try { const saved=JSON.parse(localStorage.getItem('pokedex.favorites.v1') || '[]'); return Array.isArray(saved) ? saved.filter((id:unknown)=>Number.isInteger(id)) as number[] : []; }
        catch { return [] as number[]; }
      }),
      fetch("/api/cards").then(async (response) => {
        if (!response.ok) throw new Error("card manifest unavailable");
        return (await response.json()) as CardEdition[];
      }),
    ])
      .then(([items, saved, cards]) => {
        if (!current) return;
        setPokemon(items);
        setFavorites(saved.filter(id=>items.some(item=>item.id===id)));
        setAllCards(cards);
        setLoading(false);
      })
      .catch(() => {
        if (!current) return;
        setError("the collection could not load. refresh to try again.");
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const types = useMemo(
    () => [...new Set(pokemon.flatMap((item) => item.types))].sort(),
    [pokemon],
  );
  const visible = useMemo(
    () =>
      pokemon.filter((item) => {
        const search = query.trim().toLowerCase();
        return (
          (!search ||
            item.name.toLowerCase().includes(search) ||
            String(item.id) === search ||
            number(item.id).toLowerCase() === search) &&
          (type === "all" || item.types.includes(type)) &&
          (!favoritesOnly || favorites.includes(item.id))
        );
      }),
    [pokemon, query, type, favoritesOnly, favorites],
  );

  const activePokemon = pokemon.find((item) => item.id === activePokemonId);
  const cardKey =
    page === "artist" ? `artist:${activeArtist}` : `pokemon:${activePokemonId}`;
  const bestPrice = (card: CardEdition) => card.prices?.filter(p=>p.currency===currency).sort((a,b)=>b.amount-a.amount)[0];
  const cards = allCards.filter((card) =>
    page === "artist" ? card.artist === activeArtist : card.pokemonId === activePokemonId,
  ).sort((a,b)=>(bestPrice(b)?.amount ?? -1)-(bestPrice(a)?.amount ?? -1) || a.cardId.localeCompare(b.cardId));
  if(page === 'museum' && activePokemon) cards.push({pokemonId:activePokemon.id,pokemonName:activePokemon.name,cardId:`official-${activePokemon.id}`,title:activePokemon.name,set:'official species artwork',number:number(activePokemon.id),language:'',rarity:'',artist:'individual artist not specified',image:artwork(activePokemon.id),imageProvider:'PokéAPI sprites',imageSha256:'',imageDimensions:{width:475,height:475},tcgdexUrl:'https://github.com/PokeAPI/sprites',publisherCheck:'',artistEvidenceMethod:'official species artwork; individual artist not specified',artistEvidenceUrl:'https://github.com/PokeAPI/sprites',artistObservedText:'',sourceType:'official'});
  const slideIndex = Math.max(0,cards.findIndex(card=>card.cardId===selectedIds[cardKey]));
  const feed = useMemo(() => {
    const featured = [887, 94];
    return [...pokemon].sort((a, b) => {
      const rank = (id: number) => featured.includes(id) ? featured.indexOf(id) : featured.length + id;
      return rank(a.id) - rank(b.id);
    });
  }, [pokemon]);
  const speciesIndex = feed.findIndex((item) => item.id === activePokemonId);

  function selectCard(index: number) {
    if(cards[index]) setSelectedIds(ids=>({...ids,[cardKey]:cards[index].cardId}));
  }

  function moveSpecies(direction: number) {
    if (page !== "museum" || feed.length < 2) return;
    setActivePokemonId((id) => {
      const index = feed.findIndex((item) => item.id === id);
      return feed[wrapIndex(index, direction, feed.length)].id;
    });
    setError("");
  }

  useEffect(() => {
    pointerGesture.current.cancel();
    wheelGesture.current.reset();
    stageRef.current?.focus({ preventScroll: true });
  }, [page, loading]);

  useEffect(() => {
    pointerGesture.current.cancel();
  }, [cardKey]);

  const selectedCard = cards.length
    ? cards[slideIndex % cards.length]
    : undefined;
  const previousCard =
    cards.length > 1
      ? cards[(slideIndex - 1 + cards.length) % cards.length]
      : undefined;
  const nextCard =
    cards.length > 1 ? cards[(slideIndex + 1) % cards.length] : undefined;

  function move(direction: number) {
    if (cards.length < 2) return;
    setSelectedIds(ids=>{
      const index=Math.max(0,cards.findIndex(c=>c.cardId===ids[cardKey]));
      return {...ids,[cardKey]:cards[wrapIndex(index,direction,cards.length)].cardId};
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        page === "index" ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (event.key === "Escape") {
        setPage("index");
        return;
      }
      if (!(target instanceof Element) || !target.closest(".museum-stage, .card-rail, .species-feed-nav")) return;
      if (page === "artist" && (event.key === "ArrowUp" || event.key === "ArrowDown")) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
          target instanceof Element && target.closest(".museum-stage, .card-rail")) {
        stageRef.current?.focus({ preventScroll: true });
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
      if (page === "museum" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        moveSpecies(event.key === "ArrowDown" ? 1 : -1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function toggleFavorite(item: Pokemon) {
    const next = favorites.includes(item.id) ? favorites.filter(id=>id!==item.id) : [...favorites,item.id];
    try { localStorage.setItem('pokedex.favorites.v1',JSON.stringify(next)); setFavorites(next); }
    catch { setError('this browser could not save favorites. enable local storage or keep browsing without saving.'); }
  }

  useEffect(() => {
    if (loading || page !== 'museum' || completedDiscovery.current.has(activePokemonId)) return;
    const id=activePokemonId; const controller=new AbortController(); let live=true;
    async function discover() {
      let offset:number|null=0, scanned=0, failed=0;
      while(offset !== null && live) {
        try {
          const response: Response=await fetch(`/api/discovery/${id}?offset=${offset}`,{signal:controller.signal});
          if(!response.ok) throw new Error('unavailable');
          const data: {cards:CardEdition[];scanned:number;failed:string[];total:number;nextOffset:number|null}=await response.json();
          if(!live) return;
          scanned+=data.scanned; failed+=data.failed.length;
          setAllCards(previous=>{
            const byId=new Map(previous.map(c=>[c.cardId,c]));
            for(const card of data.cards as CardEdition[]) {
              const checked=byId.get(card.cardId);
              byId.set(card.cardId,checked && !checked.sourceType ? {...checked,prices:card.prices} : card);
            }
            return [...byId.values()];
          });
          offset=data.nextOffset;
          setDiscovery(old=>({...old,[id]:{scanned,total:data.total,failed,done:offset===null}}));
        } catch {
          if(live)setDiscovery(old=>({...old,[id]:{scanned,total:old[id]?.total??0,failed,done:false,error:'card source unavailable; showing the saved collection'}}));
          return;
        }
      }
      if(live)completedDiscovery.current.add(id);
    }
    discover();
    return ()=>{live=false;controller.abort();};
  },[activePokemonId,page,loading,discoveryRetry]);

  function openPokemon(item: Pokemon) {
    setActivePokemonId(item.id);
    setActiveArtist("");
    setError("");
    setPage("museum");
  }

  function openArtist(artist: string) {
    setActiveArtist(artist);
    setError("");
    setPage("artist");
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!event.isPrimary) {
      pointerGesture.current.cancel();
      return;
    }
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, select")) return;
    pointerGesture.current.start(event.pointerId, event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const navigation = pointerGesture.current.end(event.pointerId, event.clientX, event.clientY);
    if (navigation?.axis === "x") move(navigation.direction);
    if (navigation?.axis === "y") moveSpecies(navigation.direction);
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(event: WheelEvent) {
      // Preserve browser zoom and native vertical scrolling in artist galleries.
      if (event.ctrlKey) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage!.clientHeight : 1;
      const { navigation, preventDefault } = wheelGesture.current.handle(
        event.deltaX * unit, event.deltaY * unit, event.timeStamp, page === "museum",
      );
      if (preventDefault) event.preventDefault();
      if (navigation?.axis === "x") move(navigation.direction);
      if (navigation?.axis === "y") moveSpecies(navigation.direction);
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  });

  const collectionCount = pokemon.length;

  return (
    <main className={`app-shell page-${page}`}>
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setPage("index")}
          aria-label="return to pokédex"
        >
          <span className="brand-seal" aria-hidden="true">
            <i />
            <b />
          </span>
          <span>pocket field guide</span>
        </button>
        <div className="topbar-right">
          <span className="edition">{pokemon.length || "…"} species / artist discovery</span>
          {page !== "index" && (
            <button className="text-button" onClick={() => setPage("index")}>
              ← pokédex
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {page === "index" ? (
        <>
          <section className="index-hero" aria-label="Pokédex introduction">
            <div className="hero-copy">
              <p className="eyebrow">
                <span /> the living card archive
              </p>
              <h1>
                meet them
                <br />
                <em>in ink.</em>
              </h1>
              <p className="hero-description">
                find a familiar face. follow its artwork somewhere new.
              </p>
              <div className="hero-meta">
                <span>
                  {collectionCount || "—"} species / {allCards.length} sourced
                  card editions
                </span>
                <span className="hero-rule" />
              </div>
            </div>
            <button
              className="hero-specimen"
              onClick={() => {
                setActivePokemonId(887);
                setActiveArtist("");
                setError("");
                setPage("museum");
              }}
              aria-label="open Dragapult card gallery"
            >
              <span className="hero-coordinate">#887 / featured arrival</span>
              <span className="hero-orbit orbit-one" aria-hidden="true" />
              <span className="hero-orbit orbit-two" aria-hidden="true" />
              <img src={artwork(887)} alt="" />
              <span className="hero-specimen-caption">
                <span>Dragapult</span>
                <span>enter the gallery ↗</span>
              </span>
              <span className="hero-snow" aria-hidden="true">
                ✳
              </span>
            </button>
          </section>

          <section className="index-section" aria-label="Pokédex">
            <div className="section-heading">
              <div>
                <p className="eyebrow">choose a species</p>
                <h2>the pokédex</h2>
              </div>
              <span className="section-count">
                {visible.length} / {pokemon.length} entries
              </span>
            </div>
            <div className="filters">
              <label className="search-field">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="find a name or number"
                  aria-label="search by name or number"
                />
              </label>
              <label className="type-field">
                <span>type</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="all">all types</option>
                  {types.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={`favorites-filter ${favoritesOnly ? "active" : ""}`}
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly(!favoritesOnly)}
              >
                <span aria-hidden="true">♥</span> saved{" "}
                <span className="favorite-count">{favorites.length}</span>
              </button>
            </div>
            {loading ? (
              <div className="empty-state">
                <span className="loading-mark">✳</span>
                <p>opening the field guide…</p>
              </div>
            ) : visible.length ? (
              <div className="species-grid">
                {visible.slice(0,visibleLimit).map((item, index) => (
                  <article
                    className={`species-card type-${item.types[0]}`}
                    key={item.id}
                    style={{ "--card-index": index } as React.CSSProperties}
                  >
                    <button
                      className="species-open"
                      onClick={() => openPokemon(item)}
                      aria-label={`open ${item.name} card gallery`}
                    >
                      <span className="species-number">{number(item.id)}</span>
                      <span className="species-halo" aria-hidden="true" />
                      <img src={allCards.filter(c=>c.pokemonId===item.id).sort((a,b)=>(bestPrice(b)?.amount??-1)-(bestPrice(a)?.amount??-1))[0]?.image ?? artwork(item.id)} alt="" loading="lazy" />
                      <span className="species-name">{item.name}</span>
                      <span className="species-type">
                        {item.types.join(" / ")}
                      </span>
                      <span className="species-open-mark" aria-hidden="true">
                        ↗
                      </span>
                    </button>
                    <button
                      className={`species-heart ${favorites.includes(item.id) ? "saved" : ""}`}
                      onClick={() => toggleFavorite(item)}
                      disabled={savingId !== null}
                      aria-label={`${favorites.includes(item.id) ? "remove" : "add"} ${item.name} ${favorites.includes(item.id) ? "from" : "to"} favorites`}
                      aria-pressed={favorites.includes(item.id)}
                    >
                      {favorites.includes(item.id) ? "♥" : "♡"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span>✳</span>
                <h3>no species found</h3>
                <p>change the search or filter.</p>
              </div>
            )}
            {visible.length > visibleLimit && <button className="load-more" onClick={()=>setVisibleLimit(limit=>limit+60)}>show 60 more species ({visibleLimit} / {visible.length})</button>}
          </section>
          <footer className="footer">
            <span>
              species artwork via{" "}
              <a
                href="https://github.com/PokeAPI/sprites"
                target="_blank"
                rel="noreferrer"
              >
                PokéAPI sprites ↗
              </a>
            </span>
            <span>card artists are credited edition by edition</span>
          </footer>
        </>
      ) : (
        <section
          className="museum-page"
          aria-label={
            page === "artist"
              ? `${activeArtist} card gallery`
              : `${activePokemon?.name ?? "Pokémon"} card gallery`
          }
        >
          <div className="museum-heading">
            <div>
              <p className="eyebrow">
                <span />{" "}
                {page === "artist"
                  ? "follow the illustrator"
                  : "card edition / image archive"}
              </p>
              <h1>
                {page === "artist" ? (
                  <>
                    {activeArtist}
                    <span className="heading-period">.</span>
                  </>
                ) : (
                  <>
                    {activePokemon?.name ?? "pokemon"}
                    <span className="heading-period">.</span>
                  </>
                )}
              </h1>
              <p className="museum-subtitle">
                {page === "artist"
                  ? `loaded artworks across ${new Set(cards.map((card) => card.pokemonId)).size || "…"} Pokémon`
                  : `${activePokemon ? number(activePokemon.id) : ""} · ${activePokemon?.types.join(" / ") ?? ""} · follow the illustrator`}
              </p>
            </div>
            <div className="museum-actions">
              {page === "artist" ? (
                <button
                  className="text-button"
                  onClick={() => setPage("museum")}
                >
                  ← back to {activePokemon?.name ?? "species"}
                </button>
              ) : (
                <button
                  className={`save-species ${activePokemon && favorites.includes(activePokemon.id) ? "saved" : ""}`}
                  onClick={() => activePokemon && toggleFavorite(activePokemon)}
                  disabled={!activePokemon || savingId !== null}
                  aria-pressed={
                    activePokemon ? favorites.includes(activePokemon.id) : false
                  }
                >
                  {activePokemon && favorites.includes(activePokemon.id)
                    ? "♥ saved"
                    : "♡ save species"}
                </button>
              )}
              <span className="source-count">
                {cards.length || (loading ? "…" : "0")} sourced{" "}
                {cards.length === 1 ? "edition" : "editions"}
              </span>
            </div>
          </div>

          {page === 'museum' && activePokemon && <section className="discovery-panel" aria-label="price and artist discovery">
            <div className="price-controls"><label>price source <select value={currency} onChange={event=>{setCurrency(event.target.value);setSelectedIds(ids=>{const next={...ids};delete next[cardKey];return next;});}}><option value="USD">TCGplayer · USD</option><option value="EUR">Cardmarket · EUR</option></select></label>
            <span role="status">{discovery[activePokemonId]?.error ?? (discovery[activePokemonId]?.done ? `${discovery[activePokemonId].scanned} source editions checked${discovery[activePokemonId].failed ? ` · ${discovery[activePokemonId].failed} unavailable` : ''}` : `finding card editions & prices… ${discovery[activePokemonId]?.scanned ?? 0} / ${discovery[activePokemonId]?.total || '…'}`)}</span></div>
            {(discovery[activePokemonId]?.error || discovery[activePokemonId]?.failed > 0) && <button className="text-button" onClick={()=>{completedDiscovery.current.delete(activePokemonId);setDiscoveryRetry(n=>n+1);}}>retry missing card sources ↻</button>}
            <p>{selectedCard && bestPrice(selectedCard) ? `${new Intl.NumberFormat('en-US',{style:'currency',currency}).format(bestPrice(selectedCard)!.amount)} · ${bestPrice(selectedCard)!.variant} · ${bestPrice(selectedCard)!.metric} · updated ${new Date(bestPrice(selectedCard)!.updatedAt).toLocaleDateString()}` : 'no recent comparable price for this edition'}<br/><small>highest available {currency} value leads the loaded collection · english ungraded editions only · partial until discovery finishes</small>{selectedCard && bestPrice(selectedCard) && <> · <a href={bestPrice(selectedCard)!.url} target="_blank" rel="noreferrer">price source ↗</a></>}</p>
            <details><summary>discover more art of {activePokemon.name}</summary><p>these open the original communities. fan art is not scraped or rehosted here; artist attribution and access controls remain at the source.</p><div className="discovery-links"><a href={`https://www.deviantart.com/search?q=${encodeURIComponent(activePokemon.name+' pokemon')}`} target="_blank" rel="noreferrer">DeviantArt ↗</a><a href={`https://www.pixiv.net/en/tags/${encodeURIComponent(activePokemon.name)}/artworks`} target="_blank" rel="noreferrer">Pixiv ↗</a><a href={artwork(activePokemon.id)} target="_blank" rel="noreferrer">official species artwork ↗</a></div></details>
          </section>}
              {page === "museum" && feed.length > 1 && (
                <nav className="species-feed-nav" aria-label="species feed">
                  <button onClick={() => moveSpecies(-1)} aria-label="previous species">↑ previous species</button>
                  <span aria-live="polite">{speciesIndex + 1} / {feed.length} species · {activePokemon?.name}</span>
                  <button onClick={() => moveSpecies(1)} aria-label="next species">next: {feed[wrapIndex(speciesIndex, 1, feed.length)]?.name} ↓</button>
                </nav>
              )}

          {loading ? (
            <div className="museum-empty" aria-live="polite">
              <span className="loading-mark">✳</span>
              <p>opening the card drawers…</p>
            </div>
          ) : cards.length === 0 ? (
            <div className="museum-empty">
              <span aria-hidden="true">✳</span>
              <h2>
                {error
                  ? "the archive is asleep"
                  : "no card editions loaded yet"}
              </h2>
              <p>
                {error
                  ? "the previous species and artist credit are cleared. try again from the pokédex."
                  : "live card discovery is loading or has no usable results. official species artwork is available below."}
              </p>
              {activePokemon && <img className="official-fallback" src={artwork(activePokemon.id)} alt={`${activePokemon.name} official species artwork via PokéAPI`} />}
              <p>official species artwork via PokéAPI · individual artist not specified</p>
              <button className="text-button" onClick={() => setPage("index")}>
                return to the pokédex ↗
              </button>
            </div>
          ) : selectedCard ? (
            <>
              <div
                ref={stageRef}
                tabIndex={0}
                className="museum-stage"
                role="region"
                aria-label={page === "museum" ? "card feed: swipe or use up and down for species, left and right for card editions" : "artist gallery: swipe left and right for card editions"}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  pointerGesture.current.cancel();
                }}
                onLostPointerCapture={() => { pointerGesture.current.cancel(); }}
                onDragStart={(event) => event.preventDefault()}
              >
                <span className="stage-index index-left" aria-hidden="true">
                  {number(selectedCard.pokemonId)}
                </span>
                {previousCard && (
                  <NeighborCard
                    card={previousCard}
                    side="previous"
                    onClick={() => move(-1)}
                  />
                )}
                {cards.length > 1 && (
                  <button
                    className="gallery-arrow arrow-previous"
                    onClick={() => move(-1)}
                    aria-label="previous card edition"
                  >
                    ←
                  </button>
                )}
                <CardFrame
                  key={selectedCard.cardId}
                  card={selectedCard}
                  onArtist={() => openArtist(selectedCard.artist)}
                  broken={brokenImages.includes(selectedCard.cardId)}
                  onImageError={() =>
                    setBrokenImages((items) => [...items, selectedCard.cardId])
                  }
                  position={slideIndex + 1}
                  total={cards.length}
                />
                {cards.length > 1 && (
                  <button
                    className="gallery-arrow arrow-next"
                    onClick={() => move(1)}
                    aria-label="next card edition"
                  >
                    →
                  </button>
                )}
                {nextCard && (
                  <NeighborCard
                    card={nextCard}
                    side="next"
                    onClick={() => move(1)}
                  />
                )}
                <span className="stage-index index-right" aria-hidden="true">
                  {String(slideIndex + 1).padStart(2, "0")} /{" "}
                  {String(cards.length).padStart(2, "0")}
                </span>
              </div>
              <nav className="card-rail" aria-label="select card edition">
                {cards.map((card, index) => (
                  <button
                    className={`rail-item ${index === slideIndex ? "selected" : ""}`}
                    key={card.cardId}
                    onClick={() => selectCard(index)}
                    aria-current={index === slideIndex ? "true" : undefined}
                    aria-label={`${card.title}, ${card.set}, illustrated by ${card.artist}`}
                  >
                    <img src={card.image} alt="" loading="lazy" />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </button>
                ))}
                <span className="rail-loop" aria-hidden="true">
                  ∞
                </span>
              </nav>
              <p className="navigation-hint">
                {page === "museum" && <>↑ ↓ species <span>·</span> ← → card art <span>·</span> swipe on the card<br /></>}
                {cards.length > 1 ? (
                  <>
                    horizontal swipe <span>·</span> horizontal trackpad{" "}
                    <span>·</span> use ← → <span>·</span> looping archive
                  </>
                ) : (
                  "one sourced card edition · source credits remain attached"
                )}
              </p>
            </>
          ) : null}

          <footer className="footer museum-footer">
            <button className="text-button" onClick={() => setPage("index")}>
              ← all species
            </button>
            <span>
              card scan: recorded provider · credit: edition sources below
            </span>
          </footer>
        </section>
      )}
    </main>
  );
}

function NeighborCard({
  card,
  side,
  onClick,
}: {
  card: CardEdition;
  side: "previous" | "next";
  onClick: () => void;
}) {
  return (
    <button
      className={`neighbor-card neighbor-${side}`}
      onClick={onClick}
      aria-label={`view ${card.title}, illustrated by ${card.artist}`}
    >
      <span className="neighbor-art">
        <img src={card.image} alt="" />
      </span>
      <span className="neighbor-caption">
        <strong>{card.title}</strong>
        <small>art by {card.artist}</small>
        <small className="neighbor-meta">
          {card.set} · {card.number} · {card.language.toUpperCase()}
        </small>
      </span>
    </button>
  );
}

function CardFrame({
  card,
  onArtist,
  broken,
  onImageError,
  position,
  total,
}: {
  card: CardEdition;
  onArtist: () => void;
  broken: boolean;
  onImageError: () => void;
  position: number;
  total: number;
}) {
  return (
    <article
      className="card-frame"
      key={card.cardId}
      aria-live="polite"
      aria-label={`${card.title}, illustrated by ${card.artist}`}
    >
      <div className="card-frame-top">
        <span>
          {card.set} / {card.number}
        </span>
        <span>
          {card.language.toUpperCase()} · {String(position).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="card-image-mat">
        <span className="image-corner corner-tl" aria-hidden="true" />
        <span className="image-corner corner-br" aria-hidden="true" />
        {broken ? (
          <div
            className="image-unavailable"
            role="img"
            aria-label={`${card.title} image unavailable`}
          >
            <span>image unavailable</span>
            <small>this edition is still identified below</small>
          </div>
        ) : (
          <img
            className="card-art"
            src={card.image}
            alt={card.sourceType === "official" ? `${card.title} official species artwork` : `${card.title} Pokémon TCG card artwork`}
            onError={onImageError}
            draggable={false}
          />
        )}
      </div>
      <div className="credit-plaque">
        <div className="credit-copy">
          <span className="credit-label">{card.sourceType === "official" ? "official species artwork" : "illustrated by"}</span>
          <button
            className="artist-link"
            disabled={card.sourceType === "official"}
            onClick={onArtist}
            aria-label={`explore loaded artworks by ${card.artist}`}
          >
            {card.artist}
            <span aria-hidden="true"> ↗</span>
          </button>
          <span className="card-identity">
            {card.title} · {card.set} · {card.number}
          </span>
        </div>
        <span className="plaque-mark" aria-hidden="true">
          ✳
        </span>
      </div>
      <div className="source-line">
        <span>
          image: {card.imageProvider} · credit source:{" "}
          {card.sourceType === 'official' ? 'PokéAPI sprites; individual artist unspecified' : card.sourceType === 'catalog' ? 'TCGdex metadata (not independently reviewed)' : card.artistEvidenceMethod.includes("publisher")
            ? "publisher card page"
            : "printed scan"}
        </span>
        <span className="source-links">
          {card.publisherUrl && (
            <a href={card.publisherUrl} target="_blank" rel="noreferrer">
              Pokémon TCG ↗
            </a>
          )}
          <a href={card.tcgdexUrl} target="_blank" rel="noreferrer">
            {card.sourceType === "official" ? "PokéAPI source ↗" : "TCGdex ↗"}
          </a>
          <a href={card.image} target="_blank" rel="noreferrer">
            open image ↗
          </a>
          <a
            href={card.artistEvidenceUrl}
            target="_blank"
            rel="noreferrer"
            className="evidence-link"
          >
            {card.publisherUrl ? "credit evidence ↗" : "printed credit ↗"}
          </a>
        </span>
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
