import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Pokemon = {
  id: number;
  name: string;
  types: string[];
  height: number;
  weight: number;
};
type View = "gallery" | "overview";

const artwork = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const number = (id: number) => `#${String(id).padStart(3, "0")}`;

function App() {
  const [pokemon, setPokemon] = useState<Pokemon[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [view, setView] = useState<View>("gallery");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/pokemon").then(
        (response) => response.json() as Promise<Pokemon[]>,
      ),
      fetch("/api/favorites").then(
        (response) => response.json() as Promise<number[]>,
      ),
    ])
      .then(([items, saved]) => {
        setPokemon(items);
        setFavorites(saved);
        setSelectedId(items[0]?.id ?? null);
      })
      .catch(() =>
        setError("the collection could not load. refresh to try again."),
      );
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
            String(item.id) === search) &&
          (type === "all" || item.types.includes(type)) &&
          (!favoritesOnly || favorites.includes(item.id))
        );
      }),
    [pokemon, query, type, favoritesOnly, favorites],
  );

  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  const selectedIndex = selected
    ? visible.findIndex((item) => item.id === selected.id)
    : -1;
  const previous =
    visible.length > 1
      ? visible[(selectedIndex - 1 + visible.length) % visible.length]
      : null;
  const next =
    visible.length > 1 ? visible[(selectedIndex + 1) % visible.length] : null;

  function move(direction: number) {
    if (visible.length < 2) return;
    const index = selectedIndex < 0 ? 0 : selectedIndex;
    setSelectedId(
      visible[(index + direction + visible.length) % visible.length].id,
    );
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        view !== "gallery" ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
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

  return (
    <main className="app-shell">
      <div className="wall-light" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>pokédex</span>
        </div>
        <div className="topbar-right">
          <span className="edition">field notes / 001</span>
          <button
            className="view-toggle"
            onClick={() => setView(view === "gallery" ? "overview" : "gallery")}
          >
            {view === "gallery" ? "view all ↗" : "gallery view ↗"}
          </button>
        </div>
      </header>

      <section className="intro" aria-label="Collection introduction">
        <p className="eyebrow">a small collection of familiar faces</p>
        <h1>
          the first encounters<span>.</span>
        </h1>
        <p className="intro-note">
          explore the collection. keep the ones you love.
        </p>
      </section>

      <section className="filters" aria-label="Filter pokémon">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search by name or number"
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
          <span aria-hidden="true">♥</span> favorites{" "}
          <span className="favorite-count">{favorites.length}</span>
        </button>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {view === "gallery" ? (
        <section className="gallery" aria-label="Pokémon gallery">
          {selected ? (
            <>
              <div className="stage">
                {previous && (
                  <button
                    className="side-specimen side-left"
                    onClick={() => setSelectedId(previous.id)}
                    aria-label={`view ${previous.name}`}
                  >
                    <img src={artwork(previous.id)} alt="" />
                    <span>{previous.name}</span>
                  </button>
                )}
                <button
                  className="arrow arrow-left"
                  onClick={() => move(-1)}
                  disabled={visible.length < 2}
                  aria-label="previous pokémon"
                >
                  ←
                </button>
                <article
                  className={`main-specimen type-${selected.types[0]}`}
                  key={selected.id}
                >
                  <div className="specimen-top">
                    <span>{number(selected.id)}</span>
                    <span>kanto region</span>
                  </div>
                  <div className="image-field">
                    <img src={artwork(selected.id)} alt={selected.name} />
                  </div>
                  <div className="specimen-bottom">
                    <div>
                      <p className="specimen-label">specimen</p>
                      <h2>{selected.name}</h2>
                    </div>
                    <button
                      className={`heart ${favorites.includes(selected.id) ? "saved" : ""}`}
                      onClick={() => toggleFavorite(selected)}
                      disabled={savingId !== null}
                      aria-label={`${favorites.includes(selected.id) ? "remove" : "add"} ${selected.name} ${favorites.includes(selected.id) ? "from" : "to"} favorites`}
                      aria-pressed={favorites.includes(selected.id)}
                    >
                      {favorites.includes(selected.id) ? "♥" : "♡"}
                    </button>
                  </div>
                </article>
                <button
                  className="arrow arrow-right"
                  onClick={() => move(1)}
                  disabled={visible.length < 2}
                  aria-label="next pokémon"
                >
                  →
                </button>
                {next && (
                  <button
                    className="side-specimen side-right"
                    onClick={() => setSelectedId(next.id)}
                    aria-label={`view ${next.name}`}
                  >
                    <img src={artwork(next.id)} alt="" />
                    <span>{next.name}</span>
                  </button>
                )}
              </div>
              <div className="details">
                <div className="type-list">
                  {selected.types.map((name) => (
                    <span key={name} className={`type-pill type-${name}`}>
                      {name}
                    </span>
                  ))}
                </div>
                <span>
                  height <strong>{selected.height} m</strong>
                </span>
                <span>
                  weight <strong>{selected.weight} kg</strong>
                </span>
              </div>
              <nav className="specimen-rail" aria-label="choose pokémon">
                {visible.map((item) => (
                  <button
                    key={item.id}
                    className={`rail-item ${item.id === selected.id ? "selected" : ""}`}
                    aria-current={item.id === selected.id ? "true" : undefined}
                    onClick={() => setSelectedId(item.id)}
                    aria-label={`view ${item.name}`}
                  >
                    <img src={artwork(item.id)} alt="" />
                    <span>{number(item.id)}</span>
                  </button>
                ))}
              </nav>
              <p className="navigation-hint">
                use ← → to browse <span>·</span> {selectedIndex + 1} /{" "}
                {visible.length}
              </p>
            </>
          ) : (
            <EmptyState
              hasPokemon={pokemon.length > 0}
              onReset={() => {
                setQuery("");
                setType("all");
                setFavoritesOnly(false);
              }}
            />
          )}
        </section>
      ) : (
        <section className="overview" aria-label="all pokémon">
          <div className="overview-heading">
            <span>{visible.length} specimens</span>
            <span>select one to inspect</span>
          </div>
          {visible.length ? (
            <div className="overview-grid">
              {visible.map((item) => (
                <button
                  className={`overview-card type-${item.types[0]}`}
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setView("gallery");
                  }}
                >
                  <span className="overview-number">{number(item.id)}</span>
                  <img src={artwork(item.id)} alt="" />
                  <span className="overview-name">{item.name}</span>
                  <span className="overview-types">
                    {item.types.join(" / ")}
                  </span>
                  {favorites.includes(item.id) && (
                    <span className="overview-heart" aria-label="favorite">
                      ♥
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              hasPokemon={pokemon.length > 0}
              onReset={() => {
                setQuery("");
                setType("all");
                setFavoritesOnly(false);
              }}
            />
          )}
        </section>
      )}

      <footer className="footer">
        <span>made for curious trainers</span>
        <span>
          pokémon artwork via{" "}
          <a
            href="https://github.com/PokeAPI/sprites"
            target="_blank"
            rel="noreferrer"
          >
            pokéapi sprites ↗
          </a>
        </span>
      </footer>
    </main>
  );
}

function EmptyState({
  hasPokemon,
  onReset,
}: {
  hasPokemon: boolean;
  onReset: () => void;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">✳</span>
      <h2>{hasPokemon ? "no specimens found" : "loading the collection"}</h2>
      {hasPokemon && (
        <>
          <p>try another name, number, or type.</p>
          <button onClick={onReset}>clear filters ↗</button>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
