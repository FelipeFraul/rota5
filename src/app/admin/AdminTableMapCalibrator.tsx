"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import {
  clampOfficialTableMapPoint,
  exportOfficialPlacesCalibrationJson,
  responsivePointToOriginalPoint,
} from "@/lib/tickets/tableMap/calibration";
import {
  OFFICIAL_TABLE_MAP_HEIGHT,
  OFFICIAL_TABLE_MAP_MARKER_VISUAL,
  OFFICIAL_TABLE_MAP_WIDTH,
  type OfficialTableMapPlace,
  type OfficialTableMapPlaceMetadata,
} from "@/lib/tickets/tableMap/officialPlaces";

type DisplayMode = "code" | "unavailable";

const OFFICIAL_TABLE_MAP_IMAGE_SRC = "/mapa_mesas.webp?v=20260727-122245";

type AdminTableMapCalibratorProps = {
  places: readonly OfficialTableMapPlaceMetadata[];
  embedded?: boolean;
};

function clonePlaces(places: readonly OfficialTableMapPlace[]) {
  return places.map((place) => ({ ...place }));
}

function buildEmptyDraftPlaces(places: readonly OfficialTableMapPlaceMetadata[]): OfficialTableMapPlace[] {
  return places.map((place) => ({
    ...place,
    x: 0,
    y: 0,
  }));
}

function getCsrfToken() {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("admin_web_csrf="))
    ?.split("=")[1] ?? "";
}

function getPlaceLabel(place: OfficialTableMapPlace, mode: DisplayMode) {
  return mode === "unavailable" ? "X" : place.code.padStart(2, "0");
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const message = "message" in payload ? String((payload as { message?: unknown }).message ?? "") : "";
  const details = "details" in payload ? String((payload as { details?: unknown }).details ?? "") : "";

  return [message || fallback, details].filter(Boolean).join(" Detalhe: ");
}

function getMarkerColor(place: OfficialTableMapPlace, mode: DisplayMode) {
  if (mode === "unavailable") return OFFICIAL_TABLE_MAP_MARKER_VISUAL.unavailableColor;
  return place.type === "bistr?"
    ? OFFICIAL_TABLE_MAP_MARKER_VISUAL.bistroColor
    : OFFICIAL_TABLE_MAP_MARKER_VISUAL.tableColor;
}

function getMarkerTextShadow(mode: DisplayMode) {
  const shadowColor = mode === "unavailable"
    ? OFFICIAL_TABLE_MAP_MARKER_VISUAL.unavailableTextShadowColor
    : OFFICIAL_TABLE_MAP_MARKER_VISUAL.textShadowColor;

  return [
    `-1px -1px 0 ${shadowColor}`,
    `1px -1px 0 ${shadowColor}`,
    `-1px 1px 0 ${shadowColor}`,
    `1px 1px 0 ${shadowColor}`,
  ].join(", ");
}

const markerBaseStyle = {
  width: `${(OFFICIAL_TABLE_MAP_MARKER_VISUAL.width / OFFICIAL_TABLE_MAP_WIDTH) * 100}%`,
  height: `${(OFFICIAL_TABLE_MAP_MARKER_VISUAL.height / OFFICIAL_TABLE_MAP_HEIGHT) * 100}%`,
  fontSize: `calc(${OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontSize / OFFICIAL_TABLE_MAP_WIDTH} * 100cqw)`,
  fontFamily: `"${OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFamily}", Arial, Helvetica, sans-serif`,
  fontWeight: OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontWeight,
  lineHeight: OFFICIAL_TABLE_MAP_MARKER_VISUAL.lineHeight,
} satisfies CSSProperties;

