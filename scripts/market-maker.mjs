// Market Maker Agent.
// Looks at LIVE readings only (the newest number per place, no older than 30 minutes),
// asks the AI for 1 to 3 Yes/No market ideas, CHECKS every idea, and inserts the good ones.
// It also adds a "Will Virginia Tech win?" market for upcoming football games (made by
// plain code from the schedule, no AI needed).
//
// Run:   npm run market-maker              (markets that resolve in 2 hours)
//        npm run market-maker -- --minutes 10     (short market, good for demos)
//        npm run market-maker -- --dry-run        (show the ideas, save nothing)
//
// Rules this script follows:
//  - The AI only PROPOSES (question, place, metric, comparator, threshold).
//  - Plain code validates every field, sets the times, and writes the rules text.
//  - Resolution and payouts are never AI: resolve_market in the database does that.
import { createClient } from "@supabase/supabase-js";
import { askAI, parseAIJson } from "../src/lib/ai.ts";

// Name saved in markets.created_by. Task 4 replaces this with the agent's ANS name.
const AGENT_NAME = "market-maker-agent";
const FRESH_MINUTES = 30; // a reading older than this is not "live"

const METRICS = {
  occupancy_pct: { label: "occupancy", unit: "%", min: 0, max: 100 },
  wait_minutes: { label: "wait time", unit: " min", min: 0, max: 120 },
  occupancy_count: { label: "head count", unit: " people", min: 0, max: 5000 }, // max is the place's capacity
};
const COMPARATORS = ["gt", "gte", "lt", "lte"];
const COMPARATOR_WORDS = { gt: "above", gte: "at or above", lt: "below", lte: "at or below" };

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const minutesArg = Number(args[args.indexOf("--minutes") + 1]);
const MARKET_MINUTES = args.includes("--minutes") && minutesArg >= 1 ? minutesArg : 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// VT is in the Eastern time zone, so show times that way.
const clock = (d) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const dayAndClock = (d) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }) +
  ` at ${clock(d)}`;

// ---------- 1. Gather what the AI needs to know (live data only) ----------
async function loadContext() {
  const { data: places, error } = await supabase.from("places").select("id, slug, name, category, capacity, meta");
  if (error) throw error;

  // place_latest = the newest reading for each place + metric.
  const { data: latest, error: latestError } = await supabase
    .from("place_latest")
    .select("place_id, metric, value, source, recorded_at");
  if (latestError) throw latestError;

  const cutoff = Date.now() - FRESH_MINUTES * 60 * 1000;
  const summary = []; // what we show the AI
  for (const place of places.filter((p) => p.category !== "sports")) {
    const metrics = {};
    for (const r of latest.filter((x) => x.place_id === place.id && METRICS[x.metric])) {
      if (new Date(r.recorded_at).getTime() < cutoff) continue;
      metrics[r.metric] = { current: Number(r.value), is_sample_data: r.source === "seed" };
    }
    if (Object.keys(metrics).length > 0) {
      summary.push({ slug: place.slug, name: place.name, capacity: place.capacity, metrics });
    }
  }

  const { data: open, error: openError } = await supabase
    .from("markets")
    .select("place_id, metric, comparator, threshold, question")
    .eq("status", "open");
  if (openError) throw openError;

  return { places, summary, open };
}

// ---------- 2. Ask the AI ----------
async function askForIdeas(summary, open, placeById, closesAt) {
  const system = `You create Yes/No prediction-market questions for Virginia Tech students about campus dining halls, gyms and the library. Markets use play money only.

Reply with ONLY a JSON object, no other text, exactly in this shape:
{"markets":[{"question":"...","place_slug":"d2","metric":"wait_minutes","comparator":"gt","threshold":20}]}

Rules:
- Return between 1 and 3 markets. Each must be about a different place.
- place_slug must be one of: ${summary.map((p) => p.slug).join(", ")}.
- metric must be one the place has in its data: "occupancy_pct" (percent full, 0 to 100), "wait_minutes" (minutes in line), or "occupancy_count" (number of people inside; gyms only, never above the place's capacity).
- For gyms, prefer "occupancy_count" and ask about head counts, like "at least 300 people" or "under 40 people".
- comparator must be "gt" (over), "gte" (at least), "lt" (under) or "lte" (at most).
- threshold is a number close to the CURRENT value, so the answer is honestly uncertain.
- question: one clear sentence ending in "?". Write the threshold number exactly as it appears in the threshold field. The wording must match the comparator. Do NOT mention a time; the system adds it. Friendly and a little funny is welcome, but stay clear.`;

  const user = `Right now it is ${clock(new Date())}. Markets you create will close at ${clock(closesAt)}.

Live readings right now (nothing older is available or needed):
${JSON.stringify(summary, null, 2)}

Markets that are already open (do not repeat these):
${JSON.stringify(open.map((m) => ({ place: placeById[m.place_id]?.slug, metric: m.metric, comparator: m.comparator, threshold: m.threshold })))}`;

  const text = await askAI(system, user);
  return parseAIJson(text);
}

