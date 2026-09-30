# Artwork feed experience contract

## Primary experience

- Open on Bulbasaur (#001), immediately. The complete 1,025-species catalog is bundled with the client, so API failure cannot block navigation.
- One full-height species per viewport, in strict national-dex order. Swipe up or scroll down to advance; reverse to return. #001 and #1025 are endpoints, with no featured reorder or species wrap.
- Let the browser handle vertical scrolling and snapping. Render artwork only for the current and adjacent species; do not load thousands of images.
- Swipe left/right to loop through editions within that species. Keep button and keyboard alternatives. Ambiguous diagonals must not trigger a horizontal change; cancellation and multi-touch must not leave a pending gesture. Browser pinch zoom stays enabled.
- Lead with a large, uncropped image, species name, a short artist/source credit and minimal controls. Pricing, edition metadata, source evidence and coverage belong behind the info button.
- Artist names open the illustrator's already-loaded card gallery. Search is a jump tool; type/saved filters affect search results only, never the feed's national-dex order.
- Preserve each deliberately selected card ID through discovery, price updates and currency changes. Until a selection, the highest fresh comparable loaded price may improve the lead.

## Navigation and accessibility

- Up/down arrows and Page Up/Down change species; left/right arrows change editions. Home and End reach the first and last species. Both axes have visible buttons.
- Native modal drawers use `showModal`, trap focus outside the feed, dismiss with Escape/Close/backdrop, and scroll independently. Drawer scrolling must not navigate species or editions.
- Allow horizontal thumbnail scrolling in the drawer. Preserve pinch zoom and cancel interrupted pointer gestures without taking over vertical touch scrolling.
- Keep visible focus rings, accessible names, useful mobile targets, safe-area padding, 320px layouts and reduced motion. Offscreen species are hidden from assistive technology; one concise live announcement describes the active artwork.
- Do not claim extra resolution: display original assets uncropped with `object-fit: contain`; larger presentation cannot create image detail.

## Evidence and identity

The independently reviewed manifest contains:

- Exact dex membership, card title, set, collector number and language
- Literal illustrator spelling from TCGdex
- Exact TCGdex record, card image source, SHA-256, dimensions and check date
- A matching publisher-page or inspected printed-scan artist credit, with the actual evidence method, URL, observed text and check date

The artist and edition identity must agree. Unknown, conflicting or malformed reviewed records stay out of the reviewed API. Indexed publisher observations must remain labeled as indexed observations; the audit must not pretend to fetch bot-blocked evidence.

The live discovery tier is separate. It admits exact TCGdex species membership and literal provider credits but remains labeled as metadata not independently reviewed. It never inherits publisher/printed-scan claims. Shared TAG TEAM cards retain all species memberships and a single artist-gallery identity. Updating prices must not overwrite existing reviewed provenance.

Official species artwork is a separate slide sourced to PokéAPI sprites. It explicitly states that the individual artist is unspecified and never borrows a TCG illustrator's credit.

## Prices and discovery

- Twelve upstream source candidates per page; at most three detail requests concurrently. Discovery is read-only, incremental and scoped to the active species.
- Rank only fresh positive finite prices in the selected currency. Exclude values older than seven days. USD TCGplayer market prices and EUR Cardmarket trend prices are separate comparisons.
- Keep selected identities stable as new results arrive. No auction/graded-card maximum, invented value, conversion or global completeness is claimed.
- Show checked/total counts, partial coverage and missing sources in details. Provide a retry for unavailable sources.
- The 23 reviewed editions cover 19 species. The national dex covers 1,025 default species. These are distinct coverage claims.
- DeviantArt/Pixiv are clearly disclosed outbound discovery links, not local galleries.

## Failure and persistence

- Render the bundled catalog independently of `/api/cards` and live discovery. API failure leaves all official-art slides accessible.
- Keep image/title/artist/source fields tied to a single edition record. A broken asset shows an unavailable state without replacing it under the same credit.
- Abort obsolete discovery requests and ignore stale responses after navigation.
- Store favorites in this browser only. The Vercel preview rejects shared favorite writes.
- Image delivery requires a connection to each recorded original host; bundled metadata does not mean offline images.

## Verification boundary

Automated model/server tests cover sequence, endpoints, fallback metadata, ranking, stable selection, membership/provenance and gesture invariants. TypeScript and production bundling must pass after final edits. Deployed browser and physical-device checks remain separate evidence and must be reported honestly.
