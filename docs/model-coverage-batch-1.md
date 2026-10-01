# Model coverage batch 1

No new model is admitted in this batch. The 14 previous budget failures were processed again with one worker, a 120-second per-model timeout, hash-matched sources, and unchanged admission limits. Exact decoded geometry comparisons passed. Eight still exceed the 750 KB transfer limit even at 256px WebP textures (1.38–5.06 MB); six still exceed structural complexity limits. Texture deduplication and pruning did not resolve those six. No mesh simplification, position quantization, or budget relaxation was used.

The optional `--texture-size 256` profile writes separate artifacts and reports, leaving the default 512px profile intact. These candidate files remain outside runtime admission. Passing machine checks would still require approval of the exact candidate pose hash; an animation name alone cannot establish a usable pose.

All 54 regular-species model URLs advertised by the upstream optimized catalog returned HTTP 404 in a two-worker HEAD check. The fork inspected has the same asset tree. Other inspected repositories provide older FBX/DAE or proprietary Clip Studio formats and do not establish usable source asset permissions.

The seven explicitly restricted-license sources remain excluded. Zubat's current public page confirms a NonCommercial license. The other six public pages returned HTTP 403; their embedded claims are recorded without asserting current independent verification. Another 427 source assets lack per-asset provenance or usable terms. The upstream mapping file is empty. Repository MIT licensing and uploader licenses do not establish underlying Pokémon rights.

Exact per-asset source URLs, original and candidate SHA-256 hashes, byte counts, processing failures, all missing URL responses, and source research findings are in [the batch manifest](../content/models/coverage-batch-budget-2026-10-01.json). This is a separate branch from Shuffle so it can be reviewed independently. Existing pose guards reject the four verified bad assets and preserve artwork fallback. Full 1025-species model coverage has not been reached.
