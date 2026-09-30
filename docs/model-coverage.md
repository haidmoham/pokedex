# Model coverage and admission

The source snapshot has 974 files for 971 of 1,025 species, with 54 missing species. It totals 332,666,404 transfer bytes. File size classes are 715 at or below 100 KB, 158 above 100 KB through 250 KB, 53 above 250 KB through 750 KB, 9 above 750 KB through 2 MB, and 39 above 2 MB. These are file counts, including variants, rather than admission counts.

## Reproduce the source audit

Run `npm ci`, then `node scripts/audit-models.js --all`. The default command without `--all` checks at most 24 remaining species; `--limit N` selects a smaller batch. Results are saved in ignored `data/model-audit.json`. Completed source identities are reused; failed source requests remain retryable. A manifest tree change starts a fresh report.

The audit chooses one ordinary model per species, with a deterministic variant only when there is no ordinary file. It uses two workers, a 30-second request deadline, a 16 MB source-file cap, a 350 MB aggregate transfer cap and a 12-minute run limit. It verifies exact size and Git blob SHA before parsing. It applies the application's geometry/animation bounds, records required extensions and embedded attribution, and computes SHA256. Source bytes are discarded; this command does not copy assets into public hosting, update `admitted.json`, or infer rights from the repository's software license.

## Admission and optimization batches

1. Keep missing, changed-source and known-broken models on official art. Gholdengo is explicitly rejected for source-level visual defects.
2. Machine candidates must fit the 750 KB transfer cap, 32 MB decoded geometry cap, existing mesh/accessor/animation limits, and browser texture validation of at most 2048 pixels per dimension and 32 MB including mipmaps. A machine candidate is not an admitted model.
3. For oversized or animation-heavy sources, establish permission before retaining or redistributing derivatives. Use isolated batches of at most 24. Preserve original hashes and complete attribution. Preserve geometry first; retain a suitable idle clip, quantize animation at 24 Hz and compress with Meshopt/WebP as in the reviewed Mewtwo experiment. Reject unsuitable clips rather than guessing animation intent. Compare original and derivative framing/materials before considering simplification.
4. Record optimization tool versions, lockfile, commands, input/output hashes, transfer sizes, decoded budgets and visual evidence alongside each proposed asset. Never enlarge runtime budgets merely to admit a failing asset.
5. Review representative browser renders across geometry, texture and animation classes. Report that sampling explicitly; do not claim every asset was visually reviewed. Verify actual iOS/Android performance separately from desktop emulation.
6. Only entries with established source permission and sufficient machine/visual evidence may enter a proposed admission manifest. The release still requires the independent gesture acceptance gate. Retain active-only lazy loading, no neighboring GLB downloads, a 12-second deadline, cancellation/disposal and official-art fallback.

## Rights boundary

An embedded uploader, source URL and CC-BY claim are attribution evidence, not proof that the uploader can license underlying Pokemon IP. Missing embedded fields are concrete provenance gaps. The source repository's MIT software license does not resolve them. Sources with missing or unsuitable asset-layer terms remain excluded. The eligible subset uses its documented uploader terms, retaining attribution and share-alike claims; underlying character rights remain unknown.

Documented CC-BY/CC-BY-SA uploader terms permit attributed derivatives at the asset layer; unknown underlying character rights are recorded separately. They do not prevent a local, attributed optimization experiment. Noncommercial terms, no-derivatives terms and Sketchfab Standard are not automatically treated as unrestricted production permission. Sources without documented asset-use terms remain excluded. Source-term completeness is never treated as visual evidence.

## Verified batch result

The committed `content/models/source-audit.json` checks one source for all 971 available species. Every selected file matched its manifest size and Git blob identity: 332,444,316 verified bytes. There are 906 machine candidates, 64 requiring optimization and one rejected model (Gholdengo), with no remaining source-fetch failures. This is machine evidence, not a visual or rights review.

544 sources contain all three embedded author/license/source fields; 427 lack those fields. License strings include 534 CC-BY, four CC-BY-NC, three CC-BY-SA, one CC-BY-NC-SA, one CC-BY-NC-ND and one Sketchfab Standard claim. These distinctions survive the derivative and admission pipeline. This initial inventory did not itself admit assets; decoder-backed admission is a separate step.

## Implemented derivative experiment

Run `npm ci --prefix scripts/model-pipeline`, then `node scripts/model-pipeline/optimize.mjs`. The separate lockfile pins the toolchain and does not add optimization packages to the application bundle. Source bytes are verified against the audit SHA256, then reused locally on reruns. One worker with a 120-second processing deadline per model keeps CPU/decode allocation bounded. GLBs with external resources or over 128 MB of declared source buffers are rejected before offline decoding. Sharp uses one thread and a 16-megapixel input limit.

