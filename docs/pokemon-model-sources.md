# Pokémon model source handoff

Verified 2026-09-30. This is asset research, not a rights clearance or a phone-performance benchmark.

## Current product direction

View order: viable 3D → official artwork → highest-priced card → discovery. Only admit a lightweight model for the active Pokémon. An explicit Inspect action enables rotation; ordinary feed swipes navigate. Require opt-in for heavy assets. Keep backend continuity and bounded loading. The older second-view/always-opt-in recommendation is superseded by this direction.

## Best technical source

https://github.com/Pokemon-3D-api/assets

The accompanying availability.json records the complete regular-model repository tree observed at tree SHA 429de1288cea0d43f5b4f56305d2276e94239d65. It contains national-dex IDs, optional variant suffixes, byte sizes, blob SHAs, current raw URLs, and all 54 missing species. There are 974 regular files representing 971 distinct species out of the requested 1,025. The full repository has 1,322 GLBs across forms. Do not assume every numeric filename exists; use the manifest.

Regular transfer-size distribution: median 64,430 bytes; p90 264,500; p95 728,836; maximum 15,049,208. Thirty-nine files exceed 2 MB. Total regular transfer size is 332,666,404 bytes. These compressed sizes do not describe decoded GPU memory or rendering cost.

### Binary-verified examples

- Bulbasaur: https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/1.glb — 541,608 bytes; 1 mesh, 3 images, 9 animations
- Pikachu: https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/25.glb — 146,152 bytes; 5 meshes, 4 images, 1 animation named Impactrueno
- Pecharunt: https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/1025.glb — 83,888 bytes; 2 meshes, 1 image, no animation; rotatable geometry remains available
- Gholdengo: https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/1000.glb — 10,923,232 bytes; 11 meshes, 3 images, 71 animations; heavy opt-in or further optimization required

All four were downloaded and their glTF JSON parsed. Each requires KHR_draco_mesh_compression and EXT_texture_webp. Each response provided Access-Control-Allow-Origin: *. Their visual rendering was not tested in this research.

## Provenance and licensing limitations

Repository LICENSE is MIT for software. README attributes Pokémon assets to Nintendo/Creatures/Game Freak; do not interpret MIT as clearing the underlying characters or game assets. The declared pipeline draws from Sketchfab, but scripts/model_map.json was empty when checked, so it does not currently provide complete source mapping.

Embedded Pecharunt asset.extras: author Squirmy Worm (https://sketchfab.com/squirmyworm064), license CC-BY-4.0, source https://sketchfab.com/3d-models/pecharunt-8107b1f76c7f4ae89dbd24a8433944e2, title Pecharunt.

Embedded Gholdengo asset.extras: author Mariokart07 (https://sketchfab.com/Mariokart07), license CC-BY-4.0, source https://sketchfab.com/3d-models/goldengo-sv-450f19056379446cb57716b726c39929, title Goldengo (SV).

Sampled Bulbasaur and Pikachu GLBs lacked equivalent author/license/source extras. Sketchfab pages were not accessible enough to independently verify uploader rights. Preserve these gaps; uploader claims do not prove underlying IP clearance. Availability is not blanket permission to reuse, redistribute, or commercially deploy.

## Reliability and integration

Raw GitHub works in the tested requests but is not an uptime guarantee. URLs track mutable main. README states history is periodically pruned, so commit pinning alone may not guarantee permanent availability. Preserve hashes, implement request timeout and graceful artwork fallback, and do not silently copy unreviewed assets into a production CDN.

Keep one active viewer, cancel obsolete loads when navigating, cap retained models and textures, pause when hidden, and dispose on removal. Keep feed gestures separate from Inspect controls. Choose an idle clip when present and respect reduced motion. Treat the size manifest as admission input, not a guarantee of visual quality. Do not prefetch the whole collection.

Official viewer documentation: https://modelviewer.dev/examples/loading/ and https://modelviewer.dev/examples/animation/ . model-viewer supports GLB and Draco; decoder code may be fetched separately, so account for decoder/runtime loading and hosting. Verify actual target-device behavior before claiming phone readiness.

## Smogon and alternatives

Started with https://github.com/smogon/sprites and https://play.pokemonshowdown.com/sprites/ani/ . These supply pre-rendered animated sprites, not rotatable meshes. Directory lists Pikachu 25.38 KiB, Gholdengo 74.16 KiB, Tarountula 52.09 KiB; Pecharunt was absent. Direct GIF requests returned 403 from this environment, so browser hotlink compatibility remains unverified. If used, label Animated sprite rather than Interactive 3D. Complete 1,025-species animated coverage was not established.

https://github.com/PoGo-Devs/PoGo-3D-Assets has DAE/FBX meshes but is Gen-1-focused and unevenly prepared; conversion and cleanup would be required.

https://www.models-resource.com/nintendo_switch/pokemonscarletviolet/model/65546/ lists a 4.98 MB Revavroom ZIP. Models Resource is useful for selective preparation, but not a consistent ready-to-use browser collection. No ROMs or bulk game archives were acquired.

## Remaining checks

Per-model rights and attribution, material correctness, animation suitability, actual iOS/Android render/gesture behavior, failure recovery, and controlled deployment hosting remain implementation/release checks. No application code was edited by this research.
