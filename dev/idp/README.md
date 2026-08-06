# dev/idp — a real IdP, locally

[docs/BLOCKERS.md](../../docs/BLOCKERS.md) §3 lists "prove Power BI RLS under
On-Behalf-Of" as **externally blocked** because it needs a real IdP, and the
Okta pilot is deferred to a PROD gate. `PROXY_AUTH_MODE=idp` is shipped and
fail-closed-tested; as of 2026-08-06 it has also been **exercised against an
actual token issuer** — see "Verify it" below for what was proven and how to
re-run it.

Keycloak is an actual token issuer. It signs real RS256 JWTs against a real
JWKS endpoint, so the proxy's verification path runs for real — issuer,
audience, signature, expiry, and the persona resolution that reads the claims.

## It ships nothing

This is the safest category of dependency: **out-of-process and dev-only.**

- No package enters `proxy/` or `playground/`. Their dependency trees are
  untouched, and the lean surface (3 and 8 runtime packages) stays lean.
- Nothing reaches a build artifact or a deployed container.
- Nothing runs in CI.
- Production is unaffected. The proxy verifies JWKS/issuer/audience
  generically — it knows nothing about Keycloak — so the org's Entra or Okta
  drops in by changing three environment variables.

Bound to `127.0.0.1` on purpose. Publishing an auth server on every interface
of a dev laptop is how a convenience becomes an incident.

## Run it

```powershell
docker compose -f dev/idp/docker-compose.yml up -d
```

No docker on the box? Same Keycloak release, bare metal:

```powershell
.\dev\idp\run-keycloak-nodocker.ps1
```

That script fetches the SAME pinned Keycloak 26.0.7 the compose file pins, plus
a pinned Eclipse Temurin 21 JRE to run it on (both SHA256-verified — the
Temurin pin cross-checked against Adoptium's published checksum, the Keycloak
pin recorded from the verified first fetch), caches them in the gitignored
`.runtime/`, and boots with the same realm import, loopback-only, same port.
Nothing is installed system-wide and nothing enters a dependency tree.

Admin console at <http://127.0.0.1:7010> (`admin` / `admin`). The realm imports
on first boot.

Point the proxy at it:

```powershell
$env:PORT = 7000
$env:PROXY_AUTH_MODE      = 'idp'
$env:PROXY_IDP_JWKS_URL   = 'http://127.0.0.1:7010/realms/pulseplay/protocol/openid-connect/certs'
$env:PROXY_IDP_ISSUER     = 'http://127.0.0.1:7010/realms/pulseplay'
$env:PROXY_IDP_AUDIENCE   = 'pulseplay-proxy'
node proxy/server.js
```

Mint a token and call something:

```powershell
$t = .\dev\idp\get-token.ps1 manager
curl -H "Authorization: Bearer $t" http://127.0.0.1:7000/assistant/capabilities

.\dev\idp\get-token.ps1 planner -Decode   # see the claims
```

## Verify it

```powershell
node dev/idp/verify-idp-live.mjs
```

With the IdP up, this spawns the proxy itself under `PROXY_AUTH_MODE=idp` and
proves the half of the auth story jest deliberately cannot reach
(`idpMiddleware` short-circuits under `NODE_ENV=test`, so unit tests cover
claim shapes and mode contracts, never signatures). Seven checks: both realm
mappers put roles and audience where the proxy reads them; an anonymous
request 401s; valid `manager` and `norole` tokens pass authentication; a
tampered signature 401s; and a second proxy spawn expecting a different
audience rejects the otherwise-valid token. First green run: 2026-08-06, 7/7,
against the no-docker boot.

## The three users

| User | Realm role | Resolves to | Proves |
|---|---|---|---|
| `planner` | `supply-chain-planner` | Supply Chain Planner | The proposer half of the HITL story |
| `manager` | `supply-chain-manager` | Supply Chain Manager | The approver half — separation of duties |
| `norole` | *(none)* | Supply Chain Planner | Least privilege: an authenticated user with no mapped role gets the **lower** capability set, not a default-open one |

`norole` is the one worth keeping. It is the negative test — the case where an
authorisation bug would look like a working login.

## Two Keycloak defaults that would silently break this

Both are fixed in `realm-pulseplay.json`, and both are the kind of thing that
looks configured until you decode a token:

**Roles land in the wrong place.** Keycloak puts realm roles under
`realm_access.roles`. `normalizeIdpUserClaims` ([server.js:1899](../../proxy/server.js#L1899))
reads a **top-level `roles`** claim, Entra-style. Without the
`oidc-usermodel-realm-role-mapper` in the realm, every user authenticates
successfully and arrives with no roles — resolving to Planner by the
least-privilege default, so a Manager would look like a permissions bug rather
than a mapper bug.

**The audience is wrong.** Keycloak's default `aud` is `account`. With
`PROXY_IDP_AUDIENCE=pulseplay-proxy` every token would be rejected until the
`oidc-audience-mapper` puts the client in `aud`.

## What this does and does not prove

**Does:** the proxy's IdP verification path against real signed tokens; issuer
and audience enforcement; rejection of unsigned, expired and wrong-audience
tokens; persona resolution from claims; that a browser-supplied identity is
ignored in favour of verified claims.

**Does not:** Power BI RLS end to end — that additionally needs a dataset with
RLS roles defined and a user mapped to one, which is a Power BI-side setup this
container cannot provide. Keycloak removes the "no IdP" half of that blocker,
not the "no RLS dataset" half.

**Also does not:** Databricks on-behalf-of-user identity. `AGENT-OBO` is about
agent steps running under the profile's service credential instead of the
caller's Unity Catalog grants, and no IdP fixes that — the route is Databricks
managed MCP with OBO auth (AGENDA `MCP-CONNECTOR`). Worth stating plainly,
because "we added an IdP" is exactly the kind of thing that gets mistaken for
having closed it.
