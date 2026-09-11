"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { Navigation, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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
        zoom: longitude !== null && latitude !== null ? 14 : 6,
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
          el.style.backgroundColor = "#EF4444"; // Urgent Red marker

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

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        onSelectLocation(lat, lng);

        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [lng, lat],
            zoom: 15,
            essential: true,
          });
        }
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError("Location access denied. Please click on the map manually.");
        } else {
          setGeoError("Unable to retrieve location. Click map manually.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Navigation size={13} className="text-primary" /> Location Picker
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDetectLocation}
          disabled={locating}
          className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10 gap-1.5 font-bold"
        >
          {locating ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Locating...
            </>
          ) : (
            <>
              <Navigation size={12} /> Use My Current Location
            </>
          )}
        </Button>
      </div>

      {geoError && (
        <p className="text-[11px] text-danger font-medium">{geoError}</p>
      )}

      <div className="relative w-full h-[260px] rounded-lg border border-border/80 overflow-hidden shadow-inner bg-surface">
        <div ref={containerRef} className="w-full h-full" />
        <div className="absolute top-2 left-2 z-10 bg-background/90 backdrop-blur-md px-2.5 py-1 rounded border border-border/60 text-[11px] font-medium text-foreground shadow">
          Click map or use "Current Location" button
        </div>
      </div>
    </div>
  );
}