export function AdminTableMapCalibrator({ places, embedded = false }: AdminTableMapCalibratorProps) {
  const [loadedPlaces, setLoadedPlaces] = useState<OfficialTableMapPlace[]>([]);
  const initialPlaces = useMemo(() => clonePlaces(loadedPlaces), [loadedPlaces]);
  const [draftPlaces, setDraftPlaces] = useState<OfficialTableMapPlace[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("code");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>("Carregando coordenadas salvas...");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const draftPlacesRef = useRef<OfficialTableMapPlace[]>([]);

  const activePlace = draftPlaces.find((place) => place.code === activeCode) ?? draftPlaces[0] ?? null;
  const exportedJson = useMemo(() => exportOfficialPlacesCalibrationJson(draftPlaces), [draftPlaces]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedPlaces() {
      try {
        const response = await fetch("/api/admin/table-map", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.places)) {
          const emptyDraftPlaces = buildEmptyDraftPlaces(places);
          draftPlacesRef.current = clonePlaces(emptyDraftPlaces);
          setLoadedPlaces([]);
          setDraftPlaces(clonePlaces(emptyDraftPlaces));
          setActiveCode(emptyDraftPlaces[0]?.code ?? null);
          setSaveMessage(`${getPayloadMessage(payload, "N?o foi poss?vel carregar as coordenadas salvas do mapa.")} Calibre os pontos e salve para criar os registros.`);
          return;
        }

        const savedPlaces = clonePlaces(payload.places);
        setLoadedPlaces(savedPlaces);
        draftPlacesRef.current = clonePlaces(savedPlaces);
        setDraftPlaces(clonePlaces(savedPlaces));
        setActiveCode(savedPlaces[0]?.code ?? null);
        setSaveMessage(null);
      } catch (error) {
        if (!cancelled) {
          const emptyDraftPlaces = buildEmptyDraftPlaces(places);
          draftPlacesRef.current = clonePlaces(emptyDraftPlaces);
          setLoadedPlaces([]);
          setDraftPlaces(clonePlaces(emptyDraftPlaces));
          setActiveCode(emptyDraftPlaces[0]?.code ?? null);
          setSaveMessage(`Nao foi possivel carregar as coordenadas salvas do mapa. Detalhe: ${error instanceof Error ? error.message : String(error)} Calibre os pontos e salve para criar os registros.`);
        }
      }
    }

    void loadSavedPlaces();

    return () => {
      cancelled = true;
    };
  }, [places]);

  function updatePlacePosition(code: string, event: PointerEvent<HTMLElement>) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const nextPoint = responsivePointToOriginalPoint(
      { x: event.clientX, y: event.clientY },
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    );

    setDraftPlaces((currentPlaces) => {
      const nextPlaces = currentPlaces.map((place) =>
        place.code === code ? { ...place, ...clampOfficialTableMapPoint(nextPoint) } : place,
      );
      draftPlacesRef.current = nextPlaces;

      return nextPlaces;
    });
  }

  function movePlace(code: string, event: PointerEvent<HTMLElement>) {
    event.preventDefault();
    updatePlacePosition(code, event);
  }

  function startDrag(code: string, event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveCode(code);
    movePlace(code, event);
  }

  function placeActiveOnMap(event: PointerEvent<HTMLDivElement>) {
    if (!activeCode || event.target !== event.currentTarget && event.target instanceof HTMLButtonElement) {
      return;
    }

    movePlace(activeCode, event);
  }

  async function copyJson() {
    setCopied(false);
    await navigator.clipboard.writeText(exportedJson);
    setCopied(true);
  }

  function restoreLoadedPositions() {
    const restoredPlaces = initialPlaces.length === places.length
      ? clonePlaces(initialPlaces)
      : buildEmptyDraftPlaces(places);
    draftPlacesRef.current = restoredPlaces;
    setDraftPlaces(clonePlaces(restoredPlaces));
    setActiveCode(restoredPlaces[0]?.code ?? null);
    setCopied(false);
    setSaveMessage(null);
  }

  async function loadFinalPreview() {
    setPreviewing(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/admin/table-map?preview=final", { cache: "no-store" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok || typeof payload.imageUrl !== "string") {
        setSaveMessage(getPayloadMessage(payload, "N?o foi poss?vel visualizar a imagem final."));
        return;
      }

      setPreviewImageUrl(payload.imageUrl);
    } catch (error) {
      setSaveMessage(`Nao foi possivel visualizar a imagem final. Detalhe: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPreviewing(false);
    }
  }

  async function savePermanentChanges() {
    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/admin/table-map", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-admin-csrf": decodeURIComponent(getCsrfToken()),
        },
        body: JSON.stringify({ places: draftPlacesRef.current }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok || !Array.isArray(payload.places)) {
        setSaveMessage(getPayloadMessage(payload, "N?o foi poss?vel salvar o mapa."));
        return;
      }

      const savedPlaces = clonePlaces(payload.places);
      setLoadedPlaces(savedPlaces);
      draftPlacesRef.current = clonePlaces(savedPlaces);
      setDraftPlaces(clonePlaces(savedPlaces));
      const savedActiveCode = activeCode && savedPlaces.some((place) => place.code === activeCode)
        ? activeCode
        : savedPlaces[0]?.code ?? null;
      setActiveCode(savedActiveCode);
      setSaveMessage("Salvo permanentemente.");
      await loadFinalPreview();
    } catch (error) {
      setSaveMessage(`Nao foi possivel salvar o mapa. Detalhe: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
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
              X
            </button>
          </div>
          <button type="button" onClick={restoreLoadedPositions}>Restaurar</button>
          <button type="button" onClick={savePermanentChanges} disabled={saving || draftPlaces.length !== places.length}>
            {saving ? "Salvando..." : "Salvar Alteracoes"}
          </button>
          <button type="button" onClick={loadFinalPreview} disabled={previewing}>
            {previewing ? "Gerando..." : "Visualizar imagem final"}
          </button>
          <button type="button" onClick={copyJson}>{copied ? "Copiado" : "Copiar JSON"}</button>
        </div>
      </header>
      {saveMessage ? (
        <p className="admin-table-map-message">{saveMessage}</p>
      ) : null}

      <div className="admin-table-map-layout">
        <div className="admin-table-map-image-frame">
          <div
            ref={mapRef}
            className="admin-table-map-surface"
            style={{ aspectRatio: `${OFFICIAL_TABLE_MAP_WIDTH} / ${OFFICIAL_TABLE_MAP_HEIGHT}` }}
            onPointerDown={placeActiveOnMap}
          >
            <img src={OFFICIAL_TABLE_MAP_IMAGE_SRC} alt="Mapa oficial de mesas" draggable={false} />
            {draftPlaces.map((place) => (
              <button
                key={place.code}
                type="button"
                className={`admin-table-map-marker is-${place.type} ${displayMode === "unavailable" ? "is-unavailable" : ""} ${activeCode === place.code ? "is-active" : ""}`}
                style={{
                  ...markerBaseStyle,
                  left: `${(place.x / OFFICIAL_TABLE_MAP_WIDTH) * 100}%`,
                  top: `${(place.y / OFFICIAL_TABLE_MAP_HEIGHT) * 100}%`,
                  color: getMarkerColor(place, displayMode),
                  textShadow: getMarkerTextShadow(displayMode),
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

          <div className="admin-table-map-preview">
            <span>Imagem final</span>
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="Imagem final do mapa oficial" />
            ) : (
              <small>Sem preview gerado.</small>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
