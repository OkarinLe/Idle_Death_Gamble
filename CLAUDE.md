@AGENTS.md

# Idle Death Gamble: project context

## What this is
A play-money prediction market for Virginia Tech (VT). The default view is live campus info (occupancy and wait times for dining halls and the library). A "Trading mode" switch in the top right turns on Yes/No markets on each place, for example "Will the D2 wait be over 20 minutes at noon?". Play money only ("Hokie Bucks"). Never add real money.

## Prizes we are targeting
- Deloitte x Databricks (Campus Life Intelligence Hub): AI agents running on Databricks that improve student life at VT.
- GoDaddy Best Use of ANS (Agent Name Service): agents with domain-anchored identity that discover, verify, and pay each other. We have a free GoDaddy domain. The demo must show a fake (impostor) agent being rejected on screen.
- Cloudforce HokieAI Side Kick: a tiny standalone page at /sidekick. 3 questions in, one personalized result out, no login, works without the main app. Idea: "Make my market". The user types something on their mind, and the AI returns a Yes/No market question with starting odds and a one-line reason. Mix of funny and serious tone. Include a copy/share button and a link to the main app.
- Also: Best Ut Prosim, Best Accessibility, Best Diversity + Inclusion, Best First Time Hack, Best Hack that Didn't Work.

## Stack
- Next.js 16 (App Router, TypeScript, Tailwind). Next.js 16 has breaking changes, so read the docs in `node_modules/next/dist/docs/` before writing Next.js code. Heed deprecation notices.
- Supabase (Postgres, auth, Row Level Security). Browser client is in `src/lib/supabase/client.ts`.
- AI: Databricks first (endpoint name `databricks-llama-4-maverick`, called over HTTPS at `DATABRICKS_HOST/serving-endpoints/<name>/invocations` with a Bearer token). Build a switch using the `AI_PROVIDER` setting (`databricks` or `claude`) so we can fall back to the Claude API. Keep the AI call in one server-side function.
- The team uses Windows and PowerShell. Give PowerShell commands, not bash.
- Run scripts with `npm run scrape`, `npm run resolve`, `npm run market-maker`, `npm run football-agent`, `npm run seed-places` (add `-- --dry-run` or `-- --minutes 10` to the last one). They load .env.local for you. `npm run market-maker` can also run with `AI_PROVIDER=claude` set in the shell to test the fallback.
- All AI calls go through `askAI()` in `src/lib/ai.ts` (server-side only). Use `parseAIJson()` then validate every field before using AI output.

## Environment variables (in .env.local, which is never committed)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_MODEL`, `ANTHROPIC_API_KEY`.
Never read out, print, paste, or commit any key. Do not open .env.local. The service role key is for server code and scripts only, never browser code.

## Database (Supabase, public schema, Row Level Security on)
Automatic table exposure is OFF, so every new table needs explicit GRANT statements and RLS policies.
- `profiles`: id, display_name, balance (starts at 1000). Signup is limited to @vt.edu emails by a database trigger.
- `places`: slug is one of d2, owens, west-end, newman-library.
- `readings`: place_id, metric, value, unit, source, recorded_at. Metrics are `occupancy_pct` and `wait_minutes`. source = "seed" means fake data. Scrapers and agents write here. The website reads the newest row per place through the view `place_latest`.
- `markets`: ticker, question, rules, place_id, metric, comparator (gt, gte, lt, lte), threshold, status, outcome, q_yes, q_no, liquidity_b, volume, closes_at, resolves_at, created_by.
- `positions`, `trades`, `market_price_history`.
- Functions: `buy_shares(p_market_id, p_side, p_shares)` can be called by signed-in users. `resolve_market(p_market_id)` and `cancel_market(p_market_id)` can only be called by service_role.
- Prices use LMSR (Logarithmic Market Scoring Rule). The client price math in `src/lib/lmsr.ts` must always match the SQL in `buy_shares`.
- When SQL needs to run in Supabase, give the SQL to paste into the Supabase SQL Editor. Do NOT re-run the original schema query, because it drops all tables.

## What is already done
VT-email login page, info-first home page with occupancy bars, the Trading mode toggle (dark theme, sign-in only required to buy), `buy_shares` plus a trade box on the home page, a scraper script (`scripts/scrape.mjs`, currently writes sample data every 5 minutes), and a resolver script (`scripts/resolve.mjs`, resolves due markets every minute). There is a BackLink component in `src/components/BackLink.tsx`.

## Rules
- Balances and payouts change only inside database functions, never from browser code.
- Resolution and payouts are plain deterministic code, never AI.
- AI is used only for the Market Maker Agent and the Side Kick. Validate all AI output as JSON before using it.
- Fake data stays labeled source = "seed" and shows as "Sample data" in the UI.
- Accessibility: Yes is blue with an up arrow, No is orange with a down arrow (never color alone), labeled form controls, keyboard usable, aria-live for status messages, contrast checked.
- Brand colors: VT maroon #861F41 and VT orange #E5751F.
- Do not guess how GoDaddy ANS works. Search GoDaddy's official docs first and summarize before writing any ANS code.
- Do not scrape any site until we confirm the source's terms allow it. Prefer official feeds.
- Keep code simple and commented. The team is students, so explain non-obvious choices in plain language. Spell out acronyms the first time you use them.
- Small changes, one task at a time. Do not rewrite files that already work.
- Never use git push --force.

## Tasks, in order
1. Portfolio page (/portfolio), leaderboard (/leaderboard), and a sell function.
2. Market Maker Agent: `scripts/market-maker.mjs` reads recent readings, asks the AI for 1 to 3 Yes/No market ideas as JSON (question, place slug, metric, comparator, threshold), validates them, and inserts them into markets with created_by set to the agent's name.
3. Data Agent: replace the sample data in `scripts/scrape.mjs` with a real source once we choose one. Keep it as one `getData()` function so it can move to Databricks.
4. ANS identities for the Data Agent and Market Maker Agent, the Market Maker verifying the Data Agent before trusting its data, agent-to-agent payments, and the impostor demo.
5. Side Kick page at /sidekick.
6. Accessibility pass (keyboard, high-contrast mode, screen reader labels), optional language toggle (Spanish, Korean) and dietary tags.
7. Deploy to a public link, README, demo script.

## Status update (tasks 1 to 7)
- Done: portfolio, leaderboard, sell (task 1); Market Maker with live-only data, gym head-count markets and a football win market (task 2); football Data Agent using the official hokiesports.com schedule (task 3, partly: dining, library and gyms are still Sample data); ANS verifier, agent accounts and payments, impostor demo at /ans (task 4, simulated registry); /sidekick (task 5); accessibility layer, high contrast, Spanish and Korean for home, login and Side Kick (task 6); README, DEMO.md, docs/ANS-SETUP.md, GitHub Actions (task 7).
- Needs a person: run supabase/agents.sql once; real GoDaddy ANS registration (docs/ANS-SETUP.md); Vercel deploy and GitHub Actions secrets (README); native-speaker review of Spanish and Korean text.
- Sources: VT Rec Sports forbids bots in robots.txt (do not scrape). hokiesports.com allows bots.
- ANS code: src/lib/ans.ts (verifier), src/lib/ans-resolvers.ts (demo and live lookups), src/app/api/ans/demo/route.ts, src/app/ans/page.tsx. Never claim the demo registry is real: the page must keep saying it is simulated until ANS_MODE=live.
- Translations live in src/lib/translations.ts. Every key must exist in en, es and ko (TypeScript enforces this).
- SQL files run order for a new project: supabase/schema.sql, functions.sql, agents.sql.
