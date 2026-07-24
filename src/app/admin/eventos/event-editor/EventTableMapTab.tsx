"use client";

import { AdminTableMapCalibrator } from "@/app/admin/AdminTableMapCalibrator";
import { OFFICIAL_TABLE_MAP_PLACES } from "@/lib/tickets/tableMap/officialPlaces";

export default function EventTableMapTab() {
  return <AdminTableMapCalibrator places={OFFICIAL_TABLE_MAP_PLACES} embedded />;
}
