// ANS demo route: a Data Agent asks the Market Maker to pay it for data.
// The Market Maker checks the asker's identity FIRST (ANS verification). Only a verified
// agent gets paid. GET returns the current balances and payment ledger.
import { verifyAgent } from "@/lib/ans";
import { agentNames, ansConfig, getResolver, impostorNames } from "@/lib/ans-resolvers";
import { createAdminClient } from "@/lib/supabase/admin";

const PRICE = 1; // Hokie Bucks per data delivery

// Simple limit so the public demo button cannot be spammed: 12 requests a minute per visitor.
const recent = new Map<string, number[]>();
function tooManyRequests(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > 12;
}

// Make sure both real agents have an account (does nothing if they already do).
async function ensureAccounts(db: ReturnType<typeof createAdminClient>) {
  const { marketMaker, dataAgent } = agentNames(ansConfig().domain);
  return db.from("agent_accounts").upsert(
    [{ ans_name: marketMaker, balance: 500 }, { ans_name: dataAgent, balance: 100 }],
    { onConflict: "ans_name", ignoreDuplicates: true }
  );
}

async function readState(db: ReturnType<typeof createAdminClient>) {
  const { mode, domain } = ansConfig();
  const names = agentNames(domain);
  const { error } = await ensureAccounts(db);
  if (error) return { setupNeeded: true, mode, domain, names, accounts: [], payments: [] };
  const [accounts, payments] = await Promise.all([
    db.from("agent_accounts").select("ans_name, balance").order("ans_name"),
    db.from("agent_payments").select("id, from_name, to_name, amount, memo, created_at").order("id", { ascending: false }).limit(8),
  ]);
  return { setupNeeded: false, mode, domain, names, accounts: accounts.data ?? [], payments: payments.data ?? [] };
}

export async function GET() {
  return Response.json(await readState(createAdminClient()));
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (tooManyRequests(ip)) return Response.json({ error: "Slow down a little." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const { domain } = ansConfig();
  const claimed = {
    real: agentNames(domain).dataAgent,
    lookalike: impostorNames(domain).lookalike,
    revoked: impostorNames(domain).revoked,
  }[body?.scenario as string];
  if (!claimed) return Response.json({ error: "Unknown scenario." }, { status: 400 });

  const db = createAdminClient();
  const state = await readState(db);
  if (state.setupNeeded) return Response.json({ state, error: "Run supabase/agents.sql in the Supabase SQL Editor first." }, { status: 503 });

  // 1. Verify the identity the asker claims. No verification, no payment.
  const verification = await verifyAgent(claimed, getResolver());

  // 2. Pay only if it passed. The database function does the actual money move.
  let paid: number | null = null;
  let paymentError: string | undefined;
  if (verification.verified) {
    const { error } = await db.rpc("agent_pay", {
      p_from: agentNames(domain).marketMaker,
      p_to: claimed,
      p_amount: PRICE,
      p_memo: "Paid for a data delivery after ANS check passed",
    });
    if (error) paymentError = error.message;
    else paid = PRICE;
  }

  return Response.json({ verification, paid, paymentError, state: await readState(db) });
}
