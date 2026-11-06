export interface MetricsPeriod {
  from: string;
  to: string;
}
export interface Usage {
  bookedHours: number;
  reservations: number;
  cancellations: number;
  cancellationRate: number;
}
export interface Occupancy extends Usage {
  capacityHours: number;
  occupancyPercent: number;
}
export interface Metrics {
  period: MetricsPeriod;
  generatedAt: string;
  timezone: 'UTC';
  capacityBasis: 'registered-rooms-24h';
  rankingLimit: number;
  summary: Occupancy & { rooms: number; clients: number };
  rooms: (Occupancy & {
    id: string;
    name: string;
    buildingName: string | null;
  })[];
  buildings: (Occupancy & { id: string | null; name: string })[];
  clients: (Usage & {
    id: string;
    name: string;
    lastReservation: string | null;
  })[];
  days: {
    date: string;
    bookedHours: number;
    capacityHours: number;
    occupancyPercent: number;
  }[];
  hours: { hour: number; bookedHours: number }[];
}
export interface MetricsStore {
  revision(): Promise<string>;
  calculate(
    period: MetricsPeriod,
  ): Promise<{ revision: string; metrics: Metrics }>;
}
export interface MetricsCache {
  get(key: string): Promise<Metrics | null>;
  set(key: string, value: Metrics): Promise<void>;
}
export interface MetricsService {
  get(period: MetricsPeriod): Promise<Metrics>;
}
