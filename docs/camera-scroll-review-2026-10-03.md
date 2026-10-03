# Camera and scrolling review — 2026-10-03

Base: `10ecd19` (current main, fetched before editing). Branch: `codex/camera-scroll-20261003`. No main or production change.

## Findings and fixes

- Legacy model-viewer used 110–240% per-model camera distances; the HOME canvas fitted a diagonal bounding sphere with additional 1.25 × 1.1 clearance. This made presentation depend heavily on model proportions and renderer.
- Both paths now fit bounding-box corners against horizontal and vertical perspective planes, including depth, with a shared 12% frame margin. Source geometry, transforms and proportions are untouched. The default view is -12° azimuth / 85° polar angle. Both renderers use a shared sampled visible animation envelope (33 regular samples, source keyframes capped at 256, and HOME visibility boundaries). Legacy fits using its actual adapted FOV. This is a sampled envelope, not an analytic guarantee for every animation frame.
- Inspection uses an enclosing sphere and the tighter viewport angle to retain clearance while rotating. Exiting restores the default view; resize recomputes distance without accumulating drift. Existing source/admission/attribution records are unchanged. Per-model camera percentages are no longer consulted by the normal legacy feed.
- Escape on the portaled model controls previously bypassed the stage handler, leaving inspection/feed locks active. Both renderers now handle Escape on those controls and restore Inspect focus.
- At 740×390, a search excursion's Back button plus caption/control reservation could leave the art area with no usable height. Short landscape now gives artwork a separate column and scrolls the credit/control column independently. No artist credit is removed or truncated.

## Browser evidence

Local preview: `http://127.0.0.1:4174/`. Current released model and form inventories are enabled only for local QA. An uncommitted task-level Vite configuration proxies the existing public `/models/home-preview-*` binaries; the application's byte/hash validation still runs before decoding. Native assets retain their pinned source URLs. Representative local derivative files were also checked against the current public hashes. API runs on local port 3001.

Verified in Codex in-app browser:

- 1280×720: Bulbasaur; vertical model→official art; horizontal #1→#2→#1 preserves the deliberately selected official edition and URL. Details scrolling and close restore edition and focus.
- 390×844: Onix front/inspection, native HOME Charizard front/side inspection, Mewtwo front and side tail clearance. Inspect blocks vertical artwork and horizontal species scrolling. Escape from Done/rotate controls exits and restores Inspect focus.
- 320×740: Wailord and Celesteela, long source credits and wrapping controls; vertical reversal returns to model. Search opened during model reloading, jumped to Celesteela, and retained the Wailord return route.
- 740×390: Celesteela search excursion; art remains visible after the landscape fix, controls are reachable through independent caption scrolling, Escape releases inspection.
- #1025 Pecharunt: Next species is disabled; endpoint URL remains #1025.
- Repeated model teardown/reload and navigation did not leave stale locks in these checks. A proposed legacy `updateFraming()` call produced a blank Mewtwo render during QA; it was removed, and front/side rendering was rechecked successfully.

Screenshots are in the task's `../evidence/`: Bulbasaur desktop, Onix phone, Charizard HOME phone, Wailord narrow, Celesteela narrow/landscape, and Mewtwo front/inspection. Screenshots show selected animation frames, not complete loop coverage.

## Checks and limits

- PASS: 30 focused framing/HOME runtime/gallery/feed tests. Projection tests cover compact/tall/wide/long bounds at phone, desktop and short landscape aspect ratios, uniform viewport occupancy, source-unit scaling and inspection angles. Runtime test covers Inspect reset and resize without drift.
- PASS: TypeScript, default `npm run build`, and separate release-inventory Vite build; existing large-chunk warning remains.
- PASS: read-only card audit (23 editions / 19 species), `git diff --check`.
- Broader suite: 176 passed / 3 blocked (179 total). Three model-pipeline test files cannot load because existing `@gltf-transform/core` / `sharp` dependencies are unavailable. These are environment failures, not camera assertion failures. No dependencies were installed.
- Local verification reused existing dependencies copied into this isolated checkout. Three 0.183.2 matches the lock. Vite 7.3.6 and model-viewer 4.3.1 match the lock; available meshoptimizer 1.1.1 differs from locked 1.0.1. A clean locked CI run remains required before landing.
- NOT RUN: physical touch/trackpad inertia, real-device GPU/performance, full 1,025-species visual sweep, all alternate forms, precise diagonal/pinch traces, interruption by OS pointer cancellation, sustained loading stress, deployed preview QA.

