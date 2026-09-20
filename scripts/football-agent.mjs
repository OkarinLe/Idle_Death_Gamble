// Football Data Agent.
// Reads the official Virginia Tech football schedule and keeps ONLY live data:
//   - the game in progress (if any) and the next few upcoming games -> saved on the
//     "hokies-football" place (places.meta), which the home page shows
//   - when a game is final, the final margin (VT points minus opponent points) -> readings
//     as metric "vt_margin". The market "Will VT win?" resolves when margin > 0.
// Past games are ignored.
//
// Source: https://hokiesports.com/sports/football/schedule  (robots.txt allows bots).
// We only fetch one page, once per hour normally, every 5 minutes around game time.
//
// Run: npm run football-agent          (loops)   |   npm run football-agent -- --once
import { createClient } from "@supabase/supabase-js";

const SCHEDULE_URL = "https://hokiesports.com/sports/football/schedule?view=list";
const SOURCE = "hokiesports.com"; // task 4 turns this into the agent's ANS name
const PLACE_SLUG = "hokies-football";
const HOUR = 3600 * 1000;
const GAME_HOURS = 5; // we call a game "live" for this long after kickoff

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// "Sat Sep 19", in Eastern time. Used to match a game in the structured data with its table row.
function etDay(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" })
      .formatToParts(date).map((x) => [x.type, x.value])
  );
  return `${p.weekday} ${p.month} ${p.day}`;
}

const cleanText = (html) =>
  html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Returns games sorted by kickoff: { opponent, home, kickoff (ms), timeTbd, result: {vt, opp} | null }
async function getData() {
  const res = await fetch(SCHEDULE_URL, {
    headers: { "User-Agent": "IdleDeathGamble-hackathon (Virginia Tech student project)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`hokiesports.com returned ${res.status}`);
  const html = await res.text();

  // Kickoff times and opponents come from the page's JSON-LD (structured event data).
  const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
  if (!ld) throw new Error("Schedule page changed: no structured event data found");
  const events = (JSON.parse(ld[1])["@graph"] ?? []).filter((o) => o["@type"] === "Event" || o["@type"] === "SportsEvent");

  // Scores and "TBA" come from the schedule table (one row per game).
  const table = html.match(/<table class="schedule-events-table__table">[\s\S]*?<\/table>/);
  const rows = table
    ? [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => [...m[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((c) => cleanText(c[0])))
    : [];

  const games = [];
  for (const e of events) {
    const m = /^Virginia Tech (vs\.|at) (.+)$/.exec(e.name ?? "");
    if (!m || /championship/i.test(m[2])) continue; // skip games with no known opponent yet
    const kickoff = new Date(e.startDate);
    const row = rows.find((r) => r[0] === etDay(kickoff));
    const timeText = row?.[3] ?? "";
    const score = /^([WL])\s*(\d+)\s*-\s*(\d+)/.exec(timeText); // e.g. "W 44-21"
    let result = null;
    if (score) {
      const [a, b] = [Number(score[2]), Number(score[3])]; // winner's points first
      result = score[1] === "W" ? { vt: a, opp: b } : { vt: b, opp: a };
    }
    games.push({
      opponent: m[2].trim(),
      home: m[1] === "vs.",
      kickoff: kickoff.getTime(),
      timeTbd: /TB[AD]/i.test(timeText),
      result,
    });
  }
  return games.sort((a, b) => a.kickoff - b.kickoff);
}

async function run() {
  const games = await getData();
  const now = Date.now();

  const live = games.find((g) => !g.result && g.kickoff <= now && now < g.kickoff + GAME_HOURS * HOUR) ?? null;
  const upcoming = games.filter((g) => !g.result && g.kickoff > now).slice(0, 3);
  const iso = (g) => ({ opponent: g.opponent, home: g.home, kickoff: new Date(g.kickoff).toISOString(), time_tbd: g.timeTbd });

  const { data: place, error } = await supabase.from("places").select("id").eq("slug", PLACE_SLUG).single();
  if (error) throw new Error(`Place "${PLACE_SLUG}" missing. Run: npm run seed-places`);

  const meta = { live: live ? iso(live) : null, upcoming: upcoming.map(iso), updated_at: new Date(now).toISOString() };
  const { error: metaError } = await supabase.from("places").update({ meta }).eq("id", place.id);
  if (metaError) throw metaError;

  // Save the margin for games that just finished. We repeat it on every poll until the
  // game window is over, so resolve_market always finds a fresh reading near the resolve time.
  const finished = games.filter((g) => g.result && g.kickoff > now - 8 * HOUR);
  if (finished.length > 0) {
    const rows = finished.map((g) => ({
      place_id: place.id,
      metric: "vt_margin",
      value: g.result.vt - g.result.opp,
      unit: "pts",
      source: SOURCE,
      recorded_at: new Date(now).toISOString(),
    }));
    const { error: readingError } = await supabase.from("readings").upsert(rows, {
      onConflict: "place_id,metric,recorded_at,source",
      ignoreDuplicates: true,
    });
    if (readingError) throw readingError;
  }

  console.log(
    `Live: ${live ? live.opponent : "none"} | Next: ${upcoming[0] ? upcoming[0].opponent : "none"} | ` +
    `saved ${finished.length} final margin(s)`
  );

  // How long to wait before the next look at the schedule.
  const nearGame = games.some((g) => now >= g.kickoff - HOUR && now <= g.kickoff + 8 * HOUR);
  return nearGame ? 5 * 60 * 1000 : HOUR;
}

async function loop() {
  let wait = HOUR;
  try {
    wait = await run();
  } catch (e) {
    console.error("Football agent failed:", e.message ?? e);
    process.exitCode = 1;
  }
  if (process.argv.includes("--once")) return;
  setTimeout(loop, wait);
}
loop();
