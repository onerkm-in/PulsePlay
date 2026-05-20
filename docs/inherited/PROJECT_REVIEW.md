# PulsePlay Project Review

Reviewed on 2026-05-10 from the local repository state.

## Executive Read

PulsePlay has a strong product idea and a sensible technical spine: separate the BI surface from the AI connector layer so any BI tool can pair with any AI backend. The project is currently best understood as a scaffold plus inherited proxy platform, not as an end-to-end multi-BI product yet.

The biggest hit is the architecture: the `BIAdapter` contract, lazy adapter registry, proxy profile model, and roadmap all point in the same direction. The biggest miss is that the shipped implementation has not yet crossed the line from "host any iframe and submit a prompt" into "understand a BI report and answer against live user context."

## What Hits

### 1. Clear two-axis product model

The README and `docs/MULTI_BI_ARCHITECTURE.md` explain the project cleanly:

- Y-axis: BI vendor being viewed.
- X-axis: AI connector doing the reasoning.
- Any vendor should work with any connector.

That is a strong abstraction. It avoids hard-coding Power BI assumptions into the assistant and gives the project a route to become a true cross-BI workspace.

### 2. Good adapter boundary

`playground/src/biPanel/BIAdapter.ts` is a solid contract. It captures lifecycle, canonical events, canonical commands, and capabilities without leaking vendor SDK details into the host app.

This is the right primitive for future work like AI-guided tours, cross-vendor state capture, and capability-aware UI.

### 3. Lazy vendor loading is the right instinct

`playground/src/biPanel/registry.ts` dynamically imports adapters. That keeps the core app vendor-neutral and prevents every deployment from shipping every BI SDK.

### 4. Proxy is feature-rich

The inherited `proxy/` app already has a broad backend surface:

- Databricks Genie profile routing.
- Supervisor modes.
- Azure OpenAI, Bedrock, and foundation model routes.
- SQL preview/explain support.
- Validation, audit, rate limiting, shared-key gates, and tests.

That gives PulsePlay a much better backend base than a normal greenfield demo would have.

### 5. Roadmap is candid

`docs/ROADMAP.md` is refreshingly honest about what is stubbed. It identifies the real unlocking steps: wire one vendor deeply, bring the AI sidebar to parity, then add streaming and multi-vendor views.

### 6. Generic iframe path is useful

The generic iframe adapter gives the project a working escape hatch. It is limited, but useful for demos, validation, and embedding tools before full SDK work begins.

## What Misses

### 1. Vendor adapters are mostly stubs

Power BI, Tableau, Qlik, and Looker currently inherit the generic iframe adapter. That means PulsePlay can display an embed URL, but cannot yet reliably observe page changes, filters, selections, data refreshes, or issue BI commands.

This is the central product gap because the AI assistant needs structured context to be meaningfully "aware" of what the user is looking at.

### 2. AI sidebar does not complete the answer loop

`AISidebar` posts to `/assistant/conversations/start`, then displays only the immediate response content or a placeholder. It does not poll `/assistant/conversations/:conversationId/messages/:messageId`, stream tokens, render source/provenance, or manage conversation reuse.

In practice, this means the UI can submit work, but it is not yet a full assistant experience.

### 3. Playground has no tests yet

The README says playground tests are not written. Given the app's purpose, the first useful tests should cover:

- Adapter mount/destroy behavior.
- Event bridging into `recentEvents`.
- Connector profile loading.
- Sidebar request payload construction.
- Error states when proxy or iframe loading fails.

### 4. Fresh checkout verification is incomplete

I tried the existing commands:

- `proxy`: `npm.cmd test` failed because `jest` was not installed locally.
- `playground`: `npm.cmd run build` failed because `tsc` was not installed locally.

This may simply mean dependencies have not been installed on this machine, but from a project-readiness perspective it means the current checkout is not immediately verifiable without a dependency install step.

### 5. Documentation drift is substantial

Several docs still carry inherited PepPulse, UniBridge, and Power BI custom visual language. Examples:

- `docs/ARCHITECTURE.md` is titled "PepPulse" and still frames the product around a `.pbiviz`.
- `docs/SECURITY_REVIEW.md` is titled "Security Review - PepPulse".
- `docs/API_AUTH_AND_LIMITATIONS.md` describes visual-to-proxy behavior and Power BI sandbox constraints that do not fully apply to PulsePlay's browser-hosted playground.
- `databricks-agents/supervisor/README.md` still names the agent "PulsePlay Supervisor Agent".

The inherited material is valuable, but it should be clearly labeled as inherited backend/proxy documentation or rewritten for PulsePlay.

### 6. Security posture is not yet PulsePlay-specific

The multi-BI browser host adds risks that are different from a Power BI custom visual:

- Cross-origin iframe embedding.
- CSP and `frame-src` policy.
- Per-vendor token issuance.
- Clickjacking and frame sandbox tuning.
- User-supplied embed URLs.
- Event data passing from BI SDKs into AI prompts.

