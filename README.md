# Idle Death Gamble

A **play-money prediction market for Virginia Tech.** The home page shows live campus info (how full the dining halls, library and gyms are, and Hokies football). Flip **Trading mode** on to bet Hokie Bucks (play money, never real money) on Yes/No questions like *"Will D2 be at least 80% full at 12:17 AM?"* or *"Will Virginia Tech beat Boston College?"*

AI agents create the markets, check each other's identity, and pay each other. Plain code (never AI) settles every bet.

## What is in the project

| Piece | Where | What it does |
| --- | --- | --- |
| Website | `src/app/` | Home (live info + trading), `/portfolio`, `/leaderboard`, `/login` |
| **Side Kick** | `/sidekick` | Type something on your mind, get a Yes/No market with odds. No login. Copy/share button. |
| **Agent identity demo** | `/ans` | The Market Maker only pays a Data Agent that passes an ANS identity check. Impostors are rejected on screen. |
| Market Maker Agent | `scripts/market-maker.mjs` | Reads live numbers, asks the AI for market ideas, checks every field, saves the good ones |
| Data agents | `scripts/scrape.mjs`, `scripts/football-agent.mjs` | Save readings. Football is real (official schedule); the rest is labeled "Sample data" |
| Resolver | `scripts/resolve.mjs` | Settles ended markets with plain rules and pays winners |
| AI function | `src/lib/ai.ts` | The **one** place that calls an AI. Databricks first, Claude as a backup (`AI_PROVIDER`) |
| ANS verifier | `src/lib/ans.ts` | Checks an agent's name the way GoDaddy's ANS spec says |
| Database | `supabase/*.sql` | Tables, prices, buy/sell/payout functions, permissions |

## Rules we follow

- Play money only. Balances and payouts change **only inside database functions** (`supabase/*.sql`), never from browser code.
- Resolution and payouts are plain deterministic code. **AI is used only** for the Market Maker and the Side Kick, and every AI answer is validated before use.
- Fake data is stored with `source = "seed"` and shown as **Sample data**.
- Accessibility: Yes is blue with ▲, No is orange with ▼ (never color alone), labeled form controls, keyboard use, screen-reader announcements, high-contrast mode, Spanish and Korean.
- Secrets live in `.env.local` (never committed). The service-role key is server-only.

## Run it on your computer

You need **Node 20.6 or newer** (`node --version`).

```bash
npm install
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
# open .env.local and fill in the values (ask a teammate; never paste keys in chat or commits)
npm run dev                    # website at http://localhost:3000
```

Then, each in its **own terminal**, to make things happen:

```bash
npm run scrape            # sample numbers every 5 minutes
npm run football-agent    # real football schedule
npm run resolve           # settles ended markets every minute
npm run market-maker      # one-time: AI creates markets   (add: -- --dry-run   or   -- --minutes 10)
```

Sign up on the site with an `@vt.edu` email. Turn on **Trading mode**, pick Yes or No, and buy.

### Setting up a new Supabase project (only if you do not use our shared one)

In the Supabase **SQL Editor**, paste and run these files **in order**: `supabase/schema.sql`, `supabase/functions.sql`, `supabase/agents.sql`. They are safe to run again and never drop tables. Then `npm run seed-places`.

> **Warning:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be the *publishable* key (`sb_publishable_...`) or the anon key. A secret key there makes the browser show "forbidden use of secret key".

## Deploy (public link)

**Website (Vercel):** import the GitHub repo at vercel.com, and add these Environment Variables, then Deploy:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_MODEL`, `ANTHROPIC_API_KEY`, and `ANS_MODE` / `ANS_DOMAIN`.

**Agents that keep running without a laptop (GitHub Actions):** in the GitHub repo go to **Settings > Secrets and variables > Actions**.
- **Secrets:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`, `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_MODEL`, `ANTHROPIC_API_KEY`
- **Variables:** `ANS_MODE`, `ANS_DOMAIN`, `ANS_TRUSTED_LOG_HOSTS`

`.github/workflows/agents.yml` then runs the data agents and resolver every 5 minutes, and `market-maker.yml` runs the Market Maker every hour. Use **Actions > Run workflow** to run one by hand.

## Real data sources (and why some are still sample data)

| Data | Source | Status |
| --- | --- | --- |
| Football schedule and final scores | Official `hokiesports.com` schedule (its `robots.txt` allows bots; we fetch one page, hourly, every 5 min around game time) | **Real** |
| Dining, library | No public live feed exists | Sample data |
| Gym head counts | VT Rec Sports' page forbids bots in its `robots.txt` | Sample data, until Rec Sports gives permission |

## ANS (Agent Name Service)

Built from GoDaddy's open ANS specification. The verifier checks the agent's name format, the `_ans` and `_ans-badge` DNS records, and that its Transparency Log badge says ACTIVE for exactly that name. It runs on a **simulated registry** until the agents are registered with GoDaddy. See [docs/ANS-SETUP.md](docs/ANS-SETUP.md).

## Not done yet (honest list)

- Real ANS registration with GoDaddy, and the certificate (mTLS) check. Needs a GoDaddy ANS API key and our domain.
- Agents do not run *on* Databricks yet. They call a Databricks model from Node.
- Dietary tags (no menu data source is cleared for use).
- Real dining, library and gym numbers.
- Spanish and Korean text was written by an AI and needs a native speaker's review. Only the home page, login and Side Kick are translated.

## Tests we ran

Every SQL file was tested on a scratch Postgres (fresh build, re-run, permissions). The ANS verifier was tested against real and impostor agents. All pages pass the axe accessibility checker (0 violations) in normal, Trading, high-contrast, Spanish and Korean modes.
