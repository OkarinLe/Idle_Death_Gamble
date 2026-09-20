import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Label for where the data came from. Later this becomes the agent's ANS name.
// Keep "seed" while the numbers are fake so the site shows "Sample data".
const SOURCE = "seed";

// TODO: replace with the real scraper.
// Return a list like { slug, metric, value, unit }. Slugs: d2, owens, west-end, newman-library
// For now: fake numbers for every place (dining, library, gyms) so every market has readings.
async function getData() {
  const slugs = ["d2", "owens", "west-end", "newman-library"];
  const rows = slugs.flatMap((slug) => [
    { slug, metric: "occupancy_pct", value: Math.round(40 + Math.random() * 50), unit: "%" },
    { slug, metric: "wait_minutes", value: Math.round(5 + Math.random() * 25), unit: "min" },
  ]);

  // Gyms: fake "percent full" plus the matching head count (percent x capacity).
  const gyms = { "war-memorial-hall": 1200, "mccomas-hall": 600, esports: 55, "bouldering-wall": 8 };
  for (const [slug, capacity] of Object.entries(gyms)) {
    const pct = Math.round(10 + Math.random() * 80);
    rows.push({ slug, metric: "occupancy_pct", value: pct, unit: "%" });
    rows.push({ slug, metric: "occupancy_count", value: Math.round((pct / 100) * capacity), unit: "people" });
  }
  return rows;
}

async function run() {
  try {
    const rows = await getData();

    const { data: places, error: placesError } = await supabase.from("places").select("id, slug");
    if (placesError) throw placesError;
    const idBySlug = Object.fromEntries(places.map((p) => [p.slug, p.id]));

    const now = new Date().toISOString();
    const inserts = rows
      .filter((r) => idBySlug[r.slug])
      .map((r) => ({
        place_id: idBySlug[r.slug],
        metric: r.metric,
        value: r.value,
        unit: r.unit,
        source: SOURCE,
        recorded_at: now,
      }));

    const { error } = await supabase.from("readings").upsert(inserts, {
      onConflict: "place_id,metric,recorded_at,source",
      ignoreDuplicates: true,
    });
    if (error) throw error;

    console.log(`Saved ${inserts.length} readings at ${now}`);
  } catch (e) {
    console.error("Scrape failed:", e.message ?? e);
  }
}

// With --once (used by the scheduled GitHub Action) run a single time and exit.
// Without it, keep running every 5 minutes.
run().then(() => {
  if (!process.argv.includes("--once")) setInterval(run, 5 * 60 * 1000);
});
