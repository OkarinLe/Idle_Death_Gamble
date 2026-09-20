"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTradingMode } from "@/lib/tradingMode";
import BackLink from "@/components/BackLink";
import type { LeaderboardRow } from "@/lib/types";

const money = (n: number) => Number(n).toFixed(2);

// A small trophy emoji for the top 3 ranks. Decorative only: the rank number is always
// shown too, so nothing here is conveyed by the emoji (or a color) alone.
const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function LeaderboardPage() {
  const supabase = createClient();
  // Same idea as the home page: light while just browsing, dark while Trading mode is on.
  // The toggle itself lives on the home page; this page only reads the shared state.
  const { trading } = useTradingMode();
  const dark = trading;

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      // get_leaderboard() is a database function: it only shares display names
      // and money numbers, so anyone (even signed out) can call it.
      const { data, error } = await supabase.rpc("get_leaderboard");
      if (error) setError(error.message);
      else setRows((data as LeaderboardRow[]) ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orange reads fine on black, but fails contrast on white, so light mode uses a darker
  // orange for status/accent text (same trick the home page uses).
  const accent = dark ? "#E5751F" : "#861F41";
  const accentText = dark ? "#E5751F" : "#B34700";
  const secondaryText = dark ? "text-gray-300" : "text-gray-600";

  return (
    <div className={(dark ? "min-h-screen bg-gray-950 text-gray-100" : "min-h-screen bg-white text-gray-900") + " transition-colors duration-300"}>
      <header className={"border-b transition-colors duration-300 " + (dark ? "border-gray-800 bg-black" : "border-gray-200 bg-white")}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="space-y-2">
            <BackLink href="/" label="Back to campus info" />
            <h1
              className="text-3xl font-extrabold tracking-tight transition-colors duration-300 sm:text-4xl"
              style={{ color: accent, textShadow: dark ? "0 0 24px rgba(229, 117, 31, 0.35)" : "none" }}
            >
              Leaderboard
            </h1>
          </div>
          <Link
            href="/portfolio"
            className="rounded-full border-2 px-3 py-1 text-sm font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
            style={{ borderColor: accent }}
          >
            Your portfolio
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl space-y-4 p-4">
        <p className={secondaryText}>
          Ranked by net worth: Hokie Bucks in your balance plus your open shares at today&apos;s prices.
        </p>

        {loading && <p>Loading...</p>}
        <p role="alert" className="text-sm font-medium" style={{ color: accentText }}>{error}</p>

        {!loading && !error && rows.length === 0 && <p>No players yet.</p>}

        {rows.length > 0 && (
          <div
            className={
              "animate-fade-up overflow-x-auto rounded-lg border shadow-lg shadow-black/40 " +
              (dark ? "border-gray-700" : "border-gray-300")
            }
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Players ranked by net worth in Hokie Bucks</caption>
              <thead className={"text-xs uppercase tracking-wide " + (dark ? "bg-gray-900 text-gray-300" : "bg-gray-100 text-gray-600")}>
                <tr className="border-b-2" style={{ borderColor: accent }}>
                  <th scope="col" className="p-3">Rank</th>
                  <th scope="col" className="p-3">Player</th>
                  <th scope="col" className="p-3 text-right">Balance</th>
                  <th scope="col" className="p-3 text-right">Open shares</th>
                  <th scope="col" className="p-3 text-right">Net worth</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.rank_number}-${r.display_name}`}
                    className={
                      (r.is_you
                        ? (dark ? "border-t border-gray-700 bg-gray-800" : "border-t border-gray-300 bg-gray-100") + " font-semibold"
                        : "border-t " + (dark ? "border-gray-700" : "border-gray-300")) +
                      " animate-fade-in transition-colors duration-150 " +
                      (dark ? "hover:bg-gray-800/60" : "hover:bg-gray-100/60")
                    }
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                  >
                    <td className="p-3">
                      {/* The rank number is always shown too, so the medal never carries meaning alone. */}
                      {MEDALS[r.rank_number] && <span aria-hidden="true">{MEDALS[r.rank_number]} </span>}
                      {r.rank_number}
                    </td>
                    <td className="p-3">
                      {r.display_name}
                      {/* Text label, so "you" is not shown by color alone. */}
                      {r.is_you && (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: "#E5751F", color: "#1a1a1a" }}
                        >
                          You
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">{money(r.balance)}</td>
                    <td className="p-3 text-right">{money(r.positions_value)}</td>
                    <td className="p-3 text-right font-semibold" style={{ color: accentText }}>
                      {money(r.net_worth)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
