"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationalDashboardData } from "@/lib/tickets/services/operationalDashboardTypes";

type OperationalDashboardState = {
  data: OperationalDashboardData | null;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdatedAt: Date | null;
};

type OperationalDashboardResponse = {
  ok: boolean;
  message?: string;
  dashboard?: OperationalDashboardData;
};

export function useOperationalDashboard(eventId: string | null, comparisonDays: number) {
  const [state, setState] = useState<OperationalDashboardState>({
    data: null,
    error: null,
    isLoading: true,
    isRefreshing: false,
    lastUpdatedAt: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(
    async (force = false) => {
      if (inFlightRef.current && !force) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;

      setState((current) => ({
        ...current,
        error: null,
        isLoading: !current.data,
        isRefreshing: Boolean(current.data),
      }));

      const params = new URLSearchParams({ comparisonDays: String(comparisonDays) });
      if (eventId) params.set("eventId", eventId);

      try {
        const response = await fetch(`/api/admin/operational-dashboard?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as OperationalDashboardResponse;

        if (!response.ok || !payload.ok || !payload.dashboard) {
          throw new Error(payload.message ?? "N?o foi poss?vel carregar o painel operacional.");
        }

        setState({
          data: payload.dashboard,
          error: null,
          isLoading: false,
          isRefreshing: false,
          lastUpdatedAt: new Date(),
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "N?o foi poss?vel carregar o painel operacional.",
          isLoading: false,
          isRefreshing: false,
        }));
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          inFlightRef.current = false;
        }
      }
    },
    [comparisonDays, eventId],
  );

  useEffect(() => {
    void load(true);
    return () => {
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(false);
      }
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [load]);

  return {
    ...state,
    refresh: () => load(true),
  };
}