The pipeline retains at most one explicitly recognized idle, disposes unused animation channels/samplers, compresses data with Meshopt, and resizes textures to at most 512x512 WebP quality 90. It does not simplify, weld, reorder or quantize geometry. It checks decoded position hashes and primitive modes/counts against a decoder roundtrip and preserves original embedded asset extras. Output texture bytes are actually decoded before applying the existing runtime texture budget. Texture reduction still requires visual comparison.

Of 64 heavy sources, 49 have CC-BY/CC-BY-SA claims and were processed locally: 35 pass the current machine budgets, 14 fail (eight transfer size, six decoded complexity). Fifteen remain excluded: 13 without terms, one Sketchfab Standard and one noncommercial claim. All 49 preserve geometry; no source was auto-admitted. Results and provenance are recorded in `content/models/optimization-report.json`, with local binaries in ignored `data/model-optimization/`.

`node scripts/prepare-model-candidates.js` produces a proposal manifest: 487 original machine candidates with suitable asset-layer terms, plus 35 optimized candidates. `content/models/candidates.json` is not imported into the app. Each proposal separates machine/texture checks from `visualReviewed: false` and `admitted: false`. The runtime independently rejects known-broken Gholdengo even if a future manifest accidentally enables it.

## Decoder-backed rollout

Run `node scripts/model-pipeline/admit.mjs` after preparing candidates. Two workers verify SHA256 and exact size, decode geometry with glTF Transform/Draco/Meshopt, reject nonfinite attributes and missing meshes/scenes, and actually decode images with Sharp before applying runtime budgets. Downloads have a 30-second deadline, 750 KB file cap, 100 MB aggregate cap and 12-minute batch limit. No paid API is used. The compact runtime manifest carries source credit/license/identity; the full admission report retains separate term and decoder evidence.

All 522 candidates were processed: 521 admitted species, comprising 486 original source-hosted GLBs, 34 new optimized derivatives and the previously admitted Mewtwo. #855 Polteageist failed the decoded texture budget. Source-hosted files remain hash-checked before allocation; no neighboring GLBs load. Model/texture errors or the 12-second load deadline restore official art. Static assets without a recognized idle never start an inferred attack animation. Generated `models/attribution.json` retains credits, terms, sources and modification details for derivatives.

This leaves 504 species without an admitted model, including unavailable, provenance-incomplete, unsuitable-license, over-budget and known-broken sources. Admission uses automated evidence plus representative browser review; it does not assert universal visual review, phone performance or underlying character rights clearance. Browser review of the rollout is pending at this code checkpoint.

API references: [glTF Transform Draco decoding](https://gltf-transform.dev/modules/extensions/classes/KHRDracoMeshCompression), [texture compression](https://gltf-transform.dev/modules/functions/functions/textureCompress), and [Meshopt](https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression).

## Bounded follow-up: 2026-09-30

This pass checked the sole decoder-admission failure, #855 Polteageist, rather than enabling another source. Its original seven 1024×1024 textures total 39,146,842 decoded bytes including mipmaps (37.3 MiB), exceeding the unchanged 32 MiB cap. A geometry-preserving derivative reduces those seven textures to 512×512 and 9,786,714 bytes (9.3 MiB). Transfer is 233,992 bytes; decoded geometry remains 152,160 bytes, all finite, with two meshes and one scene. Geometry, topology, attributes and morph targets match the decoder roundtrip. No idle animation was invented.

The original SHA256 is `f26a12291ebf406208b62b4ec39eea67f51c7e7e798c8d737b1884c4f6b0bdcf`; the derivative is `854a53337a9b307122b4cf513b136d2416d501576b6fe8a89609623cbe592e6b`. Embedded BlenderLager attribution, source and CC-BY-4.0 claim are retained. Underlying character rights remain unknown.

Reproduce only this repair with `npm ci --prefix scripts/model-pipeline`, then `node scripts/model-pipeline/optimize.mjs --ids 855`. Explicit ID batches accept at most 24 audited, non-rejected species and write a separate ignored `data/model-optimization/report-855.json`; they do not overwrite the full optimization report. The existing locked worker performs decoding, geometry identity, texture and runtime-budget checks. See the committed [pass evidence](../content/models/coverage-pass-2026-09-30.json).

**Additional admitted species: 0. Runtime coverage stays 521/1,025.** The repaired candidate remains local and unadmitted because this cloud browser has WebGL disabled. Original-versus-derivative material/framing review and physical iOS/Android performance remain outstanding. #855 therefore keeps its official-art fallback. No production GLB, admission manifest, source policy or runtime budget changed.
