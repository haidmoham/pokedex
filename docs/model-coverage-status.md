# Model coverage and pose review — 2026-10-01

Target: all 1,025 national-dex species. Current effective runtime coverage is
527 species on this review branch after rejecting the four exact screenshot failures. Admission of
the remaining existing models is based on the earlier machine/representative
review; it is not per-asset pose certification.

Run `node scripts/model-coverage-status.js --write` for exact, disjoint species
buckets in `content/models/coverage-status.json`:

| Bucket | Species |
| --- | ---: |
| Effective runtime admitted | 527 |
| Embedded source terms unresolved | 434 |
| Source missing | 54 |
| Optimization budget rejected (without later pose evidence) | 0 |
| Screenshot pose rejected | 4 |
| New candidate pose rejected | 5 |
| Earlier source visual rejection (Gholdengo) | 1 |

The source audit covers 971 species. Its 906 machine candidates are not all
source-term-supported, decoded, or visually acceptable. The source repository
also describes 971 regular models:
https://github.com/Pokemon-3D-api/assets . Software MIT licensing does not clear
asset use. Embedded uploader license/attribution/source claims remain explicit;
underlying character rights remain unknown.

The supplied screenshot was materialized locally and viewed. It identifies
Seviper (#336), Cofagrigus (#563), Hitmonlee (#106), and Flabébé (#669).
All four source files have no clips. Their exact SHA-256 identities are rejected
before fetching and never lead a visit. Official artwork remains available.
An alternative source identity can be reviewed without rejecting the species or
all static models. No width/height or outstretched-arm heuristic is used.

Browser review reproduced Seviper's straight rest pose, then verified its
official-art replacement. All four fallback routes were checked. Animated
Mewtwo remained posed at 390px, and Inspect/Escape restored navigation. Static
Clefairy was retained and rendered; lack of animation alone is not a rejection.

The first bounded coverage batch reprocessed Polteageist (#855), previously
rejected for decoded texture memory. One worker resized textures to 512px WebP,
kept exact decoded geometry/topology, and produced 233,992 bytes with successful
texture/geometry checks. The actual browser render still had straight horizontal
rest-pose arms. It remains unadmitted. The source, derivative hashes, uploader
terms, measurements and visual result are in
`content/models/coverage-batch-2026-10-01.json`. No asset was added to runtime.

The existing pipeline is `scripts/model-pipeline/optimize.mjs --ids <up to 24>`:
one worker, 16MiB source cap, 120-second per-model deadline, exact geometry
comparison, selected recognized idle only, bounded decoded geometry and texture
budgets. `admit.mjs` now also requires a hash-bound approved pose review for new
or changed candidates. An animation name does not establish pose quality.
Runtime idle sampling rejects absent clips and invalid/zero durations. Existing
model cancellation, deadlines, one active scene, Inspect, and teardown remain.

Full coverage needs usable source assets for 54 missing species, source evidence
for the 434 unresolved entries, usable pose replacements for nine identified failures plus Gholdengo. Magearna
also exceeds structural complexity. Ten individually reviewed derivatives from the
existing batch account for the increase from production’s 517 to the draft’s 527. Larger batches should be split
by this audit; they must not auto-admit artifacts to make the count look complete.
