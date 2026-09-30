# Navigation and settle verification

Horizontal movement advances national-dex species #001–1025, with finite endpoints. Vertical movement explores model (when admitted), official art, highest-priced available provider card, then art/discovery. Prices retain currency/provider and coverage caveats. Related selections are reversible excursions: the small Back affordance returns to saved artwork and panel position. Horizontal progression starts from the currently visible excursion species. No timer selects a species, artwork or related candidate.

Both axes share `useSnapScroll` and `GalleryMotion`. Native touch/wheel movement and momentum remain browser-owned. Mouse drag tracks raw displacement along its owned axis, including reversals. Release picks the nearest real endpoint and uses native smooth scrolling, keeping CSS snapping disabled until reaching that endpoint. Restoring CSS snapping while starting smooth scrolling previously created competing owners. The old handler also treated fractional/stale `scrollend` as completed and predicted completion on older browsers. Those paths are removed.

Stable-state invariants: selection matches actual aligned position; custom release has one target and animation owner; partial/stale completion never selects; newer input invalidates the prior revision; duplicate completion is idempotent; resize, search, Inspect and unmount cancel pending work; caption/model identity stays stable during transition. `scrollend` observes the next frame and checks revision and unchanged position, protecting against queued older events. A release RAF observer completes only at its real endpoint, including engines without `scrollend`; it never uses a navigation debounce. Reduced-motion release is immediate. Resize reacts only to the scrolling axis size.

`npm test` replays partial positions across 320/390/1470 widths, release to either endpoint, momentum tails, superseded/reversed targets, duplicate endings, lifecycle interruption and displacement/axis ownership. Browser physics require independent supported Chrome observation. Only selected models mount; neighbors use posters. Inspect owns rotation and suspends feed navigation. The candy number badge opens search with a generous hit area and keyboard focus/press states.

## Supported Chrome sweep

Verify exact preview via `release.json` and deployment metadata. Use supported Chrome CUA only; no drivers/CDP or authentication automation. Keep normal animation for motion evidence.

| Check | Required result |
| --- | --- |
| Horizontal species drag: short, below/above midpoint, full, repeated/reversed | Intermediate movement follows input; early release settles; heading, number and URL match endpoint |
| Vertical art drag/coarse scroll and reverse | Model → official → provider card order; exact art/credit after settle; loading cannot replace selection |
| New gesture during settle, search/Inspect interruption, resize | Old completion never overrides newer input or committed identity |
| Species #001/#1025 and source ends | No wrap or invented art; explicit discovery/retry; no timed advance |
| Keyboard left/right, up/down, Page keys, Home/End | Species on X, art on Y; editables and Inspect retain input |
| Number badge at 320/390/desktop | Tactile visible control, no overlap; click/keyboard opens search |
| Search → species movement → reload → browser Back | URL, heading and number agree; saved excursions restore origin art/panel position |
| Related branch, horizontal progression, Back and trail reverse | Visible species is horizontal origin; small Back restores prior art; no forced funnel |
| Models across generations and small/large/static/idle/optimized classes | Coherent textures/framing, Inspect ownership, active-only GLBs, failure fallback |
| 320x740/390x844 Inspect and desktop tall card | Tail/controls fit; Share/continuation clear of artwork |

Physical trackpad inertia, phone touch, diagonal/noisy input, wheel units/pinch, sustained GPU disposal/performance and assistive technology are distinct limitations when unsupported by CUA. Do not claim them from synthetic mouse or coarse scroll.

Prior preview `149d136` passed supported synthetic movement, Inspect framing and Share checks, but failed Back after reload: URL #001 with visible #151. This revision restores the URL species when no live excursion timeline exists. The new axes and expanded models require a fresh preview sweep before release.
