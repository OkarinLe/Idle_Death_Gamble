"use client";

// Demo of ANS (Agent Name Service): the Market Maker only pays a Data Agent whose identity checks out.
// An impostor claiming to be the Data Agent is rejected on screen, and no money moves.
import { useEffect, useState } from "react";
import BackLink from "@/components/BackLink";

type Check = { name: string; ok: boolean; detail: string };
type Verification = { ansName: string; verified: boolean; checks: Check[]; notChecked: string[] };
type State = {
  setupNeeded: boolean;
  mode: "demo" | "live";
  domain: string;
  names: { dataAgent: string; marketMaker: string };
  accounts: { ans_name: string; balance: number }[];
  payments: { id: number; from_name: string; to_name: string; amount: number; memo: string; created_at: string }[];
};
type Result = { verification: Verification; paid: number | null; paymentError?: string };

const SCENARIOS = [
  { id: "real", label: "Real Data Agent asks to be paid" },
  { id: "lookalike", label: "Impostor: lookalike domain" },
  { id: "revoked", label: "Impostor: revoked agent" },
];

export default function AnsDemoPage() {
  const [state, setState] = useState<State | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Load balances and the ledger when the page opens.
  useEffect(() => {
    fetch("/api/ans/demo").then((r) => r.json()).then(setState);
  }, []);

  async function run(scenario: string) {
    setBusy(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/ans/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.state) setState(data.state);
    if (!res.ok) return setError(data.error ?? "Something went wrong.");
    setResult(data as Result);
  }

  // "ans://v1.0.0.data-agent.example.com" -> "data-agent"
  const shortName = (name: string) => name.replace(/^ans:\/\/v\d+\.\d+\.\d+\./, "").split(".")[0];
  const balanceOf = (name: string) => state?.accounts.find((a) => a.ans_name === name)?.balance;
  const money = (n: number | undefined) => (n === undefined ? "..." : `${Number(n).toFixed(2)} Hokie Bucks`);

  return (
    <main id="main" className="mx-auto min-h-screen max-w-3xl space-y-5 p-6">
      <BackLink href="/" label="Back to campus info" />
      <h1 className="text-3xl font-bold" style={{ color: "#861F41" }}>Agent identity demo</h1>
      <p className="text-gray-800">
        Our two AI agents pay each other in Hokie Bucks (play money). Before the Market Maker pays anyone,
        it checks who they really are with <strong>ANS</strong> (Agent Name Service, GoDaddy&apos;s open standard that
        ties an agent&apos;s name to a domain). An impostor is rejected and gets nothing.
      </p>

      {state?.mode === "demo" && (
        <p role="note" className="rounded border-2 border-gray-700 bg-gray-100 p-3 text-sm text-gray-900">
          <strong>Simulated registry.</strong> These agents are not registered with GoDaddy yet, so the DNS and
          Transparency Log lookups run against a built-in demo registry. The checks are the ones from the ANS
          specification. Switching to real registration only needs a GoDaddy ANS account and our domain.
        </p>
      )}

      {state?.setupNeeded && (
        <p role="alert" className="rounded border-2 p-3 text-sm" style={{ borderColor: "#B34700" }}>
          Setup needed: run <code>supabase/agents.sql</code> once in the Supabase SQL Editor, then reload this page.
        </p>
      )}

      {state && !state.setupNeeded && (
        <>
          <section aria-label="The two agents" className="grid gap-3 sm:grid-cols-2">
            {[
              ["Data Agent", state.names.dataAgent],
              ["Market Maker Agent", state.names.marketMaker],
            ].map(([title, name]) => (
              <div key={name} className="rounded-lg border border-gray-400 p-3">
                <h2 className="font-semibold">{title}</h2>
                <p className="break-all text-xs text-gray-700">{name}</p>
                <p className="mt-1 text-sm">Balance: <strong>{money(balanceOf(name))}</strong></p>
              </div>
            ))}
          </section>

          <section aria-label="Try it">
            <h2 className="text-lg font-semibold">Who is asking to be paid?</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => run(s.id)}
                  disabled={busy}
                  className="rounded px-3 py-2 font-semibold text-white transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                  style={{ backgroundColor: s.id === "real" ? "#861F41" : "#7a3300" }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          {/* aria-live: screen readers announce the verdict when it appears */}
          <div role="status" aria-live="polite" className="min-h-6">
            {busy && <p>Checking identity...</p>}
            {error && <p className="font-semibold" style={{ color: "#A4001F" }}>{error}</p>}
            {result && (
              <section
                className="animate-fade-up space-y-3 rounded-lg border-2 p-4"
                style={{ borderColor: result.verification.verified ? "#0F6B3A" : "#A4001F" }}
              >
                <h2 className="text-xl font-bold" style={{ color: result.verification.verified ? "#0F6B3A" : "#A4001F" }}>
                  {result.verification.verified ? "✓ VERIFIED" : "✗ REJECTED"}
                  {result.verification.verified
                    ? result.paid ? `: Market Maker paid ${result.paid} Hokie Buck` : ": identity passed, but the payment failed"
                    : ": no payment was made"}
                </h2>
                <p className="break-all text-sm">Claimed identity: <code>{result.verification.ansName}</code></p>
                {result.paymentError && <p className="text-sm">Payment error: {result.paymentError}</p>}

                <ol className="space-y-1 text-sm">
                  {result.verification.checks.map((c, i) => (
                    <li key={c.name} className="animate-fade-up" style={{ animationDelay: `${i * 150}ms` }}>
                      <strong>{c.ok ? "✓ PASSED" : "✗ FAILED"}</strong> · {c.name}: {c.detail}
                    </li>
                  ))}
                </ol>
                {!result.verification.verified && (
                  <p className="text-sm">The checks stop at the first failure, so nothing later was trusted.</p>
                )}

                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Not checked yet</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {result.verification.notChecked.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
              </section>
            )}
          </div>

          <section aria-label="Payment ledger">
            <h2 className="text-lg font-semibold">Payment ledger</h2>
            {state.payments.length === 0 ? (
              <p className="text-sm text-gray-700">No payments yet. Try the real Data Agent above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Most recent agent-to-agent payments</caption>
                  <thead>
                    <tr className="border-b-2 border-gray-500">
                      <th scope="col" className="p-2">Time</th>
                      <th scope="col" className="p-2">From</th>
                      <th scope="col" className="p-2">To</th>
                      <th scope="col" className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-300">
                        <td className="p-2">{new Date(p.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</td>
                        <td className="p-2">{shortName(p.from_name)}</td>
                        <td className="p-2">{shortName(p.to_name)}</td>
                        <td className="p-2 text-right">{Number(p.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
