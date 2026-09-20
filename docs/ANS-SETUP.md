# Moving the agents from the simulated ANS registry to real GoDaddy ANS

**Where we are:** the two agents use names like `ans://v1.0.0.data-agent.<your-domain>`. The verifier ([src/lib/ans.ts](../src/lib/ans.ts)) runs the real checks from the ANS specification, but against a built-in **simulated registry** (`ANS_MODE=demo`), and the `/ans` page says so on screen.

**Sources:** GoDaddy's open spec at <https://github.com/godaddy/ans-registry> (files `spec/ans-2-versioned-naming.md`, `ans-3-dns-publication.md`, `ans-6-agent-authentication.md`). GoDaddy's developer page <https://www.godaddy.com/ans/developers> and the API-key page <https://www.AgentNameRegistry.org> blocked automated reading, so **a person must read those two pages** and follow GoDaddy's registration guide. We have not guessed at their API.

## What "real" means (from the spec)

An agent name is `ans://v<major>.<minor>.<patch>.<agent-host>`, for example `ans://v1.0.0.data-agent.yourdomain.com`.
Registering an agent makes GoDaddy's registry publish two DNS records on your domain and seal a badge in a public Transparency Log:

```
_ans.data-agent.yourdomain.com        TXT  "v=ans1; version=v1.0.0; p=a2a; mode=direct; url=https://data-agent.yourdomain.com/a2a"
_ans-badge.data-agent.yourdomain.com  TXT  "v=ans-badge1; version=v1.0.0; url=https://<transparency-log-host>/v1/agents/<agent-id>"
```

Our verifier looks those up, then fetches the badge and requires `status: ACTIVE` for exactly that name.

## Steps

1. **Pick two hostnames** under the free GoDaddy domain: `data-agent.<domain>` and `market-maker.<domain>`.
2. **Get an ANS API key** (AgentNameRegistry.org / GoDaddy developer portal).
3. **Register both agents** using GoDaddy's registration guide. Each needs: version `1.0.0`, and an endpoint URL **on its own host** (the spec requires it), for example `https://data-agent.<domain>/a2a`. Finish their domain-ownership steps (the spec describes `verify-acme` and `verify-dns`).
4. **Check the DNS records exist** (Windows PowerShell): `nslookup -type=TXT _ans.data-agent.<domain>` and `nslookup -type=TXT _ans-badge.data-agent.<domain>`.
5. **Find the Transparency Log host**: it is the host inside the `url=` of the `_ans-badge` record.
6. **Set these** in `.env.local` (and in Vercel, and the GitHub Actions variables):
   ```
   ANS_MODE=live
   ANS_DOMAIN=<your domain, no https://>
   ANS_TRUSTED_LOG_HOSTS=<transparency log host from step 5>
   ```
   `ANS_TRUSTED_LOG_HOSTS` is a safety list: the badge address comes from a DNS record someone else could control, so live mode only contacts hosts on this list (and refuses if the list is empty).
7. **Test:** `npm run market-maker -- --dry-run` should print `ANS PASSED` for all five checks. Then open `/ans`: the real agent passes, both impostors are rejected.

## What our check does NOT prove yet (also shown on the `/ans` page)

- That the caller **holds the agent's certificate** (mTLS identity certificate). Without it, anyone can *claim* a name; the registry records only show the name is real. This is the biggest gap.
- The TLSA/DANE certificate fingerprint check.
- The Transparency Log's signature and Merkle inclusion proof.

Payments between agents are **our own play-money design** (`supabase/agents.sql`). ANS defines identity only, not payments.