// ---------- 3. Check every idea. Returns { market } or { reason } ----------
function validate(idea, ctx) {
  if (typeof idea !== "object" || idea === null) return { reason: "not an object" };
  const { question, place_slug, metric, comparator, threshold } = idea;

  if (typeof question !== "string" || question.length < 10 || question.length > 200 || !question.trim().endsWith("?"))
    return { reason: "question must be 10-200 characters and end with ?" };
  const place = ctx.places.find((p) => p.slug === place_slug && p.category !== "sports");
  if (!place) return { reason: `unknown place "${place_slug}"` };
  if (!METRICS[metric]) return { reason: `unknown metric "${metric}"` };
  if (!COMPARATORS.includes(comparator)) return { reason: `unknown comparator "${comparator}"` };
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) return { reason: "threshold must be a number" };

  // Head counts can never go above the place's capacity.
  const max = metric === "occupancy_count" ? (place.capacity ?? METRICS[metric].max) : METRICS[metric].max;
  if (threshold < METRICS[metric].min || threshold > max) return { reason: `threshold ${threshold} is outside ${METRICS[metric].min}-${max}` };

  // The market can only resolve if that place has this kind of LIVE reading.
  const data = ctx.summary.find((p) => p.slug === place_slug)?.metrics[metric];
  if (!data) return { reason: `no live ${metric} reading for ${place_slug}` };

  // Catch questions whose words disagree with the numbers.
  if (!question.includes(String(threshold))) return { reason: `question does not contain the threshold ${threshold}` };
  const q = question.toLowerCase();
  const saysHigh = /\b(over|above|more than|at least|longer than|exceed)/.test(q);
  const saysLow = /\b(under|below|less than|at most|fewer than|shorter than)/.test(q);
  if ((comparator === "gt" || comparator === "gte") && saysLow && !saysHigh) return { reason: "question wording says low but comparator says high" };
  if ((comparator === "lt" || comparator === "lte") && saysHigh && !saysLow) return { reason: "question wording says high but comparator says low" };

  const duplicate = ctx.open.some(
    (m) => m.place_id === place.id && m.metric === metric && m.comparator === comparator && Number(m.threshold) === threshold
  );
  if (duplicate) return { reason: "an identical market is already open" };

  return { market: { question: question.trim(), place, metric, comparator, threshold } };
}

// ---------- 4. Turn a checked idea into a database row ----------
function toRow(m, closesAt) {
  const when = clock(closesAt);
  const info = METRICS[m.metric];
  const shortMetric = { wait_minutes: "WAIT", occupancy_pct: "OCC", occupancy_count: "COUNT" }[m.metric];
  const suffix = Date.now().toString(36).slice(-4).toUpperCase(); // keeps tickers unique
  return {
    ticker: `${m.place.slug.toUpperCase()}-${shortMetric}-${m.comparator.toUpperCase()}${m.threshold}-${suffix}`,
    // Add the time ourselves so the question and the rules always agree.
    question: m.question.replace(/\?\s*$/, ` at ${when}?`),
    rules:
      `Resolves YES if the latest ${info.label} reading for ${m.place.name} recorded at or before ${when} ` +
      `is ${COMPARATOR_WORDS[m.comparator]} ${m.threshold}${info.unit}. Otherwise NO. ` +
      `Decided automatically from the readings table, not by AI.`,
    place_id: m.place.id,
    metric: m.metric,
    comparator: m.comparator,
    threshold: m.threshold,
    status: "open",
    closes_at: closesAt.toISOString(),
    resolves_at: closesAt.toISOString(),
    created_by: AGENT_NAME,
  };
}

