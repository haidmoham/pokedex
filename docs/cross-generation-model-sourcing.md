# Cross-generation model sourcing — 2026-10-01

## Best next input

The strongest new bulk lead is [ChicoEevee's current Switch model importer](https://github.com/ChicoEevee/Pokemon-Switch-Model-Importer-Blender), which links a public [Scarlet/Violet base + DLC archive](https://drive.google.com/file/d/1N8NbyD1kh1LI6rSTbtG2wVdjQ47oJIAM/view). The actual Drive page and download warning were inspected: **4.3 GB**, too large to preview or virus-scan. Download was stopped at that warning pending approval. No archive contents or complete species count are claimed from its name. The primary README promises raw models with PNGs; animation inclusion still needs an archive listing.

Its earlier [Legends Arceus importer](https://github.com/SomeKitten/LegendsArceusBlenderScript) links a separate [prepared Pokémon/PNG dump](https://drive.google.com/file/d/1dITgyrvozPXmH0WOnFfFvMB1DRC5Idqs/view). This is a promising source of Hisuian forms and alternate rigs, with archive coverage still unverified. The newer repository also links ZA assets, but marks that route not working; it is not a priority for this 1–1025 target.

## What is already measurable

The public [PoGo-3D-Assets repository](https://github.com/PoGo-Devs/PoGo-3D-Assets) has **151 species folders with model files in every folder**, measured from the complete recursive tree `2ce68809da92ca19318bb72100a78b961ca4482f`. Its whole repository has 440 FBX files, 170 C4D files, 30 OBJ files and two DAE files, including source/Unity duplicates. This is 151 technical mesh sources, not 151 reviewed rigs or idles. The README lists rigging/texture gaps and mostly says animation is absent; Bulbasaur has an attack FBX, which is not an idle. Its stated origins are Models Resource and Roe Studios. No license file appears in the tree. The per-species file/byte/blob-SHA inventory is committed separately.

The `pokemon-party/3d-pokemon` fork has exactly the existing source tree SHA `429de1288cea0d43f5b4f56305d2276e94239d65`: 1,322 GLBs across forms and the same 971 regular species. It is not an independent gap-filling collection.

The [Starfield-2026 animation document](https://github.com/ChrisColeTech/Starfield-2026/blob/master/docs/15-SKELETAL-ANIMATION-FRAMEWORK.md) describes 25 Pokémon with separated model/clip DAE manifests. Its current complete 1,615-file tree contains no DAE files or those model manifests. Keep it as a split-clip design reference, not an available asset source.

## Piece generations together

The current draft has 527 admitted species. All **54 missing source files are late-generation**: 17 from Gen 8 and 37 from Gen 9. By contrast, Gen 6 has 67 source-term gaps out of 72 species despite existing geometry. Different problems need different batches.

1. Inventory SV base+DLC first and compare exact species/forms against the 37 missing Gen-9 entries. Do not assume the game contains every older species.
2. Use Sword/Shield for the 17 missing Gen-8 entries and PLA for Hisuian/late-Gen8 forms where present. The [Sword/Shield primary mapping](https://gbatemp.net/threads/wip-sword-and-shield-pokemon-models-and-textures.552281/) identifies GFPAK/GFBMDL files and DAE export with textures.
3. Use paired Sun/Moon or USUM meshes and motion for older gaps. The [primary Sun/Moon index](https://gbatemp.net/threads/pokemon-sun-moon-pokemon-animations-textures-and-models.473906/) separates model, normal/shiny/greyscale textures, battle, refresh, idle/walk/run and lip-animation files. This is an index, not a downloaded pack.
4. [Random Talking Bush's collection](https://archive.vg-resource.com/thread-25872.html) is the primary cross-generation extraction hub. Its indexed first post was updated December 20, 2023 and advertises original rigs. Direct page access returned 403; archive membership/current download URLs remain unverified. A converted USUM DAE mirror mentioned by users has an expired free-hosting/paywall issue, so no payment or bypass was attempted.
5. For alternate personality and pose references, [StarsMmd's GameCube importer](https://github.com/StarsMmd/Blender-Addon-Gamecube-Models) supports Colosseum/XD PKX/DAT/FSYS plus skeletons, materials and animations. It is a converter, not a dump. Its current target is Blender 4.5.7 LTS and particle effects are unsupported.
6. [pret/pokestadium](https://github.com/pret/pokestadium) is useful animation/rig research but requires an existing user-supplied base ROM. The [Gen2 3D mod](https://github.com/randyadr/Gen2-3D-Sprites) explicitly excludes extracted Stadium2 models and marks animation semantics provisional. Emerald/Platinum decompiles supply useful identities and 2D content, not demonstrated rotatable battle-model coverage. No ROM was acquired.

## Conversion contract

Maintain one record per `(nationalDexId, form, sourceGame, sourceRevision, assetPath)` with independent mesh, texture, rig, clip, provenance and redistribution fields. Game model IDs must not be assumed to equal National Dex IDs: existing Fuecoco #909 uses `pm1013` and later generations diverge. Preserve a sourced mapping rather than join on numeric filename alone.

A file listing comes before extraction or rendering. Verify archive checksum and declared expanded sizes, reject traversal/symlinks/executables from the model import set, and select at most three species for the first conversion. Match rig and clips from the same game/form first; confirm bone names, hierarchy, bind matrices and scale semantics before trying cross-generation retargeting.

[Shararamosh's animation importer](https://github.com/Shararamosh/io_scene_gfbanm) supports translation/rotation/scale but requires correct bone scale inheritance and omits material flags/events. ChicoEevee integrates it for Blender 4.x/5.x. These tools were inspected as source/documentation only; none was installed or executed. Import success is not proof that eyes, mouths, particles or material animation survived.

Retain one verified idle and three sampled poses first, then pass the current 750 KB transfer, geometry, texture and complexity gates. Compare texture/material identity and actual deformed poses, including the loop boundary. Only after that should a hash-bound candidate enter review. Public extraction availability, uploader attribution and software licensing stay separate from permission to redistribute game assets; unresolved rights are recorded, not silently waived.

## Small concrete alternative

A [SamsungInternet demo source](https://github.com/SamsungInternet/ar-demos/blob/master/src/obj/pikachu/pikachu.gltf) provides an openly retrievable Pikachu with Kataphoric, original Sketchfab URL and CC-BY claim embedded. Its six source files were hash-recorded and a local self-contained 181,632-byte Meshopt/WebP candidate was prepared. It has one rig and zero animations. Offline rendering is recognizable but has outstretched arms; no new runtime admission or idle claim was made. This is a different source, not retroactive provenance for the catalog's original Pikachu.

Exact generation-gap counts, source states and uncertainty are in `content/models/cross-generation-source-matrix-2026-10-01.json`. This research leaves current runtime coverage at 527. It establishes the next technical acquisition/conversion path rather than claiming the remaining 498 are universally unavailable.
