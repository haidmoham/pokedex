# card gallery experience contract

## experience

- Lead with a Pokédex that lets a visitor choose a species. Opening a species
  moves into a quieter, image-led card museum while preserving that species.
- The entry Pokédex uses species artwork. It does not assign a TCG illustrator
  credit to that artwork.
- Each museum slide pairs one Pokémon card edition with its artist plaque.
  The image, exact card title, set, number, language, and artist come from one
  checked record and change together.
- Artist names are actions. Selecting one opens a looping gallery of checked
  card editions by that illustrator across Pokémon. Do not invent related work.
- Dragapult (#887) is the reference journey. Coverage grows only when evidence
  passes the admission rule below. Fewer than three cards is an honest result.

## navigation and presentation

- Show the artwork large and uncropped. Keep the artist name prominent and the
  source links secondary in the credit area.
- Read the image's pixel dimensions and record its SHA-256. Keep the full card
  composition and link to the original asset. Reject blur, destructive crops,
  stretched scans, and duplicate reprints. The audit checks the PNG signature,
  IHDR dimensions, and full-file hash. A 600px-wide scan stays at or below
  300 CSS px when claiming 2× crispness; a larger inspect view must not claim
  extra detail.
- Loop the finite verified set. The species feed starts with Dragapult and Gengar,
  followed by all remaining catalog species in dex order. On the card surface,
  vertical swipe/wheel and up/down keys change species; horizontal swipe/wheel
  and left/right keys change card editions. Buttons expose both axes.
- Keep page scrolling outside the card surface and preserve pinch zoom. Artist
  galleries use horizontal navigation only; vertical gestures scroll the page.
- Reject ambiguous diagonal gestures, cancel interrupted pointers, and consume
  a wheel momentum stream only once. Remember each gallery's card selection.
- Support thumbnail selection and keep controls available without gestures.
- Keep these inputs on one selected record. A wrapped transition updates the
  image and every credit field from the same record.
- Preserve keyboard focus, visible focus rings, useful mobile targets, and
  reduced-motion settings.
- Use verified card editions as the only carousel content. No duplicate art
  from reprints. Rarity can help find candidates; it does not rank artists or
  prove artistic merit.

## evidence admission

Each displayed card must have a local manifest record containing:

- exact Pokémon dex ID and name;
- exact card title, set, collector number, and language;
- literal illustrator spelling from TCGdex;
- exact TCGdex card API and human-readable card URLs;
- exact card image URL, provider, SHA-256, pixel dimensions, and check date;
- an exact publisher card page with observed matching credit, or an inspected
  printed-card scan whose credit matches TCGdex;
- evidence method, URL, observed credit text, and check date.

The artist spelling and exact card identity must agree across TCGdex and the
publisher page or printed scan. Unknown, conflicting, malformed, or uninspected
credits stay out of the manifest and API. Publisher pages that cannot be read
directly must be labeled with the actual method used to review their indexed
text. A second community API can find candidates but does not satisfy the
publisher-or-scan check.

The audit command re-fetches TCGdex card records, validates manifest identity
and evidence fields, and checks image hashes and PNG IHDR dimensions. Publisher and
printed-scan observations remain explicit review records; the audit does not
pretend to crawl a bot-blocked publisher page or infer its contents.

## failure behavior

- The API reads from the local checked manifest; no live artist lookup can
  change the displayed credit.
- Load the checked manifest once with the initial catalog. Derive species and
  artist galleries from that same snapshot synchronously, so rapid navigation
  cannot attach an older request's card to a newer species. A failed initial
  metadata request shows a loading or error state.
- A failed image shows a same-record unavailable state. It must not replace the
  card image while keeping a mismatched title or credit.
- Discovery and metadata work without API access after the app is built. Card
  image delivery uses the recorded remote host and needs a network connection.

## current evidence boundary

The checked set currently covers all 19 catalog species with 23 editions.
Dragapult has four editions. Several other species have one checked edition;
their shorter carousel count is visible. Butterfree and Jigglypuff use scans
with smaller illustration windows. Two illustrator paths cross Pokémon:
Dragapult to Jerky to Pidgey, and Dragapult to 5ban Graphics to Gengar.

## 2026-09-30 expanded discovery preview

The requested broader preview adds a separate provenance tier alongside the original 23 reviewed editions. The reviewed manifest and its admission checks remain unchanged. Live TCGdex catalog editions carry exact dex IDs and literal provider credits, but are explicitly labeled as metadata not independently reviewed. They must never inherit a printed-scan or publisher-review claim. Official species artwork is a distinct slide with no invented individual artist.

The national dex snapshot covers 1,025 default species. Discovery paginates English TCGdex editions in bounded batches, preserves identity/credit atomically, and retains the selected card ID while new results arrive. The highest fresh comparable market value in the loaded set leads: USD TCGplayer market prices and EUR Cardmarket trend prices are separate choices. No currency conversion, graded auction values, invented missing prices, or globally complete maximum is claimed. Coverage remains partial until every batch finishes; missing sources remain visible and retryable.

Favorites in this preview are device-local. The Vercel API is stateless and rejects shared favorite writes. DeviantArt and Pixiv are currently outbound discovery links, not imported galleries. They remain unfinished source integrations rather than fake local coverage.