// ---------- 5. "Will Virginia Tech win?" for the next football games (no AI) ----------
// The football agent keeps upcoming games in places.meta. Trading closes at kickoff. The market
// resolves 5 hours later from the vt_margin reading (VT points minus opponent points, above 0 = win).
async function footballRows(ctx) {
  const football = ctx.places.find((p) => p.slug === "hokies-football");
  const games = (football?.meta?.upcoming ?? []).filter((g) => {
    const kickoff = new Date(g.kickoff).getTime();
    // Only games with a known start time, starting in 15 minutes to 10 days.
    return !g.time_tbd && kickoff > Date.now() + 15 * 60 * 1000 && kickoff < Date.now() + 10 * 24 * 3600 * 1000;
  });
  if (games.length === 0) return [];

  const withTicker = games.map((g) => {
    const kickoff = new Date(g.kickoff);
    const day = kickoff.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", timeZone: "America/New_York" }).replace("/", "");
    return { g, kickoff, ticker: `VT-WIN-${g.opponent.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase()}-${day}` };
  });
  const { data: existing, error } = await supabase.from("markets").select("ticker").in("ticker", withTicker.map((x) => x.ticker));
  if (error) throw error;
  const have = new Set(existing.map((x) => x.ticker));

  return withTicker
    .filter((x) => !have.has(x.ticker))
    .map(({ g, kickoff, ticker }) => ({
      ticker,
      question: `Will Virginia Tech beat ${g.opponent} on ${dayAndClock(kickoff)}?`,
      rules:
        `Resolves YES if Virginia Tech's final margin (VT points minus ${g.opponent} points) from the official ` +
        `hokiesports.com schedule is above 0. Otherwise NO. Trading closes at kickoff. ` +
        `Decided automatically from the readings table, not by AI.`,
      place_id: football.id,
      metric: "vt_margin",
      comparator: "gt",
      threshold: 0,
      status: "open",
      closes_at: kickoff.toISOString(),
      resolves_at: new Date(kickoff.getTime() + 5 * 3600 * 1000).toISOString(),
      created_by: AGENT_NAME,
    }));
}

async function save(rows) {
  for (const r of rows) console.log(`${DRY_RUN ? "Would create" : "Creating"} ${r.ticker}: ${r.question}`);
  if (DRY_RUN || rows.length === 0) return;
  const { error } = await supabase.from("markets").insert(rows);
  if (error) throw error;
  console.log(`Saved ${rows.length} market(s), created_by "${AGENT_NAME}".`);
}

async function run() {
  const ctx = await loadContext();
  const placeById = Object.fromEntries(ctx.places.map((p) => [p.id, p]));

  // Football first: it does not need the AI.
  await save(await footballRows(ctx));

  if (ctx.summary.length === 0) {
    console.log(`No live readings (newer than ${FRESH_MINUTES} minutes). Start the scraper first: npm run scrape`);
    return;
  }
  if (ctx.summary.every((p) => Object.values(p.metrics).every((m) => m.is_sample_data)))
    console.log("Note: all live readings are Sample data, so these are practice markets.");

  const closesAt = new Date(Date.now() + MARKET_MINUTES * 60 * 1000);
  const reply = await askForIdeas(ctx.summary, ctx.open, placeById, closesAt);
  const ideas = Array.isArray(reply?.markets) ? reply.markets.slice(0, 3) : [];
  if (ideas.length === 0) throw new Error('AI reply had no "markets" list');

  const rows = [];
  for (const idea of ideas) {
    const result = validate(idea, ctx);
    if (result.reason) {
      console.log(`Rejected: ${JSON.stringify(idea?.question ?? idea)} (${result.reason})`);
      continue;
    }
    // Two ideas in the same reply must not repeat each other either.
    ctx.open.push({ place_id: result.market.place.id, ...result.market });
    rows.push(toRow(result.market, closesAt));
  }
  if (rows.length === 0) console.log("No valid AI ideas this time.");
  await save(rows);
  if (rows.length > 0) console.log(`AI markets close ${clock(closesAt)}.`);
}

run().catch((e) => {
  console.error("Market Maker failed:", e.message ?? e);
  process.exitCode = 1;
});
