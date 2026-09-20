"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { yesPrice, buyCost } from "@/lib/lmsr";
import PriceChart, { type ChartPoint } from "@/components/PriceChart";
import type { Place, Reading, Market } from "@/lib/types";

type Profile = { display_name: string; balance: number };
type Pick = { marketId: string; side: "yes" | "no" };

// Section order on the home page: sports first, then dining halls, then everything else
// (gyms, the library, ...) lumped together as misc. Categories come from the `places` table.
const CATEGORY_ORDER: Record<string, number> = { sports: 0, dining: 1 };
function categoryRank(category: string) {
  return CATEGORY_ORDER[category] ?? 2;
}

// Football card. Shows the game in progress, or else the next one. Past games are never shown.
// The data comes from scripts/football-agent.mjs (saved on the place's meta).
function GameCard({ place }: { place: Place }) {
  const { t } = useT();
  const live = place.meta?.live;
  const game = live ?? place.meta?.upcoming?.[0];
  if (!game) return <p className="mt-3 text-sm opacity-70">{t("game.none")}</p>;

  const when = new Date(game.kickoff).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  });
  return (
    <div className="mt-3 text-sm">
      <p className="font-semibold">
        {live ? t("game.live") : t("game.next")}{t(game.home ? "game.vs" : "game.at", { opp: game.opponent })}
      </p>
      <p className="mt-1 text-xs opacity-70">
        {live
          ? t("game.inProgress")
          : game.time_tbd ? t("game.tbd") : `${when} ET`}
        {` · ${t("game.source")}`}
      </p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { t } = useT();
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
    // The query already sorts by name; Array.sort is stable, so this keeps each
    // category alphabetical while grouping sports, then dining, then misc.
    const sortedPlaces = [...((p.data as Place[]) ?? [])].sort(
      (a, b) => categoryRank(a.category) - categoryRank(b.category)
    );
    setPlaces(sortedPlaces);
    setLatest((r.data as Reading[]) ?? []);
    // Live only: a market past its closing time is not tradable, so it is not shown.
    const openMarkets = ((m.data as Market[]) ?? []).filter((x) => !x.closes_at || new Date(x.closes_at).getTime() > Date.now());
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
    setNote(t("bought", { shares, side: t(picked.side).toUpperCase(), cost: Number(result.cost).toFixed(2) }));
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
    const time = new Date(r.recorded_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return t(r.source === "seed" ? "sample" : "updated", { t: time });
  }

  const dark = trading;

  return (
    <div className={(dark ? "min-h-screen bg-gray-950 text-gray-100" : "min-h-screen bg-white text-gray-900") + " transition-colors duration-300"}>
      {/* The top bar gets its own background so it reads as a distinct band. It goes
          near-black in Trading mode (darker than the gray-950 page behind it) to set the
          "you're trading now" tone apart from the everyday campus-info look. */}
      <header
        className={
          "border-b transition-colors duration-300 " +
          (dark ? "border-gray-800 bg-black" : "border-gray-200 bg-white")
        }
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 p-4">
          <h1 className="text-2xl font-bold transition-colors duration-300" style={{ color: dark ? "#E5751F" : "#861F41" }}>
            Idle Death Gamble
          </h1>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/leaderboard" className="text-sm underline">{t("nav.leaderboard")}</Link>
            {profile && <Link href="/portfolio" className="text-sm underline">{t("nav.portfolio")}</Link>}
            {profile && (
              <>
                <span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: "#E5751F", color: "#1a1a1a" }}>
                  {Number(profile.balance).toFixed(2)} Hokie Bucks
                </span>
                <button onClick={signOut} className="text-sm underline">{t("nav.signOut")}</button>
              </>
            )}
            {!profile && !loading && (
              <a href="/login" className="text-sm underline">{t("nav.signIn")}</a>
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
                className="inline-block h-4 w-8 rounded-full p-0.5 transition-colors duration-300"
                style={{ backgroundColor: trading ? "#E5751F" : "#4b5563" }}
              >
                <span
                  className="block h-3 w-3 rounded-full bg-white transition-transform duration-300"
                  style={{ transform: trading ? "translateX(16px)" : "translateX(0)" }}
                />
              </span>
              {t("trading.label", { state: trading ? t("on") : t("off") })}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl space-y-4 p-4">
        <p className={dark ? "text-gray-300" : "text-gray-600"}>
          {trading
            ? t("intro.trading")
            : t("intro.info")}
        </p>

        {trading && !profile && !loading && (
          <p className="rounded border border-orange-500 p-2 text-sm">
            {t("browse.a")}{" "}
            <a href="/login" className="font-semibold underline">{t("browse.link")}</a>{" "}
            {t("browse.b")}
          </p>
        )}

        <p
          key={note}
          role="status"
          aria-live="polite"
          className={"min-h-6 text-sm font-medium" + (note ? " animate-fade-in" : "")}
          style={{ color: dark ? "#E5751F" : "#B34700" }}
        >
          {note}
        </p>

        {loading && <p>{t("loading")}</p>}

        {places.map((place, i) => {
          const occ = reading(place.id, "occupancy_pct");
          const wait = reading(place.id, "wait_minutes");
          const people = reading(place.id, "occupancy_count"); // head count (gyms)
          const placeMarkets = markets.filter((m) => m.place_id === place.id);

          return (
            <section
              key={place.id}
              className={
                (dark
                  ? "rounded-lg border border-gray-700 bg-gray-900 p-4"
                  : "rounded-lg border border-gray-300 bg-white p-4 shadow-sm") +
                " animate-fade-up transition-colors duration-300"
              }
              // Each card starts slightly after the one before it, so the list settles in
              // top to bottom instead of all at once.
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
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
                    <span>{t("occupancy")}</span>
                    <span className="font-semibold">{t("full", { n: Math.round(occ.value) })}</span>
                  </div>
                  {people && (
                    <p className="text-sm">
                      {place.capacity
                        ? t("peopleOf", { n: Math.round(people.value), cap: place.capacity })
                        : t("people", { n: Math.round(people.value) })}
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
                    <div
                      className="h-full transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, occ.value)}%`, backgroundColor: "#861F41" }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm opacity-70">{t("noOcc")}</p>
              )}

              {wait && (
                <p className="mt-2 text-sm">
                  {t("wait", { n: Math.round(wait.value) })}
                </p>
              )}
              {(occ || wait) && (
                <p className="mt-1 text-xs opacity-70">{timeLabel((occ ?? wait) as Reading)}</p>
              )}

              {trading && (
                <div className="mt-4 space-y-4 border-t border-gray-700 pt-3">
                  {placeMarkets.length === 0 && (
                    <p className="text-sm opacity-70">{t("noMarkets")}</p>
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
                          {m.ticker} · {t("volume")} {Number(m.volume).toFixed(0)}
                          {m.closes_at && ` · ${t("closes")} ${new Date(m.closes_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                        </p>
                        <PriceChart points={history[m.id] ?? []} />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handlePick(m.id, "yes")}
                            aria-label={t("buyYes", { n: yes })}
                            aria-pressed={isPicked && picked.side === "yes"}
                            className="rounded p-2 font-semibold text-white transition-transform duration-150 hover:scale-105 active:scale-95"
                            style={{
                              backgroundColor: "#0B6E99",
                              outline: isPicked && picked.side === "yes" ? "3px solid #fff" : "none",
                            }}
                          >
                            ▲ {t("yes")} {yes}¢
                          </button>
                          <button
                            onClick={() => handlePick(m.id, "no")}
                            aria-label={t("buyNo", { n: no })}
                            aria-pressed={isPicked && picked.side === "no"}
                            className="rounded p-2 font-semibold text-white transition-transform duration-150 hover:scale-105 active:scale-95"
                            style={{
                              backgroundColor: "#B34700",
                              outline: isPicked && picked.side === "no" ? "3px solid #fff" : "none",
                            }}
                          >
                            ▼ {t("no")} {no}¢
                          </button>
                        </div>

                        {isPicked && (
                          <div className="mt-3 animate-fade-up rounded border border-gray-600 p-3">
                            <label htmlFor={`shares-${m.id}`} className="text-sm font-medium">
                              {t("shares", { side: t(picked.side).toUpperCase() })}
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
                              {t("cost")} <span className="font-semibold">{cost.toFixed(2)} Hokie Bucks</span>
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={confirmBuy}
                                disabled={busy}
                                className="rounded px-3 py-1 font-semibold transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                style={{ backgroundColor: "#E5751F", color: "#1a1a1a" }}
                              >
                                {busy ? t("buying") : t("confirmBuy")}
                              </button>
                              <button
                                onClick={() => setPicked(null)}
                                className="rounded border border-gray-500 px-3 py-1 transition-transform duration-150 hover:scale-105 active:scale-95"
                              >
                                {t("cancel")}
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
