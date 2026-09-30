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

An embedded uploader, source URL and CC-BY claim are attribution evidence, not proof that the uploader can license underlying Pokemon IP. Missing embedded fields are concrete provenance gaps. The source repository's MIT software license does not resolve them. The audit leaves every new entry `admitted: false` and `redistributionApproved: false`; Mewtwo's prior reviewed admission is unchanged. Broad redistribution and production expansion remain blocked until the relevant permissions are established.

## Verified batch result

The committed `content/models/source-audit.json` checks one source for all 971 available species. Every selected file matched its manifest size and Git blob identity: 332,444,316 verified bytes. There are 906 machine candidates, 64 requiring optimization and one rejected model (Gholdengo), with no remaining source-fetch failures. This is machine evidence, not a visual or rights review.

544 sources contain all three embedded author/license/source fields; 427 lack those fields. License strings include 534 CC-BY, four CC-BY-NC, three CC-BY-SA, one CC-BY-NC-SA, one CC-BY-NC-ND and one Sketchfab Standard claim. These distinctions must survive any derivative pipeline. No new model was admitted or redistributed during this batch. The existing Mewtwo is still the only active 3D entry.
