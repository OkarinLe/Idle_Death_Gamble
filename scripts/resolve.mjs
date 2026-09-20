import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  try {
    const { data: due, error } = await supabase
      .from("markets")
      .select("id, ticker")
      .in("status", ["open", "closed"])
      .lte("resolves_at", new Date().toISOString());
    if (error) throw error;

    if (due.length === 0) {
      console.log("Nothing to resolve");
      return;
    }

    for (const m of due) {
      const { data, error: e } = await supabase.rpc("resolve_market", { p_market_id: m.id });
      if (e) {
        console.log(`${m.ticker}: skipped (${e.message})`);
      } else {
        console.log(`${m.ticker}: resolved ${data.outcome.toUpperCase()} on value ${data.value}, paid ${data.paid} Hokie Bucks`);
      }
    }
  } catch (e) {
    console.error("Resolver failed:", e.message ?? e);
  }
}

// With --once (used by the scheduled GitHub Action) run a single time and exit.
// Without it, keep running every minute.
run().then(() => {
  if (!process.argv.includes("--once")) setInterval(run, 60 * 1000);
});
