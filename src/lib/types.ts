export type Place = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  capacity: number | null;
  meta: PlaceMeta | null;
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
  created_at: string;
  resolves_at: string | null;
  metric: string | null;
  comparator: string | null;
  threshold: number | null;
  outcome: "yes" | "no" | null;
};


// One row per user per market (RLS: you only ever see your own).
export type Position = {
  user_id: string;
  market_id: string;
  yes_shares: number;
  no_shares: number;
};

// One row per buy (positive) or sell (negative shares and cost).
export type Trade = {
  market_id: string;
  side: "yes" | "no";
  shares: number;
  cost: number;
};

// A row from the get_leaderboard() database function.
export type LeaderboardRow = {
  rank_number: number;
  display_name: string;
  balance: number;
  positions_value: number;
  net_worth: number;
  is_you: boolean;
};


// Written by scripts/football-agent.mjs onto the "hokies-football" place. Live and upcoming games only.
export type GameInfo = { opponent: string; home: boolean; kickoff: string; time_tbd: boolean };
export type PlaceMeta = { live?: GameInfo | null; upcoming?: GameInfo[]; updated_at?: string };
