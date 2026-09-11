# HANDOFF_M10.md

## Module

M10 — Basic Disaster Map

## Status

Completed (implementation + code-level verification). Live build/lint/npm-install could NOT be run in this environment — see Testing.

## Stack deviation from PROJECT_RULES.md (flagged, not silently resolved)

`PROJECT_RULES.md` rule 6 (pre-M10) named **Leaflet + OpenStreetMap** as the sole mapping stack. The M10 module spec explicitly requires **MapLibre GL JS + OpenFreeMap** and explicitly prohibits Leaflet and direct OSM raster tile servers. These two documents directly contradicted each other.

Resolution taken: followed the M10 spec (more recent, more specific, and still satisfies rule 8's $0/no-key/no-account/no-credit-card requirement) and updated `PROJECT_RULES.md` rule 6 to match, with a note explaining the change. Flagging this here in case the project owner intended to keep Leaflet and the M10 spec was itself the error — easy to revert if so.

## What was implemented

- A client-only `IncidentMap` component rendering a MapLibre GL map against the OpenFreeMap `liberty` vector style (no API key/account/billing).
- Pakistan-wide default view (center `[69.3451, 30.3753]`, zoom 5).
- One marker per incident with valid `latitude`/`longitude` (both finite numbers in range), colored by persisted `severity` (CRITICAL=red/HIGH=orange/MODERATE=yellow/LOW=green, matching the existing `--critical/--high/--moderate/--low` CSS tokens). CRITICAL markers get a lightweight CSS pulse.
- Click-to-open popup per marker: incident type (human-readable label), severity, priority score, status, summary — no internal/DB-only fields, no secrets.
- Auto-fit map bounds when 2+ incidents are mapped (padding, capped max zoom); single incident eases to a reasonable zoom; no bounds-reset loops (markers/bounds effect keyed off a stable serialization of `[id, severity, lat, lng]`, not incident array identity).
- Map reflects the dashboard's existing client-side filters exactly — `IncidentMap` receives `filteredIncidents`, the same list rendered in the feed below it, so map and feed always agree.
- No-mapped-incidents state ("No mapped incidents…") shown when incidents exist but none have valid coordinates.
- Map-failure state ("Map unavailable…") shown if MapLibre fails to initialize; dashboard (metrics, filters, feed) is unaffected either way.
- Loading state matches the feed's existing loading copy/style while incidents are being fetched.
- SSR-safe: `maplibre-gl` (and its CSS) is only touched inside `useEffect`/dynamic `import()`, never at module top level in a way that touches `window`/`document` during render.
- Cleanup on unmount: markers removed, `map.remove()` called.
- Attribution: MapLibre's default `attributionControl` is left enabled (not removed/overridden), which surfaces OpenFreeMap/OSM/OpenMapTiles attribution per the style JSON.

## Map stack

```
MapLibre GL JS
OpenFreeMap
```

No API key. No account. No registration. No credit card.

## Files created

- `components/map/incident-map.tsx`
- `HANDOFF_M10.md`

## Files modified

- `app/dashboard/page.tsx` — imports and renders `IncidentMap` with `filteredIncidents` in a new "Incident Map" section between the filters card and the incident feed; exported `INCIDENT_TYPE_LABELS` (previously module-private) so the map's popups reuse the exact same incident-type label mapping instead of a second copy.
- `app/globals.css` — added marker (`.rm-marker`, pulse keyframes) and popup (`.maplibregl-popup-*`, `.rm-popup-*`) styles using the existing design tokens (`--surface-elevated`, `--border`, `--foreground`, `--muted-foreground`, `--radius-md`).
- `package.json` — added `maplibre-gl` dependency.
- `PROJECT_RULES.md` — rule 6 updated per the stack-deviation note above.
- `CURRENT_STATE.md` — this module's summary appended.

`package-lock.json` was **not** regenerated (see Testing — no network access in this environment to run `npm install`).

## Dependencies

```
maplibre-gl: ^4.7.1
```

Version pinned to a known-stable MapLibre GL JS release at spec-writing time; could not be resolved against the live npm registry in this environment (see Testing). Whoever runs `npm install` next should confirm this resolves and adjust the caret range if a newer/patched version is preferred.

## API changes

No API changes. `GET /api/incidents` (M08) is reused as-is; the map consumes the same `DashboardIncident[]` the feed already fetches. No second incidents API, no direct browser-to-Supabase access.

## UI changes

- New "Incident Map" section on `/dashboard`, positioned between the Filters card and the Incident Feed heading, sized `h-[420px] md:h-[520px]` (never collapses to 0 height).
- Map, markers, and popups follow the existing dark design system tokens.
- Filters (severity/type/status) apply to the map exactly as they apply to the feed, since both read from the same `filteredIncidents` value.
- No-location and map-failure states use the exact/near-exact copy specified in the module prompt.
- Responsive: single-column flex layout, no fixed pixel widths beyond the map's own height; MapLibre's canvas resizes with its container. Popups are capped at `max-width: 220px` to avoid overflow on small screens.

## Testing

**Could not run live in this environment — no network access (`npm install maplibre-gl` failed with `403 Forbidden` against `registry.npmjs.org`, and no `node_modules/` exists for this checkout at all, even for pre-existing dependencies).**

```bash
npm install     # NOT RUN — no network access in this environment
npm run lint    # NOT RUN — depends on npm install
npm run build   # NOT RUN — depends on npm install
```

What *was* verified by code review instead, consistent with prior modules' "manual verification" approach (M07/M08/M09 also had no live credentials/network):

- Import paths resolve under the project's `@/*` → `./*` `tsconfig.json` path mapping.
- `IncidentMap`'s props (`MappableIncident[]`) are a strict subset of the existing `DashboardIncident` interface already used by `app/dashboard/page.tsx`, so no type mismatch at the call site.
- `maplibre-gl` and its CSS are only referenced inside client-side effects / dynamic `import()`, never accessed during SSR/server render.
- No import of any server-only module (`lib/supabase/server.ts`, `lib/ai/*`) into `components/map/incident-map.tsx`; no reference to `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` anywhere in the new/changed files.
- Popup HTML is built from an explicit `escapeHtml()` helper before interpolation — no unescaped incident-supplied text (`summary`) is inserted into `innerHTML`.
- Manually traced all 8 module-prompt test cases against the code:
  1. Valid coordinates → passes `hasValidCoordinates()` → marker created.
  2. `null` lat/lng → filtered out by `hasValidCoordinates()` → no marker.
  3. Multiple valid incidents → all appear; bounds fit to all of them.
  4. Different severities → different marker colors via `SEVERITY_COLOR`.
  5. Dashboard severity filter changes `filteredIncidents` → same array passed to `IncidentMap` → marker-sync effect re-runs (key includes severity/id/lat/lng) → map updates.
  6. Marker click → MapLibre's built-in popup binding (`.setPopup().addTo()`) opens `buildPopupHtml()` output.
  7. Incidents present, none with coordinates → "No mapped incidents" branch renders.
  8. Simulated init failure (import/constructor throwing) → caught, `mapState` set to `"error"` → "Map unavailable" branch renders; rest of the dashboard (metrics/filters/feed) is unaffected since they live outside `IncidentMap`.

**Not verified live:** actual rendering in a browser, actual tile fetch from `tiles.openfreemap.org`, actual TypeScript compiler pass, actual ESLint pass, actual production build. These should be run in an environment with network access before merging.

Also unverified (pre-existing constraint carried over from M07–M09): live Supabase data, since no real Supabase credentials are configured in this environment.

## Known limitations

- No geocoding, reverse geocoding, routing, or directions (explicitly out of scope for M10).
- No marker clustering — fine at the target 50–200 incident scale, would need revisiting well beyond that.
- No real-time updates — map only reflects whatever `/api/incidents` returned at last fetch/refresh (same as the feed).
- Incidents must already have valid persisted coordinates; nothing in M10 fixes or infers missing/invalid ones.
- `npm install`/`lint`/`build` not run live in this environment (see Testing) — should be the first thing verified before this module is considered merge-ready.
- `maplibre-gl` version pinned by hand without registry access; confirm/adjust on first real install.

## Next module

Per `PROJECT_RULES.md`'s scope table, M10 is the last P0 module (`Report → AI → Priority → Save → Dashboard → Map → Incident Detail` end-to-end checkpoint). **M11** begins the P1 tier — per `ARCHITECTURE.md`'s planned API contract and data model (`knowledge_sources`/`knowledge_chunks`, `/api/rag`), M11 is most likely **RAG knowledge base ingestion** (the first building block the `/api/rag` and `/api/similar` endpoints will depend on). Confirm against the project owner's actual module roadmap before starting, since it isn't fully enumerated in the provided docs beyond the P0–P3 scope table.
