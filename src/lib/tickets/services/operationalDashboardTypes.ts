export type OperationalDashboardEventOption = {
  id: string;
  title: string;
  artistName: string | null;
  startsAt: string | null;
  status: string;
};

export type OperationalDashboardPoint = {
  date: string;
  [key: string]: string | number | null;
};

export type OperationalDashboardAlert = {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  quantity: number;
  eventId: string | null;
  ticketId?: string | null;
  orderId?: string | null;
  comboOrderId?: string | null;
  detectedAt: string;
  href: string | null;
};

export type OperationalDashboardData = {
  events: OperationalDashboardEventOption[];
  event: OperationalDashboardEventOption | null;
  range: {
    days: number;
    startsAt: string;
    endsAt: string;
    comparisonStartsAt: string;
    comparisonEndsAt: string;
  };
  revenue: {
    summary: Record<string, number | null>;
    series: OperationalDashboardPoint[];
    latestSales: Array<Record<string, string | number | null>>;
    paymentMethods: Array<Record<string, string | number | null>>;
  };
  tickets: {
    summary: Record<string, number | null>;
    series: OperationalDashboardPoint[];
    latestIssued: Array<Record<string, string | number | null>>;
    latestCheckins: Array<Record<string, string | number | null>>;
    problems: Record<string, number | null>;
  };
  combos: {
    summary: Record<string, number | null>;
    series: OperationalDashboardPoint[];
    topOffers: Array<Record<string, string | number | null>>;
    latest: Array<Record<string, string | number | null>>;
    problems: Record<string, number | null>;
  };
  whatsapp: {
    summary: Record<string, number | null>;
    series: OperationalDashboardPoint[];
    latestActivity: Array<Record<string, string | number | null>>;
    problems: Record<string, number | null>;
  };
  alerts: {
    summary: {
      total: number;
      critical: number;
      warning: number;
      info: number;
    };
    items: OperationalDashboardAlert[];
  };
  generatedAt: string;
  responseTimeMs?: number;
};
