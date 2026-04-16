export interface LossCategory {
  category: string;
  key: string;
  count: number;
  description: string;
  percentage: number;
}

export interface OpeningLoss {
  name: string;
  losses: number;
  avgFirstBlunderMove: number | null;
}

export interface LossPatternResult {
  totalLosses: number;
  byCategory: LossCategory[];
  avgFirstBlunderMove: number | null;
  byOpening: OpeningLoss[];
  recentTrend: "improving" | "declining" | "stable";
}