No release gate, access setting, account data, production alias or source inventory was changed. Two untracked user files in the September 30 checkout remain untouched. The local preview is the review deliverable; main/production remain held for approval.


## Top-clipping follow-up

The supplied Library image `libfile_1d845374f9d881918a2dd914453efb12` was materialized locally and inspected: it shows Butterfree #012 with clipped wings at the top of the model viewport. Weedle was also reported by the user.

Two root causes were addressed:

- Legacy model-viewer's public dimensions/center describe the initial/rest pose, excluding idle wing, horn, skin, morph and root-motion excursions. Both renderers now sample precise deformed visible vertices in world coordinates, including exact source keyframes as well as regular samples. The camera uses one stable envelope center and retains the existing shared perspective fit / inspection sphere; it does not chase individual poses or modify source proportions. Legacy reuses the validated GLB in a CPU geometry pass, skips image/texture decoding, disposes geometry/materials afterward and creates no extra GPU context. This adds CPU geometry decoding before presentation, within the existing 12-second loading deadline. Sampling yields for navigation and cancellation.
- The art viewport began above the bottom of the header's Shuffle control. A ResizeObserver now reserves the measured header/navigation bottom plus 12 pixels, and keeps the search-return/landscape layout reservations consistent. At 390×844, navigation bottom was 118px and model top was 130px. The initial fitted camera is applied before revealing the legacy model, avoiding an unfitted first frame.

The existing dependency's Draco decoder is now copied into baseline builds too, because both renderers need it for geometry framing. No dependency was installed or upgraded.

Follow-up browser checks passed:

- Butterfree: 1280×720, 390×844, 320×740 and 740×390. Full wings/antennae visible in observed live/still frames; inspection rotation and sampled poses retain clearance. Desktop and narrow screenshots are saved alongside the original user image.
- Weedle: 1280×720, 390×844 and 320×740. Horn and tail visible, including two sampled poses and side rotation.
- Native HOME Charizard: 390×844, rotated wings/horns/tail visible. Legacy Mewtwo: 390×844, rotated ears and tail visible without a blank render.
- Butterfree landscape: coarse vertical scrolling moves model→official→model; model reload succeeds; Inspect blocks artwork scrolling; Escape from its portaled control restores focus and enables species navigation. Switching Weedle→Butterfree after Inspect restores normal framing. A Charizard artwork round trip followed immediately by Mewtwo navigation exercised cancellation during a replacement load.

Evidence: `../evidence/butterfree-desktop-topclip-fixed.jpg`, `butterfree-390-topclip-fixed.jpg`, `butterfree-inspect-320.jpg`, `butterfree-inspect-rotated.jpg`, `butterfree-landscape-topclip-fixed.jpg`, `weedle-desktop-topclip-fixed.jpg`, `weedle-390-topclip-fixed.jpg`, `weedle-inspect-320.jpg`, `charizard-home-motion-envelope-390.jpg`, `mewtwo-motion-envelope-390.jpg`. Images capture selected poses; full analytic animation extrema, dense cubic interpolation extrema and physical-device performance remain unverified.

Follow-up checks: 32 focused tests pass, including skeletal horn/keyframe excursions, transformed roots, morph extrema and cancellation; TypeScript and release-inventory Vite build pass (existing chunk warning); diff check passes. Full suite: 178 passed / 3 missing-dependency failures (181 total), same model-pipeline files as before. The first sandboxed run also hit restricted loopback listeners; rerunning with local listener permission resolved those unrelated test failures.

Follow-up deployment is held. The user said “no deploy yet”; pushing this branch triggers the existing Vercel preview automation. The follow-up is committed locally and PR #12's notes identify that it is not yet in the remote PR diff. No main/production or new preview deployment was requested for this follow-up.
