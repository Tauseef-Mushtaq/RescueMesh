# PROJECT_RULES.md — RescueMesh AI

Non-negotiable constraints for every module.

1. npm only — never pnpm, yarn, or bun.
2. TypeScript everywhere.
3. Next.js (App Router) as the sole application framework.
4. Supabase (Postgres + pgvector + Auth) as the sole database/auth layer.
5. Gemini free tier as the sole runtime AI and embeddings provider.
6. MapLibre GL JS + OpenFreeMap (vector tiles, no key/account/billing) as the sole mapping stack. (Updated M10 — the original Leaflet + raw OpenStreetMap-tile-server choice was superseded by the M10 module spec, which explicitly prohibits Leaflet and direct OSM raster tile servers in favor of MapLibre GL JS against OpenFreeMap's free, keyless vector style. Functionally equivalent for rule 8's $0 requirement; see HANDOFF_M10.md.)
7. Vercel as the sole deployment target.
8. Core MVP must run at $0 — free-tier/open-source services only, no paid APIs.
9. No unnecessary dependencies — check what's already installed first.
10. No secrets in source control or handoff ZIPs — ever.
11. Preserve existing working functionality across modules.
12. Module scope must be respected — implement only what's assigned.
13. Every module must leave the project in a testable/runnable state (lint, type-check, build where available).
14. Every module must update `CURRENT_STATE.md`.
15. Every module must produce a `HANDOFF_MXX.md`.

## Priority Philosophy

```
Working core > advanced intelligence > visual polish
```

If time is constrained, stop at the latest completed checkpoint rather than partially implementing the next one. See the Priority Rule in `AGENTS.md`.

## Scope Levels (reference)

| Priority | Meaning | Modules |
|---|---|---|
| P0 | Must have — core working submission | M00–M10 |
| P1 | High value — AI/RAG differentiation | M11–M17 |
| P2 | Impressive — semantic incident intelligence | M18–M20 |
| P3 | Presentation — demo, motion, polish | M21–M33 |

P0 checkpoint definition: Report → AI → Priority → Save → Dashboard → Map → Incident Detail must all work end-to-end.
