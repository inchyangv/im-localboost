"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { rateLevel } from "@/components/ZoneMap";
import { CATEGORY_NAMES, merchants, zoneName, zones, type Merchant } from "@/lib/config";
import { pct } from "@/lib/format";

/** Daegu city centre; all demo zones sit within a few km of it. */
const DAEGU: [number, number] = [35.862, 128.596];

function markerIcon(bps: number): L.DivIcon {
  const lv = rateLevel(bps);
  const bg = lv === "high" ? "#14b8a6" : lv === "mid" ? "#5eead4" : lv === "low" ? "#ccfbf1" : "#e5e7eb";
  const fg = lv === "high" ? "#ffffff" : "#134e4a";
  const label = bps > 0 ? pct(bps) : "0%";
  return L.divIcon({
    className: "",
    html: `<div style="background:${bg};color:${fg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25);border-radius:9999px;padding:2px 8px;font:600 11px/16px system-ui,sans-serif;white-space:nowrap;transform:translate(-50%,-50%)">${label}</div>`,
    iconSize: [0, 0],
  });
}

function FitToMerchants({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points).pad(0.25), { animate: false });
  }, [map, points]);
  return null;
}

export function PartnerMap({
  rates,
  selected,
  onSelect,
  className,
}: {
  rates: Record<number, number>;
  selected: `0x${string}` | null;
  onSelect: (m: Merchant) => void;
  className?: string;
}) {
  const located = useMemo(() => merchants.filter((m) => typeof m.lat === "number" && typeof m.lng === "number"), []);
  const points = useMemo(() => located.map((m) => [m.lat!, m.lng!] as [number, number]), [located]);

  return (
    <div className={className}>
      <MapContainer center={DAEGU} zoom={13} scrollWheelZoom className="h-full w-full rounded-2xl" attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToMerchants points={points} />
        {zones
          .filter((z) => typeof z.lat === "number" && typeof z.lng === "number")
          .map((z) => {
            const lv = rateLevel(rates[z.id] ?? 0);
            const color = lv === "none" ? "#9ca3af" : "#0d9488";
            return (
              <CircleMarker key={z.id} center={[z.lat!, z.lng!]} radius={34} pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: lv === "none" ? 0.06 : 0.14 }}>
                <Tooltip direction="top" offset={[0, -30]} permanent={false}>
                  {z.name} · 현재 {pct(rates[z.id] ?? 0)}
                </Tooltip>
              </CircleMarker>
            );
          })}
        {located.map((m) => (
          <Marker
            key={m.address}
            position={[m.lat!, m.lng!]}
            icon={markerIcon(rates[m.zoneId] ?? 0)}
            eventHandlers={{ click: () => onSelect(m) }}
            zIndexOffset={selected === m.address ? 1000 : 0}
          >
            <Popup>
              <div style={{ minWidth: 180 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{m.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                  {zoneName(m.zoneId)} · {CATEGORY_NAMES[m.categoryId] ?? m.categoryId}
                </p>
                {m.roadAddress && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{m.roadAddress}</p>}
                <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                  지금 보너스율 <b>{pct(rates[m.zoneId] ?? 0)}</b>
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
