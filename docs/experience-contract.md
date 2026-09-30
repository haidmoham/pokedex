# A pokédex you can doomscroll — experience contract

## Primary experience

- Open on Bulbasaur (#001), immediately. The complete 1,025-species catalog is bundled with the client, so API failure cannot block navigation.
- One full-height species per viewport, in strict national-dex order. Swipe up or scroll down to advance; reverse to return. #001 and #1025 are endpoints, with no featured reorder or species wrap.
- Let the browser handle vertical scrolling and snapping. Render artwork only for the current and adjacent species; do not load thousands of images.
- Swipe left/right through stable views within that species, then deliberately continue into related artwork. Both finite endpoints remain predictable. Keep button and keyboard alternatives. Ambiguous diagonals must not trigger a horizontal change; cancellation and multi-touch must not leave a pending gesture. Browser pinch zoom stays enabled.
- Lead with a large, uncropped image, species name, a short artist/source credit and minimal controls. Pricing, edition metadata, source evidence and coverage belong behind the info button.
- Artist names open the exact credited illustrator's paginated TCGdex portfolio, showing loaded cards immediately. Search is a jump tool; type/saved filters affect search results only, never the feed's national-dex order.
- Preserve each deliberately selected card ID through discovery, price updates and currency changes. A visit selects once on entry: admitted 3D, otherwise official art; the highest fresh comparable loaded card follows official art. Later responses append and never replace the visible view.

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
- TCGdex warns that variant-to-marketplace matching and IDs can be incorrect. Link that source caveat in price details; say highest available provider value rather than verified most valuable edition.
- DeviantArt/Pixiv are clearly disclosed outbound discovery links, not local galleries.

## Illustrator portfolios

- Cache the provider summary index, deduplicate source card IDs and sort deterministically before local pages of twelve. Hydrate at most three card details concurrently; opening requests only the first page, and further pages require Load more.
- Never infer literal illustrator identity, species or credit from the normalized index label or a summary. Require an exact literal card-illustrator match, source-host image, safe card ID and valid dex membership in 1–1025.
- Keep shared-card memberships and one tile per card. Choosing a tile prefers the current species when it belongs; otherwise choose the lowest valid membership and pin the exact edition.
- Each checked candidate is admitted, failed or excluded. Show compact checked/total, failed and excluded coverage with honest exclusion reasons. Trainers/no species, unavailable images, mismatched credits and invalid data must not become fake artwork.
- Retry the original failed page offsets; replace page coverage rather than adding it again. Do not skip failed pages or duplicate loaded tiles. Preserve successful cached data and reviewed provenance.
- Opening shows known artwork immediately, source outages leave it usable, and cache/in-flight deduplication plus bounded timeouts/backoff limit source load.
- Cancel and ignore stale requests on drawer close or artist changes. Preserve loaded pages, stable tile order and portfolio scroll position on reopen.
- Closing without selecting restores the same feed species/card/position. A selected card intentionally navigates the feed; tapping its credit returns to the preserved portfolio position.
- This slice does not infer artist social identities, merge aliases or import DeviantArt/Pixiv galleries.

## Failure and persistence

- Render the bundled catalog independently of `/api/cards` and live discovery. API failure leaves all official-art slides accessible.
- Keep image/title/artist/source fields tied to a single edition record. A broken asset shows an unavailable state without replacing it under the same credit.
- Abort obsolete discovery requests and ignore stale responses after navigation.
- Store favorites in this browser only. The Vercel preview rejects shared favorite writes.
- Image delivery requires a connection to each recorded original host; bundled metadata does not mean offline images.

## Verification boundary

Automated model/server tests cover sequence, endpoints, fallback metadata, ranking, stable selection, membership/provenance and gesture invariants. TypeScript and production bundling must pass after final edits. Deployed browser and physical-device checks remain separate evidence and must be reported honestly.

## Continuous, user-steered discovery

- Prepare one candidate near the gallery edge; do not auto-follow its cursor or select it. The source request checks at most two bounded pages.
- Keep related-work context visible, and preserve exact card IDs and branch origin through forward/back traversal. Vertical navigation remains national-dex order.
- Source failure preserves the same cursor for explicit retry. No failed page becomes a cached empty result or an exhaustion claim. The client aborts a stalled continuation after 15 seconds.
- No unseen card in checked sources is a finite outcome. Buttons and vertical navigation remain usable. No timer or animation may navigate.

## Admitted model view

- Admission and source availability are distinct. Initial transfer cap 750 KB; visual quality, decoded texture/memory and animation budgets require separate evidence.
- Only the active model mounts; no neighboring GLB prefetch. Verify bytes and Git blob identity before allocating a decoder. Cancel obsolete requests and ignore their results. A 12-second load deadline or renderer failure selects official art.
- Lazy viewer, zero retained model cache, scene teardown on removal, no automatic rotation/playback; reduced motion remains still. Missing entries have no dead model slide.
- Ordinary swipe navigates. Inspect deliberately locks feed position and enables model rotation. Accessible rotate buttons supplement dragging; Escape/Done restores Inspect focus and the exact visit/history.
- Preserve source uploader attribution, license claims and gaps. The software license does not clear underlying Pokémon IP.
