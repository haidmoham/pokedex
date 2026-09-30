# Vercel preview → Cloudflare mirror release

Project `zarnab/pokedex-review`, repository `haidmoham/pokedex`. Both `pokedex.shin86.dev` and `pokedex.mhaider.dev` serve the same Production build without redirects.

1. Isolate intended changes and preserve unrelated work. Run `npm ci`, build, tests, card audit and `git diff --check`. Stage only intended files.
2. Push the candidate branch. Wait for Vercel Ready; record exact Git SHA, deployment ID and preview URL. Verify deployed assets and API, not just the local build.
3. Check 320/390 CSS-pixel layouts, search/filter/keyboard/back flow, stable visits, deliberate discovery, exact reversal, model Inspect/fallback and finite-source retry/exhaustion. Separate browser evidence from physical-device user feedback.
4. Send that exact preview for review. Hold main and domain cutover when review is requested. Runtime changes require a fresh tested preview.
5. After approval, fetch main and verify ancestry, then fast-forward the reviewed revision under landing authorization. Promote the recorded approved Vercel deployment to Production. Account for automatic main deployments; verify the expected JS/CSS/model hashes rather than assuming a different deployment is identical.
6. Add both aliases to this project's Production environment. Read each domain's current DNS recommendation from Vercel; never guess targets or copy another project's target.
7. Inspect each Cloudflare zone for conflicting pokedex records. Write only the required records, normally DNS-only for direct Vercel TLS. Preserve unrelated records. Stop for ownership/authentication conflicts or new persistent security grants.
8. Verify valid Vercel configuration, public DNS, normally validated TLS, expected app/assets/model/API at both URLs, and no cross-domain redirect. Record main SHA, deployment ID, exact DNS records and screenshots.

Retain the previous Production deployment identity for rollback. Promote that known build if needed; alter only records created for this release. Never modify unrelated zone/hosting settings. Model availability, source provenance, visual quality and resource admission remain separate gates.
