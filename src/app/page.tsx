"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { yesPrice, buyCost } from "@/lib/lmsr";
import PriceChart, { type ChartPoint } from "@/components/PriceChart";
import type { Place, Reading, Market } from "@/lib/types";

type Profile = { display_name: string; balance: number };
type Pick = { marketId: string; side: "yes" | "no" };

// Football card. Shows the game in progress, or else the next one. Past games are never shown.
// The data comes from scripts/football-agent.mjs (saved on the place's meta).
function GameCard({ place }: { place: Place }) {
  const live = place.meta?.live;
  const game = live ?? place.meta?.upcoming?.[0];
  if (!game) return <p className="mt-3 text-sm opacity-70">No live or upcoming game right now.</p>;

  const when = new Date(game.kickoff).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  });
  return (
    <div className="mt-3 text-sm">
      <p className="font-semibold">
        {live ? "LIVE now: " : "Next game: "}Virginia Tech {game.home ? "vs." : "at"} {game.opponent}
      </p>
      <p className="mt-1 text-xs opacity-70">
        {live
          ? "In progress. The final score shows up when the game ends."
          : game.time_tbd ? "Start time to be announced" : `${when} ET`}
        {" · Official schedule, hokiesports.com"}
      </p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  const [places, setPlaces] = useState<Place[]>([]);
  const [latest, setLatest] = useState<Reading[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trading, setTrading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Pick | null>(null);
  const [shares, setShares] = useState(10);
  const [busy, setBusy] = useState(false);
  // Yes-price history for each open market, used by the live chart.
  const [history, setHistory] = useState<Record<string, ChartPoint[]>>({});

  // Every trade saves a price point. Each chart starts at 50 cents when the market was created.
  async function loadHistory(open: Market[]) {
    if (open.length === 0) return setHistory({});
    const { data } = await supabase
      .from("market_price_history")
      .select("market_id, yes_price, created_at")
      .in("market_id", open.map((m) => m.id))
      .order("created_at", { ascending: true });
    const byMarket: Record<string, ChartPoint[]> = {};
    for (const m of open) byMarket[m.id] = [{ t: new Date(m.created_at).getTime(), y: 0.5 }];
    for (const row of data ?? []) {
      byMarket[row.market_id]?.push({ t: new Date(row.created_at).getTime(), y: Number(row.yes_price) });
    }
    setHistory(byMarket);
  }

  async function loadData() {
    const [p, r, m] = await Promise.all([
      supabase.from("places").select("*").order("name"),
      supabase.from("place_latest").select("*"),
      supabase.from("markets").select("*").eq("status", "open"),
    ]);
    setPlaces((p.data as Place[]) ?? []);
    setLatest((r.data as Reading[]) ?? []);
    const openMarkets = (m.data as Market[]) ?? [];
    setMarkets(openMarkets);
    await loadHistory(openMarkets);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, balance")
        .eq("id", user.id)
        .single();
      setProfile((data as Profile) ?? null);
    } else {
      setProfile(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Loading data when the page opens is the whole point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!trading) return;
    const timer = setInterval(() => loadData(), 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trading]);

  function toggleTrading() {
    setTrading(!trading);
    setNote("");
    setPicked(null);
  }

  function handlePick(marketId: string, side: "yes" | "no") {
    if (!profile) {
      router.push("/login");
      return;
    }
    setPicked({ marketId, side });
    setShares(10);
    setNote("");
  }

  async function confirmBuy() {
    if (!picked) return;
    setBusy(true);
    setNote("");
    const { data, error } = await supabase.rpc("buy_shares", {
      p_market_id: picked.marketId,
      p_side: picked.side,
      p_shares: shares,
    });
    setBusy(false);
    if (error) {
      setNote(error.message);
      return;
    }
    const result = data as { cost: number };
    setNote(`Bought ${shares} ${picked.side.toUpperCase()} shares for ${Number(result.cost).toFixed(2)} Hokie Bucks.`);
    setPicked(null);
    await loadData();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setPicked(null);
  }

  function reading(placeId: string, metric: string) {
    return latest.find((r) => r.place_id === placeId && r.metric === metric);
  }

  function timeLabel(r: Reading) {
    const t = new Date(r.recorded_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return r.source === "seed" ? `Sample data, ${t}` : `Updated ${t}`;
  }

  const dark = trading;

  return (
    <div className={dark ? "min-h-screen bg-gray-950 text-gray-100" : "min-h-screen bg-white text-gray-900"}>
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 p-4">
        <h1 className="text-2xl font-bold" style={{ color: dark ? "#E5751F" : "#861F41" }}>
          Idle Death Gamble
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/leaderboard" className="text-sm underline">Leaderboard</Link>
          {profile && <Link href="/portfolio" className="text-sm underline">Portfolio</Link>}
          {profile && (
            <>
              <span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: "#E5751F", color: "#1a1a1a" }}>
                {Number(profile.balance).toFixed(2)} Hokie Bucks
              </span>
              <button onClick={signOut} className="text-sm underline">Sign out</button>
            </>
          )}
          {!profile && !loading && (
            <a href="/login" className="text-sm underline">Sign in</a>
          )}

          <button
            role="switch"
            aria-checked={trading}
            onClick={toggleTrading}
            className="flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm font-semibold"
            style={{ borderColor: dark ? "#E5751F" : "#861F41" }}
          >
            <span
              aria-hidden="true"
              className="inline-block h-4 w-8 rounded-full p-0.5"
              style={{ backgroundColor: trading ? "#E5751F" : "#9ca3af" }}
            >
              <span
                className="block h-3 w-3 rounded-full bg-white transition-transform"
                style={{ transform: trading ? "translateX(16px)" : "translateX(0)" }}
              />
            </span>
            Trading mode: {trading ? "On" : "Off"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <p className={dark ? "text-gray-300" : "text-gray-600"}>
          {trading
            ? "Play money only. Pick Yes or No on any market below."
            : "Live campus info. Turn on Trading mode to predict what happens next."}
        </p>

        {trading && !profile && !loading && (
          <p className="rounded border border-orange-500 p-2 text-sm">
            You can browse prices now.{" "}
            <a href="/login" className="font-semibold underline">Sign in with your VT email</a>{" "}
            to place trades.
          </p>
        )}

        <p role="status" aria-live="polite" className="min-h-6 text-sm font-medium" style={{ color: "#E5751F" }}>
          {note}
        </p>

        {loading && <p>Loading...</p>}

        {places.map((place) => {
          const occ = reading(place.id, "occupancy_pct");
          const wait = reading(place.id, "wait_minutes");
          const people = reading(place.id, "occupancy_count"); // head count (gyms)
          const placeMarkets = markets.filter((m) => m.place_id === place.id);

          return (
            <section
              key={place.id}
              className={
                dark
                  ? "rounded-lg border border-gray-700 bg-gray-900 p-4"
                  : "rounded-lg border border-gray-300 bg-white p-4 shadow-sm"
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{place.name}</h2>
                <span className="text-xs uppercase tracking-wide opacity-70">{place.category}</span>
              </div>

              {place.category === "sports" ? (
                <GameCard place={place} />
              ) : occ ? (
                <div className="mt-3">
                  <div className="flex justify-between text-sm">
                    <span>Occupancy</span>
                    <span className="font-semibold">{Math.round(occ.value)}% full</span>
                  </div>
                  {people && (
                    <p className="text-sm">
                      About <span className="font-semibold">{Math.round(people.value)}</span> people
                      {place.capacity ? ` of ${place.capacity}` : ""}
                    </p>
                  )}
                  <div
                    role="progressbar"
                    aria-label={`${place.name} occupancy`}
                    aria-valuenow={Math.round(occ.value)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-1 h-3 w-full overflow-hidden rounded bg-gray-300"
                  >
                    <div className="h-full" style={{ width: `${Math.min(100, occ.value)}%`, backgroundColor: "#861F41" }} />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm opacity-70">No occupancy data yet.</p>
              )}

              {wait && (
                <p className="mt-2 text-sm">
                  Wait: <span className="font-semibold">{Math.round(wait.value)} min</span>
                </p>
              )}
              {(occ || wait) && (
                <p className="mt-1 text-xs opacity-70">{timeLabel((occ ?? wait) as Reading)}</p>
              )}

              {trading && (
                <div className="mt-4 space-y-4 border-t border-gray-700 pt-3">
                  {placeMarkets.length === 0 && (
                    <p className="text-sm opacity-70">No open markets for this place yet.</p>
                  )}
                  {placeMarkets.map((m) => {
                    const yes = Math.round(yesPrice(m.q_yes, m.q_no, m.liquidity_b) * 100);
                    const no = 100 - yes;
                    const isPicked = picked?.marketId === m.id;
                    const cost = isPicked
                      ? buyCost(m.q_yes, m.q_no, m.liquidity_b, picked.side, shares)
                      : 0;

                    return (
                      <div key={m.id}>
                        <p className="font-medium">{m.question}</p>
                        <p className="text-xs opacity-70">
                          {m.ticker} · Volume {Number(m.volume).toFixed(0)}
                          {m.closes_at && ` · Closes ${new Date(m.closes_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                        </p>
                        <PriceChart points={history[m.id] ?? []} />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handlePick(m.id, "yes")}
                            aria-label={`Buy Yes at ${yes} cents`}
                            aria-pressed={isPicked && picked.side === "yes"}
                            className="rounded p-2 font-semibold text-white"
                            style={{
                              backgroundColor: "#0B6E99",
                              outline: isPicked && picked.side === "yes" ? "3px solid #fff" : "none",
                            }}
                          >
                            ▲ Yes {yes}¢
                          </button>
                          <button
                            onClick={() => handlePick(m.id, "no")}
                            aria-label={`Buy No at ${no} cents`}
                            aria-pressed={isPicked && picked.side === "no"}
                            className="rounded p-2 font-semibold text-white"
                            style={{
                              backgroundColor: "#B34700",
                              outline: isPicked && picked.side === "no" ? "3px solid #fff" : "none",
                            }}
                          >
                            ▼ No {no}¢
                          </button>
                        </div>

                        {isPicked && (
                          <div className="mt-3 rounded border border-gray-600 p-3">
                            <label htmlFor={`shares-${m.id}`} className="text-sm font-medium">
                              Shares of {picked.side.toUpperCase()} (each pays 1 Hokie Buck if you&apos;re right)
                            </label>
                            <input
                              id={`shares-${m.id}`}
                              type="number"
                              min={1}
                              max={1000}
                              step={1}
                              value={shares}
                              onChange={(e) =>
                                setShares(Math.min(1000, Math.max(1, Math.floor(Number(e.target.value) || 1))))
                              }
                              className="mt-1 w-full rounded border border-gray-500 bg-transparent p-2"
                            />
                            <p className="mt-2 text-sm">
                              Cost: <span className="font-semibold">{cost.toFixed(2)} Hokie Bucks</span>
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={confirmBuy}
                                disabled={busy}
                                className="rounded px-3 py-1 font-semibold disabled:opacity-50"
                                style={{ backgroundColor: "#E5751F", color: "#1a1a1a" }}
                              >
                                {busy ? "Buying..." : "Confirm buy"}
                              </button>
                              <button onClick={() => setPicked(null)} className="rounded border border-gray-500 px-3 py-1">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}