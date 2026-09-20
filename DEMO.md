# Demo script (about 6 minutes)

## Before you start (5 minutes ahead)

1. Terminals running: `npm run dev`, `npm run scrape`, `npm run football-agent`, `npm run resolve`.
2. `npm run market-maker -- --minutes 10` so there are fresh markets that will end during the demo.
3. Supabase has `supabase/agents.sql` applied (the `/ans` page says "Setup needed" if not).
4. Sign in on one browser tab with a `@vt.edu` account that has a few Hokie Bucks. Keep a second, signed-out tab open.
5. Set language to English and High contrast Off.

## The story (say this, in this order)

**1. The problem (20 s).** "Where is it not crowded right now? Students guess. We turned guessing into a game with play money."

**2. Live info first (30 s).** Home page, Trading mode **Off**. Point at occupancy bars, wait times, the football card ("LIVE now" or "Next game"). Say: "Everything labeled *Sample data* is fake on purpose. Football comes from the official schedule."

**3. Trading (60 s).** Turn Trading mode **On**. Pick a gym market: "Will War Memorial Hall be at least 80% full…?". Click **▲ Yes**, buy 10 shares, watch the price chart move. Say: "Prices use LMSR, a market-maker formula, so you can always buy or sell. Yes is blue with an up arrow, No is orange with a down arrow, so it never depends on color."
Open **Portfolio**, sell a few shares. Open **Leaderboard**.

**4. Markets that make themselves (45 s) - Deloitte x Databricks.** In a terminal run `npm run market-maker -- --minutes 5`. Show the output: the agent asks the Databricks model for ideas, then plain code **rejects or accepts** each one. Say: "The AI only proposes. Code checks every field and settles every bet. Resolution and payouts are never AI." Refresh the page; the new markets appear.

**5. Agents that verify and pay each other (75 s) - GoDaddy ANS.** Open `/ans`.
- Click **Real Data Agent asks to be paid** → five ✓ PASSED checks, "Market Maker paid 1 Hokie Buck", the ledger updates.
- Click **Impostor: lookalike domain** → ✗ REJECTED, "no `_ans` record on that domain", no payment.
- Click **Impostor: revoked agent** → ✗ REJECTED, "badge status is REVOKED".
- Say honestly: "The registry here is simulated until our agents are registered with GoDaddy. The checks are the ones from the ANS spec. Not done yet: the certificate check." (The page says this too.)

**6. Side Kick (40 s) - Cloudforce HokieAI.** Open `/sidekick` (no login). Type "the line at D2 is always huge", pick Dining, click **Make my market**. Show the question, odds, reason, **Copy**, and the link back to the app. Switch language to **Español** and do it again.

**7. Accessibility and inclusion (40 s) - Best Accessibility, Diversity + Inclusion.** Press **Tab** once: the *Skip to main content* link. Turn on **High contrast**. Switch to **한국어**. Say: "0 violations on the axe accessibility checker in every mode. Screen readers hear results announced."

**8. Close (30 s) - Ut Prosim, First Time Hack, Didn't Work.** "Play money only, built for VT students. This is our first hackathon. What didn't work: VT Rec Sports blocks bots, so gym numbers are still samples, and real ANS registration is next."

## If something goes wrong

| Problem | Fix |
| --- | --- |
| Page is empty | `.env.local` has a secret key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Put the publishable key there and restart `npm run dev`. |
| No markets | `npm run market-maker`. |
| "No occupancy data" | `npm run scrape` is not running. |
| `/ans` says Setup needed | Run `supabase/agents.sql` in the Supabase SQL Editor. |
| AI is down | In `.env.local` set `AI_PROVIDER=claude`, restart. |
