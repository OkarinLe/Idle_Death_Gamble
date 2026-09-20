export type Place = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  capacity: number | null;
};

export type Reading = {
  place_id: string;
  metric: string;
  value: number;
  unit: string | null;
  source: string;
  recorded_at: string;
};

export type Market = {
  id: string;
  ticker: string;
  question: string;
  rules: string | null;
  place_id: string | null;
  status: string;
  liquidity_b: number;
  q_yes: number;
  q_no: number;
  volume: number;
  closes_at: string | null;
};
