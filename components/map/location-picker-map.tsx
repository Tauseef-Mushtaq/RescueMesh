"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onSelectLocation: (lat: number, lng: number) => void;
}

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: [number, number] = [67.0011, 24.8607]; // Karachi default

export function LocationPickerMap({ latitude, longitude, onSelectLocation }: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let mounted = true;
    let mapInstance: any = null;

    import("maplibre-gl").then((maplibregl) => {
      if (!mounted || !containerRef.current) return;

      const initialCenter: [number, number] =
        longitude !== null && latitude !== null
          ? [longitude, latitude]
          : DEFAULT_CENTER;

      mapInstance = new maplibregl.Map({
        container: containerRef.current,
        style: OPENFREEMAP_STYLE_URL,
        center: initialCenter,
        zoom: longitude !== null && latitude !== null ? 12 : 6,
      });

      mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      mapInstance.on("click", (e: any) => {
        const { lng, lat } = e.lngLat;
        onSelectLocation(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
      });

      mapRef.current = mapInstance;
    });

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [onSelectLocation, latitude, longitude]);

  useEffect(() => {
    if (!mapRef.current) return;

    import("maplibre-gl").then((maplibregl) => {
      if (latitude !== null && longitude !== null) {
        if (!markerRef.current) {
          const el = document.createElement("div");
          el.className = "rm-marker rm-marker-pulse";
          el.style.backgroundColor = "#38bdf8";

          markerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .addTo(mapRef.current);
        } else {
          markerRef.current.setLngLat([longitude, latitude]);
        }
      } else if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    });
  }, [latitude, longitude]);

  return (
    <div className="relative w-full h-[260px] rounded-lg border border-border/80 overflow-hidden shadow-inner bg-surface">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 z-10 bg-background/90 backdrop-blur-md px-2.5 py-1 rounded border border-border/60 text-[11px] font-medium text-foreground shadow">
        Click map to set disaster coordinates
      </div>
    </div>
  );
}
