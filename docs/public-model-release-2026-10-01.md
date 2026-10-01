# Reviewed public model release, October 1, 2026

The owner authorized the reviewed 998-species, 547-native-idle build on main and the existing public mirrors, pokedex.mhaider.dev and pokedex.shin86.dev. This supersedes the protected-preview-only deployment restriction for this exact inventory. Redistribution rights remain unresolved; publication is not rights clearance.

The manifest from source commit 9651ef6a01097eef84205e368b0b388831041a0c is SHA256-pinned by scripts/public-model-release.js. Both hosting build commands explicitly select this release. Any changed manifest fails public preparation, so subsequent idle research cannot be silently included. The 511 extracted entries yield 998 unique species, 547 native idles and 451 static models after 40 reviewed replacements of normal static assets.

Historical protected-preview manifests and reviews remain unchanged. Public runtime attribution marks these entries as publicly released, retains all credits, source links, hashes, modifications and unresolved-rights notices. Unflagged builds continue to omit them. No asset binaries are committed. GPU playback and physical-device performance remain unverified.

Release verification checks tests, TypeScript/build, every prepared asset SHA256 and both live release.json endpoints and representative binary hashes. The published release endpoint records the hosting commit SHA and exact inventory identity.
