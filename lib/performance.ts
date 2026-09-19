export const performancePeriods = [1, 3, 5, 10] as const;
export type PerformancePeriod = (typeof performancePeriods)[number];

export type FundPerformance = {
  ticker: string;
  asOf: string;
  fetchedAt: string;
  currency: string;
  sourceUrl: string;
  basis: string;
  returns: Record<string, number | null>;
};

export function periodLabel(period: PerformancePeriod) {
  return period === 1 ? "1 year" : `${period} years p.a.`;
}
