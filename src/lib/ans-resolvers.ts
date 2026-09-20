// Where the ANS verifier (ans.ts) looks things up, plus our agents' names.
// SERVER-SIDE ONLY (uses node:dns). Also runs in plain Node scripts.
//
// ANS_MODE=demo (default): a built-in SIMULATED registry, so the demo works offline.
// ANS_MODE=live          : real DNS lookups + the real Transparency Log badge over HTTPS.
//   Only badge hosts listed in ANS_TRUSTED_LOG_HOSTS (comma separated) are fetched, because the
//   badge URL comes from a DNS record an attacker could control. With no list, live mode refuses.
import { resolveTxt } from "node:dns/promises";
import type { AnsResolver } from "./ans";

// Our real domain goes in .env.local as ANS_DOMAIN once agents are registered with GoDaddy.
export function ansConfig() {
  return {
    mode: process.env.ANS_MODE === "live" ? ("live" as const) : ("demo" as const),
    domain: (process.env.ANS_DOMAIN || "hokie-agents.example.com").trim().toLowerCase(),
  };
}

export function agentNames(domain: string) {
  return {
    dataAgent: `ans://v1.0.0.data-agent.${domain}`,
    marketMaker: `ans://v1.0.0.market-maker.${domain}`,
  };
}

// The impostors used in the demo. Neither one is registered anywhere real.
export function impostorNames(domain: string) {
  return {
    // Looks right at a glance, but the domain is not ours. It has no ANS records.
    lookalike: "ans://v1.0.0.data-agent.hokie-agents-secure.example.com",
    // A real name on our domain whose registration was revoked.
    revoked: `ans://v0.9.0.data-agent-old.${domain}`,
  };
}

// ---------- simulated registry ----------
export function createDemoResolver(domain: string): AnsResolver {
  const dns: Record<string, string[]> = {};
  const badges: Record<string, unknown> = {};

  // Publishes what a real registration would: two TXT records and one badge.
  function register(host: string, version: string, status: string) {
    const url = `https://transparency.demo.example/v1/agents/demo-${host}`;
    dns[`_ans.${host}`] = [`v=ans1; version=v${version}; p=a2a; mode=direct; url=https://${host}/a2a`];
    dns[`_ans-badge.${host}`] = [`v=ans-badge1; version=v${version}; url=${url}`];
    badges[url] = {
      schemaVersion: "V2",
      status,
      payload: { producer: { event: { ansName: `ans://v${version}.${host}`, agent: { host, version } } } },
    };
  }
  register(`data-agent.${domain}`, "1.0.0", "ACTIVE");
  register(`market-maker.${domain}`, "1.0.0", "ACTIVE");
  register(`data-agent-old.${domain}`, "0.9.0", "REVOKED");

  return {
    txt: async (name) => dns[name.toLowerCase()] ?? [],
    badge: async (url) => badges[url] ?? null,
  };
}

// ---------- real DNS + real Transparency Log ----------
export function createLiveResolver(trustedLogHosts: string[]): AnsResolver {
  return {
    txt: async (name) => {
      try {
        return (await resolveTxt(name)).map((chunks) => chunks.join(""));
      } catch {
        return []; // no such record
      }
    },
    badge: async (url) => {
      const u = new URL(url);
      if (u.protocol !== "https:" || !trustedLogHosts.includes(u.hostname.toLowerCase())) {
        throw new Error(`Badge host "${u.hostname}" is not in ANS_TRUSTED_LOG_HOSTS, so it was not contacted`);
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      return res.ok ? await res.json() : null;
    },
  };
}

export function getResolver(): AnsResolver {
  const { mode, domain } = ansConfig();
  if (mode === "demo") return createDemoResolver(domain);
  const trusted = (process.env.ANS_TRUSTED_LOG_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return createLiveResolver(trusted);
}
