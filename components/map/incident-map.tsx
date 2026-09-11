"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { IncidentSeverity, IncidentType } from "@/lib/supabase/types";
import { INCIDENT_TYPE_LABELS } from "@/app/dashboard/page";

/**
 * Minimal shape the map needs. A superset (DashboardIncident) is passed
 * in from app/dashboard/page.tsx — this interface only documents what
 * IncidentMap actually reads, per the M10 module prompt.
 */
export interface MappableIncident {
  id: string;
  incidentType: IncidentType | null;
  summary: string | null;
  latitude: number | null;
  longitude: number | null;
  priorityScore: number | null;
  severity: IncidentSeverity | null;
  status: string;
}

interface IncidentMapProps {
  incidents: MappableIncident[];
}

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Pakistan-wide overview — matches the report/dashboard's operating area.
const DEFAULT_CENTER: [number, number] = [69.3451, 30.3753];
const DEFAULT_ZOOM = 5;

// Mirrors app/globals.css severity tokens (--critical/--high/--moderate/--low).
// Kept as literal hex values here since MapLibre paints/markers run outside
// the Tailwind/CSS-variable cascade.
const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MODERATE: "#eab308",
  LOW: "#22c55e",
};
const DEFAULT_MARKER_COLOR = "#8b95a7"; // muted-foreground fallback for null severity

function hasValidCoordinates(
  incident: MappableIncident
): incident is MappableIncident & { latitude: number; longitude: number } {
  const { latitude, longitude } = incident;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPopupHtml(incident: MappableIncident): string {
  const typeLabel = incident.incidentType
    ? INCIDENT_TYPE_LABELS[incident.incidentType]
    : "Uncategorized";
  const severity = incident.severity ?? "UNKNOWN";
  const color = incident.severity ? SEVERITY_COLOR[incident.severity] : DEFAULT_MARKER_COLOR;
  const priorityLine =
    incident.priorityScore !== null
      ? `<div class="rm-popup-priority">Priority ${incident.priorityScore}</div>`
      : "";
  const summaryLine = incident.summary
    ? `<p class="rm-popup-summary">${escapeHtml(incident.summary)}</p>`
    : "";

  return `
    <div class="rm-popup">
      <div class="rm-popup-header">
        <span class="rm-popup-type">${escapeHtml(typeLabel)}</span>
        <span class="rm-popup-severity" style="color:${color}">${escapeHtml(severity)}</span>
      </div>
      ${priorityLine}
      <div class="rm-popup-status">${escapeHtml(incident.status)}</div>
      ${summaryLine}
    </div>
  `;
}

type MapState = "loading" | "ready" | "error";

/**
 * Client-only MapLibre GL map showing persisted incidents that carry
 * valid coordinates. Pure visualization — no data fetching, no second
 * source of truth. The dashboard fetches /api/incidents and passes the
 * already-filtered list in as `incidents`.
 */
export function IncidentMap({ incidents }: IncidentMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // `any`-free without importing maplibre-gl types at module scope for SSR
  // safety; the actual maplibre-gl module is only ever imported inside
  // useEffect (browser-only).
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [mapState, setMapState] = useState<MapState>("loading");

  const mappable = incidents.filter(hasValidCoordinates);

  // Initialize the map once on mount. Cleaned up on unmount.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current) return;
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OPENFREEMAP_STYLE_URL,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          // AttributionControl is on by default in maplibre-gl v4+; the
          // option only accepts `false` or an AttributionControlOptions
          // object, never a bare `true` (that was the TS2322 build
          // failure this replaces). Omitting the key keeps the default
          // (enabled) OpenFreeMap/OSM attribution, which must stay
          // visible per project rules.
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        map.on("error", (event) => {
          // MapLibre emits recoverable tile/style errors too; only fall
          // back to the controlled failure state if we never finished
          // loading in the first place.
          if (process.env.NODE_ENV === "development") {
            console.error("RescueMesh IncidentMap: MapLibre error:", event.error);
          }
        });

        map.on("load", () => {
          if (!cancelled) setMapState("ready");
        });

        mapRef.current = map;
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.error("RescueMesh IncidentMap: failed to initialize:", err);
        }
        if (!cancelled) setMapState("error");
      }
    }

    init();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Intentionally run once — incident markers are synced in the effect
    // below rather than by re-initializing the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers whenever the (already-filtered) incident list changes.
  useEffect(() => {
    if (mapState !== "ready") return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    async function syncMarkers() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !map) return;

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      mappable.forEach((incident) => {
        const color = incident.severity
          ? SEVERITY_COLOR[incident.severity]
          : DEFAULT_MARKER_COLOR;

        const el = document.createElement("div");
        el.className = `rm-marker${incident.severity === "CRITICAL" ? " rm-marker-pulse" : ""}`;
        el.style.backgroundColor = color;

        const popup = new maplibregl.Popup({ offset: 14, closeButton: true }).setHTML(
          buildPopupHtml(incident)
        );

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([incident.longitude, incident.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });

      if (mappable.length === 1) {
        map.easeTo({ center: [mappable[0].longitude, mappable[0].latitude], zoom: 10 });
      } else if (mappable.length > 1) {
        const bounds = mappable.reduce(
          (acc, incident) => acc.extend([incident.longitude, incident.latitude]),
          new maplibregl.LngLatBounds(
            [mappable[0].longitude, mappable[0].latitude],
            [mappable[0].longitude, mappable[0].latitude]
          )
        );
        map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
      }
    }

    syncMarkers();

    return () => {
      cancelled = true;
    };
    // mappable is derived fresh each render from `incidents`; comparing by
    // length+ids keeps this from re-running on unrelated parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapState, JSON.stringify(mappable.map((i) => [i.id, i.severity, i.latitude, i.longitude]))]);

  if (mapState === "error") {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface text-center md:h-[520px]">
        <p className="text-sm font-medium text-foreground">Map unavailable</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          The geographic view could not be loaded. Incident data is still available in the feed
          below.
        </p>
      </div>
    );
  }

  if (incidents.length > 0 && mappable.length === 0) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface text-center md:h-[520px]">
        <p className="text-sm font-medium text-foreground">No mapped incidents</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Incidents without valid location coordinates cannot be displayed on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-lg border border-border bg-surface md:h-[520px]">
      {mapState === "loading" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface text-sm text-muted-foreground"
        >
          Loading map…
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
