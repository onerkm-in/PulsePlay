// Builds a print-ready HTML for the PulsePlay Configuration Guide PDF.
// Inlines screenshots as base64 so the HTML is self-contained, then Chrome
// renders it to PDF. No external dependencies.
//   node docs/config-guide-assets/build-guide.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "shots");

function dataUri(slug) {
    const b = readFileSync(join(SHOTS, slug));
    return "data:image/png;base64," + b.toString("base64");
}
function fig(slug, caption) {
    return `<figure class="shot avoid"><img src="${dataUri(slug)}" alt="${caption}"/><figcaption>${caption}</figcaption></figure>`;
}

const css = `
:root{
  --ink:#0f1729; --muted:#5a6781; --line:#e3e8f0; --bg:#ffffff;
  --brand:#3b5bff; --brand2:#7c4dff; --good:#0a8f53; --warn:#b06a00; --bad:#c0392b;
  --soft:#f5f7fc; --soft2:#eef2fb;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;color:var(--ink);
  font-size:12.5px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
h1,h2,h3{line-height:1.2;margin:0 0 .35em}
h2{font-size:21px;color:var(--ink);border-bottom:3px solid var(--brand);padding-bottom:6px;margin-top:6px}
h3{font-size:15px;color:#1c2a52;margin-top:14px}
p{margin:.4em 0}
small{color:var(--muted)}
code{background:var(--soft2);border:1px solid var(--line);border-radius:4px;padding:1px 5px;font-family:Consolas,"Courier New",monospace;font-size:11px;color:#23306a}
a{color:var(--brand);text-decoration:none}
.page{padding:34px 40px;page-break-after:always}
.page:last-child{page-break-after:auto}
.avoid{break-inside:avoid;page-break-inside:avoid}

/* cover */
.cover{height:980px;background:linear-gradient(135deg,#0f1729 0%,#22306b 55%,#3b5bff 100%);color:#fff;
  display:flex;flex-direction:column;justify-content:center;padding:0 64px;page-break-after:always}
.cover .kick{letter-spacing:3px;text-transform:uppercase;font-size:13px;opacity:.8}
.cover h1{font-size:52px;margin:14px 0 6px;font-weight:800}
.cover .sub{font-size:20px;opacity:.92;max-width:640px}
.cover .badges{margin-top:34px;display:flex;gap:10px;flex-wrap:wrap}
.cover .b{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:7px 14px;font-size:13px}
.cover .foot{margin-top:48px;font-size:13px;opacity:.8}

/* callouts */
.note{border-left:5px solid var(--brand);background:var(--soft);padding:10px 14px;border-radius:0 8px 8px 0;margin:10px 0}
.note.warn{border-color:var(--warn);background:#fff7ea}
.note.good{border-color:var(--good);background:#eefaf2}
.note.bad{border-color:var(--bad);background:#fdeeec}
.note b{color:inherit}

/* analogy / big picture boxes */
.flow{display:flex;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap;margin:14px 0}
.box{border:2px solid var(--line);border-radius:12px;padding:12px 14px;min-width:150px;text-align:center;background:#fff}
.box .t{font-weight:700;font-size:13px}
.box .d{font-size:11px;color:var(--muted)}
.box.brand{border-color:var(--brand);background:var(--soft2)}
.box.brand2{border-color:var(--brand2);background:#f3effe}
.arrow{font-size:26px;color:var(--brand);font-weight:800}

/* two-axis grid */
.axis{display:flex;gap:14px;margin:12px 0}
.axis .col{flex:1;border:2px solid var(--line);border-radius:12px;padding:12px}
.axis .col h4{margin:0 0 6px;font-size:13px}
.tag{display:inline-block;background:var(--soft2);border:1px solid var(--line);border-radius:999px;padding:3px 9px;margin:3px 4px 0 0;font-size:11px}
.tag.on{background:#eefaf2;border-color:#bfe6d0;color:#0a6e43}
.tag.opt{background:#fff7ea;border-color:#f0dcb4;color:#8a5a00}

/* step cards */
.steps{counter-reset:s;margin:8px 0}
.step{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;background:#fff}
.step .n{flex:0 0 28px;height:28px;width:28px;border-radius:50%;background:var(--brand);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px}
.step .body{flex:1}
.step .body b{font-size:13px}

/* who-to-ask */
.who{display:flex;gap:10px;align-items:flex-start;background:#f3effe;border:1px dashed var(--brand2);border-radius:10px;padding:9px 12px;margin:8px 0}
.who .ic{font-size:18px}
.who .role{font-weight:700;color:#4a2da8}

/* tables */
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11.5px}
th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
th{background:var(--soft2);font-weight:700}
tr{break-inside:avoid}

/* screenshots */
.shot{margin:14px 0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.shot img{width:100%;display:block}
.shot figcaption{font-size:11px;color:var(--muted);padding:7px 10px;background:var(--soft);border-top:1px solid var(--line)}

/* portal mockup (illustration, not a real screenshot) */
.win{border:1px solid #cdd5e6;border-radius:9px;overflow:hidden;margin:10px 0;background:#fff;box-shadow:0 1px 0 #eef}
.win .bar{background:#eef2fb;border-bottom:1px solid #cdd5e6;padding:6px 10px;font-size:11px;color:#56618a;display:flex;gap:6px;align-items:center}
.win .dot{height:9px;width:9px;border-radius:50%;display:inline-block}
.win .body{padding:12px 14px;font-size:12px}
.crumb{color:#56618a;font-size:11px;margin-bottom:8px}
.crumb b{color:#1c2a52}
.click{display:inline-block;background:#fff3cf;border:1px solid #e7c766;border-radius:6px;padding:3px 8px;font-size:11px;color:#7a5a00;font-weight:600}
.kv{display:flex;gap:8px;margin:4px 0}
.kv .k{flex:0 0 200px;color:#56618a}
.kv .v{font-family:Consolas,monospace;color:#23306a}

.two{display:flex;gap:14px}
.two>div{flex:1}
.pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:10.5px;font-weight:700}
.pill.ok{background:#eefaf2;color:#0a6e43;border:1px solid #bfe6d0}
.pill.opt{background:#fff7ea;color:#8a5a00;border:1px solid #f0dcb4}
.legend{font-size:11px;color:var(--muted);margin-top:4px}
ul.tight{margin:.3em 0;padding-left:18px}
ul.tight li{margin:.2em 0}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PulsePlay Configuration Guide</title><style>${css}</style></head><body>

<!-- COVER -->
<section class="cover">
  <div class="kick">PulsePlay · Internal enabler</div>
  <h1>Configuration Guide</h1>
  <div class="sub">How to connect PulsePlay to Databricks and Power BI — explained so simply that anyone can follow it, step by step, with pictures.</div>
  <div class="badges">
    <span class="b">🧩 Pick only what you need</span>
    <span class="b">✅ Databricks &amp; Power BI validated</span>
    <span class="b">🔒 Secrets stay out of the code</span>
    <span class="b">🖼️ Real app screenshots</span>
  </div>
  <div class="foot">Companion to <b>docs/SETUP_FOR_BEGINNERS.md</b> &amp; <b>docs/DEPLOYMENT_GUIDE.md</b> · Generated 2026-06-06</div>
</section>

<!-- 1. HOW TO READ + BIG PICTURE -->
<section class="page">
  <h2>1 · The idea, in one picture</h2>
  <p>Think of PulsePlay like a <b>TV with a smart remote</b>:</p>
  <div class="flow avoid">
    <div class="box brand2"><div class="t">📺 The screen</div><div class="d">Your dashboard<br>(Power BI, Tableau…)</div></div>
    <div class="arrow">+</div>
    <div class="box brand"><div class="t">🕹️ The remote</div><div class="d">The AI "brain"<br>that answers questions</div></div>
    <div class="arrow">=</div>
    <div class="box"><div class="t">✨ PulsePlay</div><div class="d">One place that hosts<br>both, together</div></div>
  </div>
  <p><b>Configuring PulsePlay</b> = telling it <i>which brains to use</i> and giving it the <i>keys</i> to reach them. That's almost the whole job — you rarely touch code.</p>

  <h3>What actually runs</h3>
  <div class="flow avoid">
    <div class="box"><div class="t">🌐 Your browser</div><div class="d">opens the web page</div></div>
    <div class="arrow">→</div>
    <div class="box brand2"><div class="t">🖥️ playground</div><div class="d">the web page you click</div></div>
    <div class="arrow">→</div>
    <div class="box brand"><div class="t">🔌 proxy</div><div class="d">the "switchboard" holding the secret keys</div></div>
    <div class="arrow">→</div>
    <div class="box"><div class="t">☁️ Your services</div><div class="d">Databricks · Power BI</div></div>
  </div>
  <div class="note good"><b>Why this matters:</b> the secret keys live <b>only</b> in the proxy (the switchboard) — never in the browser. So your credentials are never shipped to users.</div>

  <h3>Two things you can swap independently</h3>
  <div class="axis avoid">
    <div class="col"><h4>📺 What you LOOK AT (BI vendor)</h4>
      <span class="tag on">Power BI</span><span class="tag">Tableau</span><span class="tag">Qlik</span><span class="tag">Looker</span><span class="tag">Generic iframe</span><span class="tag">Native charts</span>
    </div>
    <div class="col"><h4>🕹️ The BRAIN that answers (AI connector)</h4>
      <span class="tag on">Foundation Model</span><span class="tag on">Genie</span><span class="tag on">Power BI semantic model</span><span class="tag opt">Azure OpenAI</span><span class="tag opt">Supervisor</span><span class="tag opt">Bedrock</span>
    </div>
  </div>
  <p class="legend"><span class="pill ok">green = validated</span> &nbsp; <span class="pill opt">amber = optional / less-tested</span> &nbsp; Any combination is valid. You can use just one side if you want.</p>
</section>

<!-- 2. INTAKE SHEET -->
<section class="page">
  <h2>2 · What to provide (the intake sheet)</h2>
  <div class="note"><b>PulsePlay is modular — you do NOT need every connector.</b> Pick only the block(s) you want. Each block below is <b>independent</b>: want only Power BI? Fill Block B, ignore the rest. Real values are filled by <b>you or your org's admins at setup time</b>; the project only ships placeholders.</div>

  <h3>Block A · Databricks <span class="pill ok">validated</span> <small>— skip if not using Databricks</small></h3>
  <table class="avoid">
    <tr><th>Value</th><th>Placeholder</th><th>Who provides it</th></tr>
    <tr><td>Workspace URL</td><td><code>https://YOUR_WORKSPACE…databricks.net</code></td><td>Databricks workspace admin / you</td></tr>
    <tr><td>Token (PAT) or service principal</td><td><code>dapi_YOUR_PAT_TOKEN_HERE</code></td><td>Databricks workspace admin</td></tr>
    <tr><td><b>A1</b> Foundation Model endpoint name</td><td><code>YOUR_FOUNDATION_MODEL_ENDPOINT</code></td><td>Databricks ML / data platform owner</td></tr>
    <tr><td><b>A2</b> Genie space ID</td><td><code>YOUR_GENIE_SPACE_ID</code></td><td>Genie space / data owner</td></tr>
    <tr><td><b>A2</b> SQL warehouse ID (must start)</td><td><code>YOUR_SQL_WAREHOUSE_ID</code></td><td>Databricks admin</td></tr>
  </table>

  <h3>Block B · Power BI <span class="pill ok">validated</span> <small>— skip if not using Power BI</small></h3>
  <table class="avoid">
    <tr><th>Value</th><th>Placeholder</th><th>Who provides it</th></tr>
    <tr><td>Azure AD tenant ID</td><td><code>YOUR_AAD_TENANT_GUID</code></td><td>Azure / Entra admin</td></tr>
    <tr><td>App (service principal) client ID</td><td><code>YOUR_SERVICE_PRINCIPAL_CLIENT_ID</code></td><td>Azure / Entra admin</td></tr>
    <tr><td>Client secret</td><td><code>YOUR_SERVICE_PRINCIPAL_CLIENT_SECRET</code></td><td>Azure / Entra admin</td></tr>
    <tr><td>Power BI workspace GUID</td><td><code>YOUR_POWERBI_WORKSPACE_GUID</code></td><td>Power BI workspace owner</td></tr>
    <tr><td>Power BI dataset GUID</td><td><code>YOUR_POWERBI_DATASET_GUID</code></td><td>Power BI dataset owner</td></tr>
    <tr><td>Tenant toggle "Service principals can use Power BI APIs" = ON</td><td>— a setting</td><td>Power BI / Fabric admin</td></tr>
    <tr><td><i>(optional)</i> Premium/Fabric capacity — only for live report visuals</td><td>— a capacity</td><td>Power BI / Fabric admin</td></tr>
  </table>

  <h3>Block C · Other AI brains <span class="pill opt">optional</span> &nbsp; Block D · Hosting <span class="pill opt">later</span></h3>
  <div class="two">
    <div><table class="avoid"><tr><th>Brain</th><th>Needs</th></tr>
      <tr><td>Azure OpenAI</td><td>endpoint, key, deployment</td></tr>
      <tr><td>AWS Bedrock</td><td>AWS creds + region</td></tr></table></div>
    <div><table class="avoid"><tr><th>Host</th><th>Owner</th></tr>
      <tr><td>Databricks Apps</td><td>Databricks workspace admin</td></tr>
      <tr><td>Azure App Service</td><td>Azure / Entra admin</td></tr></table></div>
  </div>
</section>

<!-- 3. RUN LOCALLY + CONFIG FILE -->
<section class="page">
  <h2>3 · Start it on your computer</h2>
  <p>Open two terminals (PowerShell). One runs the switchboard, one runs the web page.</p>
  <div class="steps">
    <div class="step avoid"><div class="n">1</div><div class="body"><b>Terminal 1 — the proxy (switchboard)</b><br>
      <code>cd …\PulsePlay\proxy</code> → <code>npm install</code> → <code>$env:PORT=7000; node --use-system-ca server.js</code></div></div>
    <div class="step avoid"><div class="n">2</div><div class="body"><b>Terminal 2 — the web page</b><br>
      <code>cd …\PulsePlay\playground</code> → <code>npm install</code> → <code>npm run dev</code></div></div>
    <div class="step avoid"><div class="n">3</div><div class="body"><b>Open the app</b><br>Visit <code>http://127.0.0.1:7001</code> in your browser.</div></div>
  </div>
  <div class="note warn"><b>The #1 mistake:</b> forgetting <code>$env:PORT=7000</code>. The web page only looks for the proxy on port <b>7000</b> — miss it and every request fails with error 500.</div>

  <h2 style="margin-top:18px">4 · The one file you edit</h2>
  <p>All configuration lives in <code>proxy/config.json</code> as a list of <b>profiles</b> (one per brain). The app lists every profile automatically — add one, a new brain appears.</p>
  <div class="note bad"><b>Golden rule — never paste real secrets into any file in the repo.</b> Keep files placeholder-only. Supply real keys via environment variables (<code>PROXY_PROFILE_…</code>), Azure Key Vault, or Databricks secret scopes. (To test locally with real keys without committing them: fill the file, then run <code>git update-index --skip-worktree proxy/config.json</code>.)</div>

  ${fig("11-ask-pulse.png", "This is PulsePlay. The amber “Setup needed · AI profile” chip (top-right) honestly tells you no brain is connected yet — exactly what you'll fix in the next sections.")}
</section>

<!-- 5. CONNECT THE BRAINS (DATABRICKS) -->
<section class="page">
  <h2>5 · Connect Databricks <span class="pill ok">validated</span></h2>

  <h3>5A · Foundation Model — the easy one (works on free tier)</h3>
  <p>A ready-made AI model Databricks hosts. No warehouse needed. Three things to get:</p>
  <div class="win avoid"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span> &nbsp; Databricks workspace (illustration)</div>
    <div class="body">
      <div class="crumb">① <b>Your email (top-right)</b> › <b>Settings</b> › <b>Developer</b> › <span class="click">Access tokens → Generate</span> → copy the <code>dapi…</code> token</div>
      <div class="crumb">② <b>Machine Learning</b> › <b>Serving</b> → copy an endpoint name, e.g. <code>databricks-meta-llama-3-3-70b-instruct</code></div>
      <div class="crumb">③ Workspace URL is in your browser's address bar, up to <code>.net</code></div>
    </div>
  </div>
  <p>Put them in a profile:</p>
  <table class="avoid"><tr><th>Field</th><th>Value</th></tr>
    <tr><td><code>type</code></td><td><code>foundation-model</code></td></tr>
    <tr><td><code>host</code></td><td>your workspace URL</td></tr>
    <tr><td><code>token</code></td><td>the <code>dapi…</code> token</td></tr>
    <tr><td><code>foundationModelEndpoint</code></td><td>the endpoint name</td></tr>
  </table>
  <div class="who avoid"><div class="ic">🙋</div><div><span class="role">No "Access tokens" option?</span> → ask your <b>Databricks workspace admin</b>: “Enable personal access tokens for me, or give me an OAuth service principal.”</div></div>
  <div class="note warn"><b>Honesty:</b> Foundation Model makes <i>words</i>, not measured numbers — PulsePlay shows an “Illustrative — not grounded in your data” badge. For real numbers, use Genie (5B) or Power BI (section 6).</div>

  <h3>5B · Genie — real numbers from your tables</h3>
  <p>Genie writes SQL, runs it on your real data, and returns charts. Needs a <b>Genie space ID</b> and a <b>running SQL warehouse</b> in addition to the URL + token above.</p>
  <div class="who avoid"><div class="ic">⚠️</div><div><span class="role">Free-tier catch:</span> free Databricks often has <b>Serverless disabled</b>, so Genie replies “Cannot start warehouse…”. <b>Not a PulsePlay bug.</b> Ask your <b>Databricks admin</b>: “Enable Serverless Compute, or create a classic SQL warehouse and bind my Genie spaces to it.” It works the moment they do.</div></div>

  ${fig("04-ai-connector-catalogue.png", "Settings › AI Setup › Connector catalogue — every AI brain, grouped by vendor (Microsoft / Databricks), each with a live status chip and your saved profiles. This is where you add or pick a brain.")}
</section>

<!-- 5C verify -->
<section class="page">
  <h3>5C · Check it's actually live</h3>
  <p>After saving a profile, use the built-in connection test — green means it's really reaching your service.</p>
  ${fig("06-ai-connection-test.png", "Settings › AI Setup › Connection test — click to verify a brain is live. PulsePlay reports honestly (green = reachable, red = not), so you're never fooled into thinking something works when it doesn't.")}
  ${fig("02-settings-setup.png", "Settings › Setup — the guided quick-start that walks a first-time configurer through connecting a brain and a dashboard.")}
</section>

<!-- 6. POWER BI -->
<section class="page">
  <h2>6 · Connect Power BI <span class="pill ok">validated</span></h2>
  <h3>6A · Semantic-model Q&amp;A — real numbers, no paid capacity</h3>
  <p>Ask plain-English questions against a published Power BI dataset; PulsePlay answers with deterministic DAX. You first create a small "robot identity" (a service principal).</p>
  <div class="win avoid"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span> &nbsp; Azure Portal + Power BI (illustration)</div>
    <div class="body">
      <div class="crumb">① <b>Azure Portal</b> › <b>Microsoft Entra ID</b> › <b>App registrations</b> › <span class="click">New registration</span> → copy <b>Client ID</b> + <b>Tenant ID</b></div>
      <div class="crumb">② That app › <b>Certificates &amp; secrets</b> › <span class="click">New client secret</span> → copy the <b>Value</b> (shown once!)</div>
      <div class="crumb">③ <b>Power BI Admin portal</b> › <b>Tenant settings</b> › <span class="click">Service principals can use Power BI APIs = ON</span></div>
      <div class="crumb">④ <b>Power BI workspace</b> › <b>Manage access</b> › <span class="click">Add the app as Member</span></div>
      <div class="crumb">⑤ Copy the <b>workspace GUID</b> (in the workspace URL) and the <b>dataset GUID</b> (in dataset settings)</div>
    </div>
  </div>
  <div class="two">
    <div><table class="avoid"><tr><th>Field</th></tr>
      <tr><td><code>type: powerbi-semantic-model</code></td></tr>
      <tr><td><code>aadTenantId</code></td></tr>
      <tr><td><code>aadClientId</code></td></tr>
      <tr><td><code>aadClientSecret</code></td></tr>
      <tr><td><code>powerbiGroupId</code> (workspace)</td></tr>
      <tr><td><code>powerbiDatasetId</code></td></tr></table></div>
    <div>
      <div class="who avoid"><div class="ic">🙋</div><div><span class="role">Not an admin?</span> Send your <b>Power BI/Fabric admin</b>: “Enable ‘Service principals can use Power BI APIs’ and add my app to the workspace.”</div></div>
      <div class="note good"><b>Best value:</b> this path is <b>capacity-free</b> — real Power BI numbers without paying.</div>
    </div>
  </div>
  <h3>6B · Showing a live report visual <span class="pill opt">needs paid capacity</span></h3>
  <div class="who avoid"><div class="ic">⚠️</div><div><span class="role">Rendering a real report visual</span> needs <b>Premium/Fabric capacity</b> (a Fabric trial works). Ask your <b>Power BI/Fabric admin</b>: “Assign my workspace to Premium/Fabric capacity.” Until then, use 6A.</div></div>
</section>

<!-- 7. BI SIDE -->
<section class="page">
  <h2>7 · Pick the dashboard you look at</h2>
  <p>The "screen" side. Choose a vendor, then tell PulsePlay how to embed it. No coding.</p>
  ${fig("08-bi-provider.png", "Settings › BI Setup › Provider — pick Power BI, Tableau, Qlik, Looker, a generic iframe, or PulsePlay's native canvas. Each is independent of the AI brain you chose.")}
  ${fig("09-bi-embed.png", "Settings › BI Setup › Embed — choose the embed mode and paste your link / IDs. The easiest is “Secure embed link — quick preview”: paste the link Power BI gives you under File › Embed report.")}
</section>

<section class="page">
  <h3>Authentication options (keep them all)</h3>
  ${fig("10-bi-authentication.png", "Settings › BI Setup › Authentication — the available sign-in options (secure link, SSO, backend service principal). Keep all options available; pick the one your org needs.")}
  <div class="note"><b>Power BI embed modes, simplest → most powerful:</b></div>
  <table class="avoid"><tr><th>Mode</th><th>Plain words</th><th>Who to ask</th></tr>
    <tr><td><b>Secure embed link</b> ⭐</td><td>Paste the link from Power BI › File › Embed report.</td><td>Nobody.</td></tr>
    <tr><td>SSO (user-owns-data)</td><td>You log in with your own MS account; see only what you may.</td><td>Azure admin</td></tr>
    <tr><td>Backend (service principal)</td><td>Proxy mints a token; browser never sees the secret.</td><td>Power BI admin</td></tr>
  </table>
</section>

<!-- 8. HOSTING -->
<section class="page">
  <h2>8 · Hosting (when you go beyond your laptop)</h2>
  <div class="note"><b>Local = two programs. Hosted = one program</b> — the proxy also serves the web page. Universal rules: build the web page first (<code>npm run build</code>), set <code>STATIC_DIR=playground/dist</code>, never hardcode the port, never commit secrets.</div>
  <div class="two">
    <div>
      <h3>Option D1 · Databricks Apps</h3>
      <p>Best when users live in Databricks. The platform handles login for you.</p>
      <ul class="tight">
        <li>Premium workspace, Apps + serverless enabled</li>
        <li>Token in a <b>secret scope</b></li>
        <li>Databricks CLI + <code>databricks auth login</code></li>
        <li>Deploy: <code>bundle deploy</code> <b>then</b> <code>bundle run</code> (deploy alone doesn't restart!)</li>
        <li>Pin a <b>commit SHA</b>, not a branch</li>
      </ul>
      <div class="who avoid"><div class="ic">🙋</div><div><span class="role">Owner:</span> Databricks workspace admin</div></div>
    </div>
    <div>
      <h3>Option D2 · Azure App Service</h3>
      <p>Best for a normal web URL. You wire the login (Easy Auth).</p>
      <ul class="tight">
        <li>Linux App Service, Node 20</li>
        <li><b>Easy Auth (Entra)</b> at the front door</li>
        <li>Secrets via <b>Key Vault</b> references</li>
        <li><code>SCM_DO_BUILD_DURING_DEPLOYMENT=false</code> (build in CI)</li>
        <li>Easy Auth + <code>/api/*</code>: return <b>401, not a redirect</b></li>
      </ul>
      <div class="who avoid"><div class="ic">🙋</div><div><span class="role">Owner:</span> Azure / Entra admin</div></div>
    </div>
  </div>
  <div class="note good"><b>Auth in one line:</b> Databricks Apps → <code>PROXY_AUTH_MODE=none</code> is fine (platform gates the URL). Azure / anything public → never <code>none</code>; use Easy Auth, and don't set <code>NODE_ENV=production</code> until auth is settled.</div>
  <p><small>Both deploys also exist as one-click GitHub Actions (manual, cost-safe) — see <b>.github/workflows/deploy-azure.yml</b> and <b>deploy-databricks.yml</b>.</small></p>
</section>

<!-- 9. WHO TO CALL + CHECKLIST -->
<section class="page">
  <h2>9 · Who to call for what</h2>
  <table>
    <tr><th>Stuck on…</th><th>Who</th><th>Ask them exactly</th></tr>
    <tr><td>Can't make a Databricks token</td><td>Databricks workspace admin</td><td>"Enable PATs for me, or give me an OAuth service principal."</td></tr>
    <tr><td>Genie "Serverless disabled"</td><td>Databricks account admin</td><td>"Enable Serverless, or give me a classic SQL warehouse for my Genie spaces."</td></tr>
    <tr><td>Power BI SP won't connect</td><td>Power BI / Fabric admin</td><td>"Enable ‘Service principals can use Power BI APIs’ and add my app to the workspace."</td></tr>
    <tr><td>Report visual won't render</td><td>Power BI / Fabric admin</td><td>"Assign my workspace to Premium/Fabric capacity (a trial is fine)."</td></tr>
    <tr><td>Azure OpenAI unavailable</td><td>Azure subscription owner</td><td>"Provision Azure OpenAI + deploy a model; share endpoint + key."</td></tr>
    <tr><td><code>npm install</code> certificate errors</td><td>Your IT / security team</td><td>"Your TLS filter breaks Node; trust the corporate root CA."</td></tr>
  </table>

  <h2 style="margin-top:18px">10 · First-light checklist</h2>
  <div class="steps">
    <div class="step avoid"><div class="n">✓</div><div class="body"><b>Boot it locally</b> (section 3) — proves your machine is ready.</div></div>
    <div class="step avoid"><div class="n">✓</div><div class="body"><b>Add Foundation Model</b> (5A) — easiest, proves Databricks talks to you.</div></div>
    <div class="step avoid"><div class="n">✓</div><div class="body"><b>Add Power BI semantic model</b> (6A) — real numbers, no paid capacity.</div></div>
    <div class="step avoid"><div class="n">✓</div><div class="body"><b>Show a dashboard</b> with a Secure embed link (7).</div></div>
    <div class="step avoid"><div class="n">✓</div><div class="body"><b>Chase admins</b> for the Genie warehouse + Fabric capacity — their actions, not yours.</div></div>
  </div>
  <div class="note"><b>Remember:</b> onboarding a new org = configuration only, no code changes. Clone → fill the placeholders (or supply env vars) → run or deploy.</div>
  <p style="margin-top:24px;text-align:center;color:#8893ad;font-size:11px">PulsePlay Configuration Guide · screenshots captured live from the running app · illustrations of external portals are simplified, not live captures.</p>
</section>

</body></html>`;

writeFileSync(join(__dirname, "guide.html"), html, "utf8");
console.log("Wrote guide.html (" + (html.length / 1024).toFixed(0) + " KB)");
