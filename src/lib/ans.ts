// ANS = Agent Name Service. GoDaddy's open standard that ties an AI agent's identity to a
// domain name. Spec: https://github.com/godaddy/ans-registry (ANS-2 naming, ANS-3 DNS, ANS-6 auth).
//
// This file is the VERIFIER: given the name an agent claims, it checks the public records
// the spec says a real, registered agent must have. It has no imports, so both the website
// server code and plain Node scripts can use it.
//
// What it checks (from the spec):
//   1. The name has the ANS format:            ans://v1.0.0.data-agent.example.com
//   2. DNS  _ans.<host>        TXT record exists, its version matches, and its url is on the same host
//   3. DNS  _ans-badge.<host>  TXT record exists, its version matches, and it points to a badge
//   4. The Transparency Log badge says status ACTIVE for exactly this name and host
// A lookalike domain has no records (fails 2). A revoked agent has a REVOKED badge (fails 4).

export type Check = { name: string; ok: boolean; detail: string };
export type Verification = { ansName: string; verified: boolean; checks: Check[]; notChecked: string[] };

// How the verifier looks things up. Two versions exist in ans-resolvers.ts:
// a simulated registry (demo) and real DNS + real Transparency Log (live).
export type AnsResolver = {
  txt(name: string): Promise<string[]>; // DNS TXT records for a name (empty list if none)
  badge(url: string): Promise<unknown>; // the badge JSON, or null if not found
};

// Being honest about limits: a full ANS check also proves the caller HOLDS the agent's certificate.
// We do not do that yet, so the screen says so.
export const NOT_CHECKED = [
  "Certificate possession (mTLS identity certificate)",
  "TLSA / DANE certificate fingerprint",
  "Transparency Log signature and Merkle proof",
];

// ANS-2: ans://v<major>.<minor>.<patch>.<host>, host = fully qualified domain name (RFC 1123).
const NAME_RE =
  /^ans:\/\/v(\d+)\.(\d+)\.(\d+)\.((?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

export function parseAnsName(name: string): { version: string; host: string } | null {
  const m = NAME_RE.exec(name.trim());
  if (!m) return null;
  return { version: `${m[1]}.${m[2]}.${m[3]}`, host: m[4].toLowerCase() };
}

// "v=ans1; version=v1.0.0; url=https://..."  ->  { v: "ans1", version: "v1.0.0", url: "https://..." }
function parseTxt(record: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of record.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const TOTAL_CHECKS = 5; // name, _ans record, endpoint host, _ans-badge record, badge

export async function verifyAgent(ansName: string, resolver: AnsResolver): Promise<Verification> {
  const checks: Check[] = [];
  const done = (): Verification => ({
    ansName,
    verified: checks.length === TOTAL_CHECKS && checks.every((c) => c.ok), // stopping early means unverified
    checks,
    notChecked: NOT_CHECKED,
  });
  // Record a check. Returns ok so the caller can stop at the first failure.
  const add = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    return ok;
  };

  // 1. Name format
  const parsed = parseAnsName(ansName);
  if (!add("Name format", !!parsed, parsed ? `Version ${parsed.version} on host ${parsed.host}` : "Not a valid ans://v1.0.0.host name")) return done();
  const { version, host } = parsed!;

  try {
    // 2. _ans TXT record (discovery)
    const ansRecords = (await resolver.txt(`_ans.${host}`)).map(parseTxt);
    const ans = ansRecords.find((r) => r.v === "ans1" && r.version === `v${version}`);
    if (!add("DNS record _ans", !!ans, ans ? `Found ${ans.version}, url ${ans.url}` : `No _ans.${host} TXT record for version v${version}`)) return done();
    let urlHost = "";
    try { urlHost = new URL(ans!.url).hostname.toLowerCase(); } catch { /* handled below */ }
    if (!add("Endpoint is on the agent's own host", urlHost === host, `Endpoint host "${urlHost || "missing"}" vs agent host "${host}"`)) return done();

    // 3. _ans-badge TXT record (points at the Transparency Log)
    const badgeRecords = (await resolver.txt(`_ans-badge.${host}`)).map(parseTxt);
    const pointer = badgeRecords.find((r) => r.v === "ans-badge1" && r.version === `v${version}` && r.url);
    if (!add("DNS record _ans-badge", !!pointer, pointer ? "Found a badge pointer" : `No _ans-badge.${host} TXT record for version v${version}`)) return done();

    // 4. The badge itself: must be ACTIVE and describe exactly this agent
    const badge = (await resolver.badge(pointer!.url)) as {
      status?: string;
      payload?: { producer?: { event?: { ansName?: string; agent?: { host?: string } } } };
    } | null;
    const event = badge?.payload?.producer?.event;
    const problem = !badge
      ? "Badge not found"
      : badge.status !== "ACTIVE"
        ? `Badge status is ${badge.status}, not ACTIVE`
        : event?.ansName?.toLowerCase() !== ansName.trim().toLowerCase() || event?.agent?.host?.toLowerCase() !== host
          ? "Badge belongs to a different agent name or host"
          : "";
    add("Transparency Log badge", !problem, problem || "Status ACTIVE and it names exactly this agent");
  } catch (e) {
    add("Lookup", false, e instanceof Error ? e.message : "Lookup failed");
  }
  return done();
}
