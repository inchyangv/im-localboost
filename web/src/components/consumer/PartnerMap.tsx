"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { rateLevel } from "@/components/ZoneMap";
import { CATEGORY_COLORS, CATEGORY_NAMES, zoneName, zones, type Merchant } from "@/lib/config";
import { pct } from "@/lib/format";

/** Daegu city centre; all demo zones sit within a few km of it. */
const DAEGU: [number, number] = [35.862, 128.596];

/** Small category dot; the selected store gets a pill with its name and the zone bonus rate. */
function markerIcon(m: Merchant, bps: number, active: boolean): L.DivIcon {
  const color = CATEGORY_COLORS[m.categoryId] ?? "#6b7280";
  if (!active) {
    return L.divIcon({
      className: "",
      html: `<div style="width:12px;height:12px;background:${color};border:2px solid #fff;border-radius:9999px;box-shadow:0 1px 3px rgba(0,0,0,.3);transform:translate(-50%,-50%)"></div>`,
      iconSize: [0, 0],
    });
  }
  const lv = rateLevel(bps);
  const rate = bps > 0 ? pct(bps) : "0%";
  const name = m.name.replace(/[&<>"]/g, "");
  return L.divIcon({
    className: "",
    html: `<div style="width:max-content;background:#111827;color:#fff;border:2px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,.3);border-radius:9999px;padding:2px 9px;font:600 12px/18px system-ui,sans-serif;white-space:nowrap;transform:translate(-50%,-50%)">${name} <span style="color:${lv === "none" ? "#9ca3af" : "#5eead4"}">${rate}</span></div>`,
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
  items,
  rates,
  selected,
  onSelect,
  className,
}: {
  /** Merchants to draw (already filtered by the page). */
  items: Merchant[];
  rates: Record<number, number>;
  selected: `0x${string}` | null;
  onSelect: (m: Merchant) => void;
  className?: string;
}) {
  const located = useMemo(() => items.filter((m) => typeof m.lat === "number" && typeof m.lng === "number"), [items]);
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
            icon={markerIcon(m, rates[m.zoneId] ?? 0, selected === m.address)}
            eventHandlers={{ click: () => onSelect(m) }}
            zIndexOffset={selected === m.address ? 1000 : 0}
          >
            <Popup>
              <div style={{ minWidth: 180 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{m.name}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                  {zoneName(m.zoneId)} · {m.tag ?? CATEGORY_NAMES[m.categoryId] ?? m.categoryId}
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
