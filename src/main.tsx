import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Pokemon = {
  id: number;
  name: string;
  types: string[];
  height: number;
  weight: number;
};
type CardEdition = {
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
  imageDimensions: { width: number; height: number };
  tcgdexUrl: string;
  publisherUrl?: string;
  publisherCheck: string;
  artistEvidenceMethod: string;
  artistEvidenceUrl: string;
  artistObservedText: string;
};
type Page = "index" | "museum" | "artist";
type CardLoad = { key: string; cards: CardEdition[] };

const artwork = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const number = (id: number) => `#${String(id).padStart(3, "0")}`;

function App() {
  const [pokemon, setPokemon] = useState<Pokemon[]>([]);
  const [allCards, setAllCards] = useState<CardEdition[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [page, setPage] = useState<Page>("index");
  const [activePokemonId, setActivePokemonId] = useState(887);
  const [activeArtist, setActiveArtist] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cardLoad, setCardLoad] = useState<CardLoad>({ key: "", cards: [] });
  const [slideIndex, setSlideIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const lastWheelMove = useRef(0);

  useEffect(() => {
    let current = true;
    Promise.all([
      fetch("/api/pokemon").then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        return (await response.json()) as Pokemon[];
      }),
      fetch("/api/favorites").then(async (response) => {
        if (!response.ok) throw new Error("favorites unavailable");
        return (await response.json()) as number[];
      }),
      fetch("/api/cards").then(async (response) => {
        if (!response.ok) throw new Error("card manifest unavailable");
        return (await response.json()) as CardEdition[];
      }),
    ])
      .then(([items, saved, cards]) => {
        if (!current) return;
        setPokemon(items);
        setFavorites(saved);
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
  const cards = cardLoad.key === cardKey ? cardLoad.cards : [];

  useEffect(() => {
    if (page === "index") return;
    const url =
      page === "artist"
        ? `/api/cards?artist=${encodeURIComponent(activeArtist)}`
        : `/api/cards?pokemonId=${activePokemonId}`;
    let current = true;
    setCardLoad({ key: "", cards: [] });
    setSlideIndex(0);
    setBrokenImages([]);
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error("card editions unavailable");
        return (await response.json()) as CardEdition[];
      })
      .then((items) => {
        if (current) setCardLoad({ key: cardKey, cards: items });
      })
      .catch(() => {
        if (current) {
          setCardLoad({ key: cardKey, cards: [] });
          setError(
            "these card editions could not load. return to the pokédex and try again.",
          );
        }
      });
    return () => {
      current = false;
    };
  }, [page, activeArtist, activePokemonId, cardKey]);

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
    setSlideIndex((index) => (index + direction + cards.length) % cards.length);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        page === "index" ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
      if (event.key === "Escape") setPage("index");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function toggleFavorite(item: Pokemon) {
    if (savingId !== null) return;
    const isFavorite = favorites.includes(item.id);
    setSavingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/favorites/${item.id}`, {
        method: isFavorite ? "DELETE" : "POST",
      });
      if (!response.ok) throw new Error("save failed");
      setFavorites((current) =>
        isFavorite
          ? current.filter((id) => id !== item.id)
          : [...current, item.id],
      );
    } catch {
      setError("could not save that favorite. try again.");
    } finally {
      setSavingId(null);
    }
  }

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
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, a, input, select")
    )
      return;
    dragStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const distanceX = event.clientX - start.x;
    const distanceY = event.clientY - start.y;
    if (
      Math.abs(distanceX) > 45 &&
      Math.abs(distanceX) > Math.abs(distanceY) * 1.25
    ) {
      move(distanceX < 0 ? 1 : -1);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLElement>) {
    if (cards.length < 2) return;
    const distance =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (Math.abs(distance) < 24) return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheelMove.current < 420) return;
    lastWheelMove.current = now;
    move(distance > 0 ? 1 : -1);
  }

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
          <span className="edition">collection no. 001—019</span>
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
                  {collectionCount || "—"} species / {allCards.length} checked
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
                {visible.map((item, index) => (
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
                      <img src={artwork(item.id)} alt="" loading="lazy" />
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
                  ? `checked artworks across ${new Set(cards.map((card) => card.pokemonId)).size || "…"} Pokémon`
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
                {cards.length || (loading ? "…" : "0")} checked{" "}
                {cards.length === 1 ? "edition" : "editions"}
              </span>
            </div>
          </div>

          {loading || (cardLoad.key !== cardKey && !error) ? (
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
                  : "no checked card editions yet"}
              </h2>
              <p>
                {error
                  ? "the previous species and artist credit are cleared. try again from the pokédex."
                  : "this species has no reviewed card credits in the local archive yet."}
              </p>
              <button className="text-button" onClick={() => setPage("index")}>
                return to the pokédex ↗
              </button>
            </div>
          ) : selectedCard ? (
            <>
              <div
                className="museum-stage"
                role="region"
                aria-label="looping card gallery; drag, swipe, scroll, or use arrow keys"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  dragStart.current = null;
                }}
                onWheel={handleWheel}
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
                    onClick={() => setSlideIndex(index)}
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
                {cards.length > 1 ? (
                  <>
                    drag or swipe <span>·</span> scroll / trackpad{" "}
                    <span>·</span> use ← → <span>·</span> looping archive
                  </>
                ) : (
                  "one checked card edition · more appear here when their credits clear review"
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
            alt={`${card.title} Pokémon TCG card artwork`}
            onError={onImageError}
            draggable={false}
          />
        )}
      </div>
      <div className="credit-plaque">
        <div className="credit-copy">
          <span className="credit-label">illustrated by</span>
          <button
            className="artist-link"
            onClick={onArtist}
            aria-label={`explore other verified artworks by ${card.artist}`}
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
          image: {card.imageProvider} · credit checked on{" "}
          {card.artistEvidenceMethod.includes("publisher")
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
            TCGdex ↗
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
