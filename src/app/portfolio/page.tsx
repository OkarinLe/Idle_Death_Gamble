"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTradingMode } from "@/lib/tradingMode";
import { yesPrice, sellProceeds } from "@/lib/lmsr";
import BackLink from "@/components/BackLink";
import type { Market, Position, Trade } from "@/lib/types";

type Side = "yes" | "no";
type SellPick = { marketId: string; side: Side };

const money = (n: number) => Number(n).toFixed(2);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Yes = blue + up arrow, No = orange + down arrow (never color alone).
function SideBadge({ side }: { side: Side }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-sm font-semibold text-white"
      style={{ backgroundColor: side === "yes" ? "#0B6E99" : "#B34700" }}
    >
      {side === "yes" ? "▲ Yes" : "▼ No"}
    </span>
  );
}

export default function PortfolioPage() {
  const supabase = createClient();
  // Same idea as the home page: light while just browsing, dark while Trading mode is on.
  // The toggle itself lives on the home page; this page only reads the shared state.
  const { trading } = useTradingMode();
  const dark = trading;

  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [balance, setBalance] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [picked, setPicked] = useState<SellPick | null>(null);
  const [shares, setShares] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSignedIn(false);
      setLoading(false);
      return;
    }
    setSignedIn(true);

    // Row Level Security means these three queries only return YOUR rows.
    const [prof, pos, tr] = await Promise.all([
      supabase.from("profiles").select("balance").eq("id", user.id).single(),
      supabase.from("positions").select("*"),
      supabase.from("trades").select("market_id, side, shares, cost"),
    ]);
    setBalance(Number(prof.data?.balance ?? 0));
    const mine = ((pos.data as Position[]) ?? []).filter(
      (p) => Number(p.yes_shares) > 0 || Number(p.no_shares) > 0
    );
    setPositions(mine);
    setTrades((tr.data as Trade[]) ?? []);

    if (mine.length > 0) {
      const { data: m } = await supabase
        .from("markets")
        .select("*")
        .in("id", mine.map((p) => p.market_id));
      setMarkets((m as Market[]) ?? []);
    } else {
      setMarkets([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Loading data when the page opens is the whole point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function owned(p: Position, side: Side) {
    return Number(side === "yes" ? p.yes_shares : p.no_shares);
  }

  // Current price of one share on this side (a Yes share and a No share add up to 1).
  function sharePrice(m: Market, side: Side) {
    const y = yesPrice(m.q_yes, m.q_no, m.liquidity_b);
    return side === "yes" ? y : 1 - y;
  }

  // Money you have put in on this side (buys minus sells).
  function netSpent(marketId: string, side: Side) {
    return trades
      .filter((t) => t.market_id === marketId && t.side === side)
      .reduce((sum, t) => sum + Number(t.cost), 0);
  }

  function pickSell(marketId: string, side: Side, max: number) {
    setPicked({ marketId, side });
    setShares(Math.min(1, max));
    setNote("");
  }

  async function confirmSell() {
    if (!picked) return;
    setBusy(true);
    setNote("");
    const { data, error } = await supabase.rpc("sell_shares", {
      p_market_id: picked.marketId,
      p_side: picked.side,
      p_shares: shares,
    });
    setBusy(false);
    if (error) {
      setNote(error.message);
      return;
    }
    const result = data as { proceeds: number };
    setNote(`Sold ${plural(shares, "share")} of ${picked.side.toUpperCase()} for ${money(result.proceeds)} Hokie Bucks.`);
    setPicked(null);
    await loadData();
  }

  const marketById = (id: string) => markets.find((m) => m.id === id);
  const openRows = positions
    .map((p) => ({ p, m: marketById(p.market_id) }))
    .filter((r): r is { p: Position; m: Market } => !!r.m && r.m.status === "open");
  const settledRows = positions
    .map((p) => ({ p, m: marketById(p.market_id) }))
    .filter((r): r is { p: Position; m: Market } => !!r.m && r.m.status !== "open");

  // What open positions are worth at today's prices.
  const positionsValue = openRows.reduce(
    (sum, { p, m }) =>
      sum + owned(p, "yes") * sharePrice(m, "yes") + owned(p, "no") * sharePrice(m, "no"),
    0
  );

  // Orange reads fine on black, but fails contrast on white, so light mode uses a darker
  // orange for status/accent text (same trick the home page uses).
  const accent = dark ? "#E5751F" : "#861F41";
  const accentText = dark ? "#E5751F" : "#B34700";
  const cardClass = dark
    ? "border-gray-700 bg-gray-900 hover:border-gray-500"
    : "border-gray-300 bg-white shadow-sm hover:border-gray-400";
  const statCardClass = dark ? "border-gray-700 bg-gray-900" : "border-gray-300 bg-white shadow-sm";
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
              Your portfolio
            </h1>
          </div>
          <Link
            href="/leaderboard"
            className="rounded-full border-2 px-3 py-1 text-sm font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
            style={{ borderColor: accent }}
          >
            Leaderboard
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl space-y-4 p-4">
        <p
          key={note}
          role="status"
          aria-live="polite"
          className={"min-h-6 text-sm font-medium" + (note ? " animate-fade-in" : "")}
          style={{ color: accentText }}
        >
          {note}
        </p>

        {loading && <p>Loading...</p>}

        {!loading && !signedIn && (
          <p className="rounded border border-orange-500 p-3">
            <Link href="/login" className="font-semibold underline">Sign in with your VT email</Link>{" "}
            to see your portfolio.
          </p>
        )}

        {!loading && signedIn && (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["Balance", balance, "💰"],
                ["Open positions worth", positionsValue, "📈"],
                ["Net worth", balance + positionsValue, "🏆"],
              ].map(([label, value, icon], i) => {
                const isNetWorth = label === "Net worth";
                const card = (
                  <div className={"h-full rounded-lg p-3" + (isNetWorth ? (dark ? " bg-gray-900" : " bg-white") : " border " + statCardClass)}>
                    <dt className={"flex items-center gap-1.5 text-xs uppercase tracking-wide " + secondaryText}>
                      <span aria-hidden="true">{icon}</span> {label as string}
                    </dt>
                    <dd className={isNetWorth ? "text-2xl font-bold" : "text-xl font-semibold"} style={isNetWorth ? { color: accentText } : undefined}>
                      {money(value as number)} Hokie Bucks
                    </dd>
                  </div>
                );
                return (
                  <div
                    key={label as string}
                    className={
                      "animate-fade-up rounded-lg transition-transform duration-200 hover:-translate-y-1" +
                      (isNetWorth ? " bg-gradient-to-r from-[#861F41] to-[#E5751F] p-[2px]" : "")
                    }
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {card}
                  </div>
                );
              })}
            </dl>

            <h2
              className="mt-2 border-l-4 pl-3 text-lg font-semibold tracking-tight"
              style={{ borderColor: accent }}
            >
              Open positions
            </h2>
            {openRows.length === 0 && (
              <p className={"text-sm " + secondaryText}>
                You do not own any shares yet. Go to the <Link href="/" className="underline">home page</Link>,
                turn on Trading mode, and pick Yes or No on a market.
              </p>
            )}

            {openRows.map(({ p, m }, i) => (
              <section
                key={m.id}
                className={"animate-fade-up rounded-lg border p-4 transition-colors duration-150 " + cardClass}
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <h3 className="font-medium">{m.question}</h3>
                <p className={"text-xs " + secondaryText}>{m.ticker}</p>

                {(["yes", "no"] as Side[])
                  .filter((side) => owned(p, side) > 0)
                  .map((side) => {
                    const have = owned(p, side);
                    const isPicked = picked?.marketId === m.id && picked.side === side;
                    const proceeds = isPicked ? sellProceeds(m.q_yes, m.q_no, m.liquidity_b, side, shares) : 0;
                    const inputId = `sell-${m.id}-${side}`;

                    return (
                      <div key={side} className={"mt-3 border-t pt-3 " + (dark ? "border-gray-700" : "border-gray-200")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <SideBadge side={side} />{" "}
                            <span className="font-semibold">{plural(have, "share")}</span>
                            <p className={"text-sm " + secondaryText}>
                              Worth {money(have * sharePrice(m, side))} now · You put in {money(netSpent(m.id, side))}
                            </p>
                          </div>
                          <button
                            onClick={() => pickSell(m.id, side, have)}
                            aria-label={`Sell ${side.toUpperCase()} shares in ${m.ticker}`}
                            aria-expanded={isPicked}
                            className="rounded border border-gray-400 px-3 py-1 font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
                          >
                            Sell
                          </button>
                        </div>

                        {isPicked && (
                          <div className={"mt-3 animate-fade-up rounded border p-3 " + (dark ? "border-gray-600" : "border-gray-300")}>
                            <label htmlFor={inputId} className="text-sm font-medium">
                              Shares of {side.toUpperCase()} to sell (you own {have})
                            </label>
                            <input
                              id={inputId}
                              type="number"
                              min={1}
                              max={have}
                              step={1}
                              value={shares}
                              onChange={(e) =>
                                setShares(Math.min(have, Math.max(1, Math.floor(Number(e.target.value) || 1))))
                              }
                              className="mt-1 w-full rounded border border-gray-500 bg-transparent p-2"
                            />
                            <p className="mt-2 text-sm">
                              You get: <span className="font-semibold">{money(proceeds)} Hokie Bucks</span>
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={confirmSell}
                                disabled={busy}
                                className="rounded px-3 py-1 font-semibold transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                style={{ backgroundColor: "#E5751F", color: "#1a1a1a" }}
                              >
                                {busy ? "Selling..." : "Confirm sell"}
                              </button>
                              <button
                                onClick={() => setPicked(null)}
                                className="rounded border border-gray-500 px-3 py-1 transition-transform duration-150 hover:scale-105 active:scale-95"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </section>
            ))}

            {settledRows.length > 0 && (
              <>
                <h2
                  className="mt-2 border-l-4 pl-3 text-lg font-semibold tracking-tight"
                  style={{ borderColor: "#861F41" }}
                >
                  Finished markets
                </h2>
                {settledRows.map(({ p, m }, i) => {
                  const paid = m.outcome ? owned(p, m.outcome) : 0;
                  return (
                    <section
                      key={m.id}
                      className={"animate-fade-up rounded-lg border p-4 " + cardClass}
                      style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                    >
                      <h3 className="font-medium">{m.question}</h3>
                      <p className={"text-xs " + secondaryText}>{m.ticker}</p>
                      <p className="mt-2 text-sm">
                        {m.status === "resolved" && m.outcome ? (
                          <>
                            Result: <SideBadge side={m.outcome} /> · You were paid{" "}
                            <span className="font-semibold">{money(paid)} Hokie Bucks</span>
                          </>
                        ) : (
                          "Cancelled. What you spent on this market was refunded."
                        )}
                      </p>
                    </section>
                  );
                })}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
