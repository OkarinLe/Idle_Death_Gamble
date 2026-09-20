"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { yesPrice } from "@/lib/lmsr";
import type { Place, Reading, Market } from "@/lib/types";

type Profile = { display_name: string; balance: number };

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

  useEffect(() => {
    async function load() {
      const [p, r, m] = await Promise.all([
        supabase.from("places").select("*").order("name"),
        supabase.from("place_latest").select("*"),
        supabase.from("markets").select("*").eq("status", "open"),
      ]);
      setPlaces((p.data as Place[]) ?? []);
      setLatest((r.data as Reading[]) ?? []);
      setMarkets((m.data as Market[]) ?? []);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("display_name, balance")
          .eq("id", user.id)
          .single();
        if (data) setProfile(data as Profile);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTrading() {
    setTrading(!trading);
    setNote("");
  }

  function handleBuy() {
    if (!profile) {
      router.push("/login");
      return;
    }
    setNote("Buying opens in the next step.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
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

        <div className="flex items-center gap-3">
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

              {occ ? (
                <div className="mt-3">
                  <div className="flex justify-between text-sm">
                    <span>Occupancy</span>
                    <span className="font-semibold">{Math.round(occ.value)}% full</span>
                  </div>
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
                <div className="mt-4 space-y-3 border-t border-gray-700 pt-3">
                  {placeMarkets.length === 0 && (
                    <p className="text-sm opacity-70">No open markets for this place yet.</p>
                  )}
                  {placeMarkets.map((m) => {
                    const yes = Math.round(yesPrice(m.q_yes, m.q_no, m.liquidity_b) * 100);
                    const no = 100 - yes;
                    return (
                      <div key={m.id}>
                        <p className="font-medium">{m.question}</p>
                        <p className="text-xs opacity-70">
                          {m.ticker} · Volume {Number(m.volume).toFixed(0)}
                          {m.closes_at && ` · Closes ${new Date(m.closes_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={handleBuy}
                            aria-label={`Buy Yes at ${yes} cents`}
                            className="rounded p-2 font-semibold text-white"
                            style={{ backgroundColor: "#0B6E99" }}
                          >
                            ▲ Yes {yes}¢
                          </button>
                          <button
                            onClick={handleBuy}
                            aria-label={`Buy No at ${no} cents`}
                            className="rounded p-2 font-semibold text-white"
                            style={{ backgroundColor: "#B34700" }}
                          >
                            ▼ No {no}¢
                          </button>
                        </div>
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