`docs/MULTI_BI_ARCHITECTURE.md` mentions some of this, but the formal security review still mostly reflects the previous product.

### 7. Configuration UX is still too thin

`EmbedConfigForm` is a single URL field for every vendor. That is acceptable for v0, but real adoption will require per-vendor setup flows:

- Power BI: workspace ID, report ID, dataset ID, embed token/RLS role.
- Tableau: server/site/workbook/view or connected app settings.
- Qlik: tenant, app ID, sheet ID, OAuth/web integration details.
- Looker: signed embed URL parameters and user attributes.

### 8. No production deployment story for the playground

There is a dev proxy in Vite, but no clear production pattern for `VITE_API_BASE_URL`, hosted CSP headers, static hosting, auth, environment variables, or reverse proxy deployment.

### 9. Project naming is not fully settled

The repo says PulsePlay, the proxy package says `unibridge-ai-proxy`, docs say PepPulse, and inherited scripts reference the sister project. That makes orientation harder for humans and LLM collaborators.

## Highest-Impact Suggestions

### 1. Make Power BI the first real adapter

Do one vendor deeply before spreading effort across five shallow adapters.

Recommended scope:

- Add `powerbi-client` to the Power BI adapter package.
- Implement real `mount()` using the SDK.
- Emit `loaded`, `page-changed`, `filter-applied`, `selection-made`, and `error`.
- Implement `refresh`, `navigate-to-page`, and `apply-filter`.
- Add `/powerbi/embed-token` or `/vendor/powerbi/embed-token` in the proxy.

Success criterion: ask the assistant "what page am I on?" and have it answer from real adapter state, not from user prompt text.

### 2. Finish the AI answer lifecycle

Bring `AISidebar` to a complete non-streaming loop before adding fancy features:

- Start conversation.
- Poll message status.
- Render completed answer.
- Show failed/cancelled states.
- Preserve a conversation ID per session/profile.
- Include structured BI context separately from the user question if the backend can accept metadata.

After that, add SSE streaming.

### 3. Add a small playground test suite

Start with Vitest + React Testing Library or the repo's preferred lightweight equivalent.

Suggested first tests:

- `ConnectorPicker` loads profiles and selects the first profile.
- `AISidebar` sends active vendor, active connector, and recent event context.
- `BIPanel` mounts an adapter and calls `destroy()` on unmount.
- Generic iframe adapter rejects missing URL and emits `loaded`.

### 4. Create a PulsePlay-specific security review

Keep the inherited review as proxy history, but add a new PulsePlay security doc focused on:

- Embed URL allowlisting.
- CSP and frame policies.
- Sandbox defaults per vendor.
- Prompt-injection risk from BI metadata and event payloads.
- Token issuance endpoints.
- Browser-host deployment.
- Local dev versus internal enterprise deployment.

### 5. Split inherited docs from active docs

Recommended doc structure:

- `docs/PULSEPLAY_ARCHITECTURE.md`: current product truth.
- `docs/PULSEPLAY_SECURITY.md`: current security truth.
- `docs/INHERITED_PROXY_NOTES.md`: what came from UniBridge/PepPulse.
- `docs/ROADMAP.md`: keep, but connect each version to implementation criteria.

This will reduce confusion fast.

### 6. Add a root-level verification script

The repo has multiple packages. Add a root script or documented command that runs the whole local confidence check:

```powershell
cd proxy
npm install
npm test

cd ../playground
npm install
npm run build
npm test
```

Longer term, make it a root `scripts/release-check.ps1` path that checks both projects consistently.

### 7. Decide the production host model

Before adding advanced features, document the intended deployed shape:

- Static Vite app plus Node proxy behind the same origin.
- Vite app on static hosting with API base URL to proxy.
- Databricks App-hosted deployment.
- Internal-only app behind SSO.

The right answer affects CORS, CSP, cookie/header auth, and token issuance.

## Suggested Next 30 Days

### Week 1: Stabilize the project truth

- Rename or label inherited docs.
- Add `docs/PULSEPLAY_SECURITY.md`.
- Add dependency/install verification instructions.
- Confirm fresh install and build on a clean machine.

### Week 2: Power BI adapter vertical slice

- Implement real Power BI SDK embed.
- Add proxy endpoint for embed token.
- Capture page/filter events into `recentEvents`.
- Add tests around the adapter boundary.

### Week 3: Assistant answer completion

- Add polling in `AISidebar`.
- Persist conversation IDs.
- Improve error, loading, and retry states.
- Add tests for request payload and polling.

### Week 4: Demo-quality integration

- Build one end-to-end demo: Power BI report plus Databricks Genie profile.
- Ask a question grounded in the active page/filter context.
- Record known limitations and a hardening checklist.

## Bottom Line

PulsePlay is aiming at the right abstraction and already has a serious proxy foundation. The project will become compelling when one BI adapter becomes real and the assistant can complete a grounded answer loop.

Right now, the product is promising scaffolding with strong inherited backend muscles. The next milestone should be a narrow, working vertical slice rather than more horizontal surface area.
