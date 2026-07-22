"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";

import {
  clampOfficialTableMapPoint,
  exportOfficialPlacesCalibrationJson,
  responsivePointToOriginalPoint,
} from "@/lib/tickets/tableMap/calibration";
import {
  OFFICIAL_TABLE_MAP_HEIGHT,
  OFFICIAL_TABLE_MAP_WIDTH,
  type OfficialTableMapPlace,
} from "@/lib/tickets/tableMap/officialPlaces";

type DisplayMode = "code" | "unavailable";

type AdminTableMapCalibratorProps = {
  places: readonly OfficialTableMapPlace[];
  embedded?: boolean;
};

function clonePlaces(places: readonly OfficialTableMapPlace[]) {
  return places.map((place) => ({ ...place }));
}

function getPlaceLabel(place: OfficialTableMapPlace, mode: DisplayMode) {
  return mode === "unavailable" ? "XX" : place.code.padStart(2, "0");
}

export function AdminTableMapCalibrator({ places, embedded = false }: AdminTableMapCalibratorProps) {
  const initialPlaces = useMemo(() => clonePlaces(places), [places]);
  const [draftPlaces, setDraftPlaces] = useState(() => clonePlaces(places));
  const [activeCode, setActiveCode] = useState<string | null>(places[0]?.code ?? null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("code");
  const [copied, setCopied] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const activePlace = draftPlaces.find((place) => place.code === activeCode) ?? draftPlaces[0] ?? null;
  const exportedJson = useMemo(() => exportOfficialPlacesCalibrationJson(draftPlaces), [draftPlaces]);

  function movePlace(code: string, event: PointerEvent<HTMLElement>) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const nextPoint = responsivePointToOriginalPoint(
      { x: event.clientX, y: event.clientY },
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    );

    setDraftPlaces((currentPlaces) =>
      currentPlaces.map((place) =>
        place.code === code ? { ...place, ...clampOfficialTableMapPoint(nextPoint) } : place,
      ),
    );
  }

  function startDrag(code: string, event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveCode(code);
    movePlace(code, event);
  }

  async function copyJson() {
    setCopied(false);
    await navigator.clipboard.writeText(exportedJson);
    setCopied(true);
  }

  function restoreLoadedPositions() {
    setDraftPlaces(clonePlaces(initialPlaces));
    setActiveCode(initialPlaces[0]?.code ?? null);
    setCopied(false);
  }

  return (
    <section className={`admin-table-map-calibrator ${embedded ? "is-embedded" : ""}`}>
      <header className="admin-table-map-header">
        <div>
          <p className="admin-events-kicker">Mapa oficial</p>
          <h1>Calibracao de mesas</h1>
        </div>
        <div className="admin-table-map-actions">
          <div className="admin-table-map-toggle" role="tablist" aria-label="Visualizacao dos marcadores">
            <button
              type="button"
              className={displayMode === "code" ? "is-active" : ""}
              onClick={() => setDisplayMode("code")}
            >
              Numeros
            </button>
            <button
              type="button"
              className={displayMode === "unavailable" ? "is-active" : ""}
              onClick={() => setDisplayMode("unavailable")}
            >
              XX
            </button>
          </div>
          <button type="button" onClick={restoreLoadedPositions}>Restaurar</button>
          <button type="button" onClick={copyJson}>{copied ? "Copiado" : "Copiar JSON"}</button>
        </div>
      </header>

      <div className="admin-table-map-layout">
        <div
          ref={mapRef}
          className="admin-table-map-image-frame"
          style={{ aspectRatio: `${OFFICIAL_TABLE_MAP_WIDTH} / ${OFFICIAL_TABLE_MAP_HEIGHT}` }}
        >
          <img src="/mapa_mesas.webp" alt="Mapa oficial de mesas" draggable={false} />
          {draftPlaces.map((place) => (
            <button
              key={place.code}
              type="button"
              className={`admin-table-map-marker ${displayMode === "unavailable" ? "is-unavailable" : ""} ${activeCode === place.code ? "is-active" : ""}`}
              style={{
                left: `${(place.x / OFFICIAL_TABLE_MAP_WIDTH) * 100}%`,
                top: `${(place.y / OFFICIAL_TABLE_MAP_HEIGHT) * 100}%`,
              }}
              onPointerDown={(event) => startDrag(place.code, event)}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  movePlace(place.code, event);
                }
              }}
              onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
              onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
              aria-label={`Lugar ${place.code}: x ${place.x}, y ${place.y}`}
            >
              {getPlaceLabel(place, displayMode)}
            </button>
          ))}
        </div>

        <aside className="admin-table-map-panel">
          <div className="admin-table-map-current">
            <span>Lugar ativo</span>
            <strong>{activePlace?.code ?? "--"}</strong>
            <small>x {activePlace?.x ?? 0} - y {activePlace?.y ?? 0}</small>
          </div>

          <div className="admin-table-map-list" aria-label="Coordenadas atuais">
            {draftPlaces.map((place) => (
              <button
                key={place.code}
                type="button"
                className={activeCode === place.code ? "is-active" : ""}
                onClick={() => setActiveCode(place.code)}
              >
                <span>{place.code}</span>
                <small>x {place.x} - y {place.y}</small>
              </button>
            ))}
          </div>

          <label className="admin-table-map-export">
            JSON exportado
            <textarea readOnly value={exportedJson} />
          </label>
        </aside>
      </div>
    </section>
  );
}
