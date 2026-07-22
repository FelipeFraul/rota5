import { OFFICIAL_TABLE_MAP_HEIGHT, OFFICIAL_TABLE_MAP_WIDTH, type OfficialTableMapPlace } from "@/lib/tickets/tableMap/officialPlaces";

export type CalibrationPoint = {
  x: number;
  y: number;
};

export type CalibrationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function clampOfficialTableMapPoint(point: CalibrationPoint): CalibrationPoint {
  return {
    x: Math.min(Math.max(Math.round(point.x), 0), OFFICIAL_TABLE_MAP_WIDTH),
    y: Math.min(Math.max(Math.round(point.y), 0), OFFICIAL_TABLE_MAP_HEIGHT),
  };
}

export function responsivePointToOriginalPoint(point: CalibrationPoint, rect: CalibrationRect): CalibrationPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }

  return clampOfficialTableMapPoint({
    x: ((point.x - rect.left) / rect.width) * OFFICIAL_TABLE_MAP_WIDTH,
    y: ((point.y - rect.top) / rect.height) * OFFICIAL_TABLE_MAP_HEIGHT,
  });
}

export function originalPointToResponsivePoint(point: CalibrationPoint, rect: CalibrationRect): CalibrationPoint {
  return {
    x: rect.left + (point.x / OFFICIAL_TABLE_MAP_WIDTH) * rect.width,
    y: rect.top + (point.y / OFFICIAL_TABLE_MAP_HEIGHT) * rect.height,
  };
}

export function exportOfficialPlacesCalibrationJson(places: readonly OfficialTableMapPlace[]) {
  return JSON.stringify(
    places.map((place) => ({
      ...place,
      x: Math.round(place.x),
      y: Math.round(place.y),
    })),
    null,
    2,
  );
}
