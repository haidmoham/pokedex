# Camera and scrolling review — 2026-10-03

Base: `10ecd19` (current main, fetched before editing). Branch: `codex/camera-scroll-20261003`. No main or production change.

## Findings and fixes

- Legacy model-viewer used 110–240% per-model camera distances; the HOME canvas fitted a diagonal bounding sphere with additional 1.25 × 1.1 clearance. This made presentation depend heavily on model proportions and renderer.
- Both paths now fit bounding-box corners against horizontal and vertical perspective planes, including depth, with a shared 12% frame margin. Source geometry, transforms and proportions are untouched. The default view is -12° azimuth / 85° polar angle. Legacy uses public model-viewer dimensions/center and its actual adapted FOV; HOME uses its existing sampled visible animation envelope (33 regular samples plus visibility boundaries). This is a sampled envelope, not an analytic guarantee for every animation frame.
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
