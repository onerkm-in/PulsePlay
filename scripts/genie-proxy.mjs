import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { URL, fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const envFile = path.join(projectRoot, ".env");

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const env = {};
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex <= 0) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        env[key] = value.replace(/^['"]|['"]$/g, "");
    }

    return env;
}

function parseJsonEnv(value, fallback) {
    if (!value) {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function parseBooleanValue(value, fallback = true) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return fallback;
}

const env = {
    ...parseEnvFile(envFile),
    ...process.env
};

const feedbackDir = path.join(projectRoot, "outputs");
const feedbackFile = path.join(feedbackDir, "genie-feedback.jsonl");
const assistantProfiles = parseJsonEnv(env.GENIE_ASSISTANT_PROFILES, {});
const conversationRegistry = new Map();

const args = new Map(
    process.argv.slice(2).map(arg => {
        const [key, value] = arg.split("=", 2);
        return [key, value ?? "true"];
    })
);

const port = Number(args.get("--port") ?? env.GENIE_PROXY_PORT ?? 8787);
const bindHost = args.get("--host") ?? env.GENIE_PROXY_HOST ?? "127.0.0.1";
const corsOrigin = env.GENIE_CORS_ORIGIN ?? "*";

const ALLOWED_HOST_SUFFIXES = [".databricks.com", ".azuredatabricks.net"];

function isAllowedDatabricksHost(host) {
    try {
        const hostname = new URL(host).hostname.toLowerCase();
        return ALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
    } catch {
        return false;
    }
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Genie-Target-Host",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
}

function isVisualEnabled() {
    return parseBooleanValue(args.get("--enabled") ?? process.env.VISUAL_ENABLED ?? env.VISUAL_ENABLED, true);
}

function getInjectedToken() {
    return String(args.get("--token") ?? process.env.INJECT_TOKEN ?? env.INJECT_TOKEN ?? "").trim();
}

function writeJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders()
    });
    res.end(JSON.stringify(payload));
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function readJsonBody(req) {
    const body = await readBody(req);
    return JSON.parse(body.toString("utf8") || "{}");
}

function getTargetHost(req) {
    const headerHost = req.headers["x-genie-target-host"];
    if (typeof headerHost === "string" && headerHost.trim()) {
        return headerHost.trim().replace(/\/$/, "");
    }

    if (env.DATABRICKS_HOST) {
        return env.DATABRICKS_HOST.trim().replace(/\/$/, "");
    }

    return "";
}

function getAuthorization(req) {
    const injectedToken = getInjectedToken();
    if (injectedToken) {
        return `Bearer ${injectedToken}`;
    }

    const headerAuth = req.headers.authorization;
    if (typeof headerAuth === "string" && headerAuth.trim()) {
        return headerAuth.trim();
    }

    if (env.DATABRICKS_TOKEN) {
        return `Bearer ${env.DATABRICKS_TOKEN.trim()}`;
    }

    return "";
}

function inferIntent(content = "") {
    const normalized = content.toLowerCase();
    if (/(risk|issue|problem|alert|exception|loss|drop)/.test(normalized)) {
        return "risk";
    }
    if (/(opportunity|growth|upside|improve|win)/.test(normalized)) {
        return "opportunity";
    }
    if (/(driver|root cause|why|what changed)/.test(normalized)) {
        return "drivers";
    }
    if (/(leadership|executive|summary|board)/.test(normalized)) {
        return "leadership";
    }
    if (/(scenario|what if|impact simulation)/.test(normalized)) {
        return "scenario";
    }
    if (/(performance|snapshot|overview|current state)/.test(normalized)) {
        return "performance";
    }
    return "summary";
}

function resolveAssistantRoute(payload) {
    const requestedProfile = String(payload.assistantProfile ?? "").trim();
    const profileName = requestedProfile || env.GENIE_ASSISTANT_PROFILE || "default";
    const profile = assistantProfiles[profileName] ?? {};
    const routedIntent = String(payload.intent ?? inferIntent(payload.content)).trim() || "summary";
    const profileIntentMap = profile.intentSpaceIds ?? profile.intents ?? {};
    const routedSpaceId =
        profileIntentMap[routedIntent] ??
        profile.defaultSpaceId ??
        payload.spaceId ??
        env.GENIE_DEFAULT_SPACE_ID ??
        "";

    const routeLabel = titleCase(routedIntent.replace(/[-_]/g, " "));
    const trace = [
        `Assistant profile: ${profileName}`,
        `Intent: ${routeLabel}`,
        routedSpaceId ? `Routed space: ${routedSpaceId}` : "Routed space: unavailable"
    ];

    return {
        assistantProfile: profileName,
        routedIntent,
        routedSpaceId,
        routeLabel,
        trace,
        source: profile.defaultSpaceId || profileIntentMap[routedIntent] ? "proxy-routing" : "fallback-routing"
    };
}

async function proxyGenieRequest({ req, targetHost, authorization, spaceId, pathSuffix, method, body }) {
    const targetUrl = new URL(`/api/2.0/genie/spaces/${spaceId}${pathSuffix}`, targetHost).toString();
    return fetch(targetUrl, {
        method,
        headers: {
            Authorization: authorization,
            "Content-Type": req.headers["content-type"] || "application/json"
        },
        body
    });
}

function buildAssistantMeta(route) {
    return {
        assistantProfile: route.assistantProfile,
        routedSpaceId: route.routedSpaceId,
        routedIntent: route.routedIntent,
        routeLabel: route.routeLabel,
        trace: route.trace,
        source: route.source
    };
}

function buildSuggestedActions(route) {
    const base = [
        {
            id: "drivers",
            label: "Rank key drivers",
            kind: "ask",
            intent: "drivers",
            prompt: "Explain the top drivers behind this result and rank them by impact."
        },
        {
            id: "leadership",
            label: "Summarize for leadership",
            kind: "ask",
            intent: "leadership",
            prompt: "Summarize this result for leadership with key risks, opportunities, and actions."
        }
    ];

    if (route.routedIntent === "performance" || route.routedIntent === "summary") {
        base.unshift({
            id: "risk",
            label: "Focus on risk",
            kind: "ask",
            intent: "risk",
            prompt: "Highlight the biggest risks in the current scope and explain what changed."
        });
    }

    if (route.routedIntent === "risk" || route.routedIntent === "drivers") {
        base.unshift({
            id: "scenario",
            label: "Run what-if",
            kind: "ask",
            intent: "scenario",
            prompt: "If we improve the main driver, estimate the expected impact and trade-offs."
        });
    }

    return base;
}

function buildHomePayload(payload) {
    const reportContext = payload.reportContext ?? {};
    const measures = Object.entries(reportContext.measures ?? {})
        .sort(([, left], [, right]) => Math.abs(Number(right)) - Math.abs(Number(left)))
        .slice(0, 3);
    const dimensions = Object.entries(reportContext.dimensions ?? {}).slice(0, 3);

    const snapshot = measures.length > 0
        ? measures.map(([label, value], index) => ({
            label,
            value: formatMetric(Number(value)),
            detail: index === 0 ? "Leading visible metric in the current Power BI scope." : "Visible metric in the active report context.",
            tone: index === 0 ? "opportunity" : "neutral"
        }))
        : [{
            label: "Current scope",
            value: reportContext.scope ?? "Visible dataset",
            detail: "No numeric measures were bound, so the assistant is summarizing the visible report context.",
            tone: "neutral"
        }];

    const riskLines = [];
    const opportunityLines = [];
    const changeLines = [];

    if (dimensions.length > 0) {
        riskLines.push(`Check concentration across ${dimensions[0][0]} before acting on the headline result.`);
        opportunityLines.push(`Use ${dimensions[0][0]} to drill into stronger segments quickly.`);
    }
    if (reportContext.hasSelection) {
        changeLines.push("The report currently has an active selection, so the assistant is scoped to highlighted data.");
    } else {
        changeLines.push("The assistant is reading the current filtered report view without a manual selection.");
    }
    if ((reportContext.filterCount ?? 0) > 0) {
        changeLines.push(`The current scope includes ${reportContext.filterCount} visible filter dimension(s).`);
    }
    if (measures.length > 0) {
        opportunityLines.push(`The current snapshot tracks ${measures.length} visible metric(s) for immediate review.`);
    }
    if (riskLines.length === 0) {
        riskLines.push("Use the Risk path to surface the biggest issues and the parts of the business that need attention first.");
    }
    if (opportunityLines.length === 0) {
        opportunityLines.push("Use the Opportunity path to rank upside areas and see where the largest gains may be available.");
    }

    return {
        snapshot,
        risks: riskLines.slice(0, 3),
        opportunities: opportunityLines.slice(0, 3),
        changes: changeLines.slice(0, 3),
        generatedBy: "proxy",
        assistantProfile: payload.assistantProfile || "default",
        suggestedActions: [
            {
                id: "performance",
                label: "Review performance",
                kind: "ask",
                intent: "performance",
                prompt: "Summarize current performance, what changed, and the top risks and opportunities."
            },
            {
                id: "issue",
                label: "Investigate issue",
                kind: "ask",
                intent: "risk",
                prompt: "Identify the biggest issue in the current scope and explain the root causes."
            },
            {
                id: "leadership",
                label: "Summarize for leadership",
                kind: "ask",
                intent: "leadership",
                prompt: "Summarize the current business state for leadership in clean, decision-ready language."
            }
        ]
    };
}

function formatMetric(value) {
    if (!Number.isFinite(value)) {
        return "N/A";
    }
    if (Math.abs(value) >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toFixed(2);
}

function titleCase(value) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

const server = http.createServer(async (req, res) => {
    try {
        if (!req.url) {
            writeJson(res, 400, { error: "Missing request URL." });
            return;
        }

        if (req.method === "OPTIONS") {
            res.writeHead(204, corsHeaders());
            res.end();
            return;
        }

        const enabled = isVisualEnabled();
        if (req.url === "/health") {
            writeJson(res, 200, {
                ok: enabled,
                status: enabled ? "ok" : "disabled",
                enabled,
                targetHostConfigured: Boolean(env.DATABRICKS_HOST),
                tokenConfigured: Boolean(env.DATABRICKS_TOKEN),
                injectTokenConfigured: Boolean(getInjectedToken()),
                assistantProfiles: Object.keys(assistantProfiles),
                timestamp: new Date().toISOString()
            });
            return;
        }

        if (!enabled) {
            writeJson(res, 503, {
                error: "VISUAL_DISABLED",
                status: "disabled",
                enabled: false,
                message: "The Genie proxy is disabled by operator policy."
            });
            return;
        }

        if (req.url === "/feedback" && req.method === "POST") {
            const payload = await readJsonBody(req);
            fs.mkdirSync(feedbackDir, { recursive: true });
            fs.appendFileSync(feedbackFile, `${JSON.stringify({
                ...payload,
                capturedAt: new Date().toISOString()
            })}\n`, "utf8");
            writeJson(res, 200, {
                ok: true,
                storedAt: "outputs/genie-feedback.jsonl"
            });
            return;
        }

        if (req.url.startsWith("/assistant/capabilities") && req.method === "GET") {
            const currentUrl = new URL(req.url, `http://${bindHost}:${port}`);
            const assistantProfile = currentUrl.searchParams.get("assistantProfile") ?? "default";
            const profile = assistantProfiles[assistantProfile] ?? {};
            writeJson(res, 200, {
                assistantProfile,
                multiSpace: Boolean(profile.defaultSpaceId || Object.keys(profile.intentSpaceIds ?? profile.intents ?? {}).length > 0),
                modes: ["narrative", "chart", "table", "sql", "trace"],
                reportActions: true,
                trace: true,
                sql: true,
                table: true,
                chart: true
            });
            return;
        }

        if (req.url === "/assistant/home" && req.method === "POST") {
            const payload = await readJsonBody(req);
            writeJson(res, 200, buildHomePayload(payload));
            return;
        }

        const targetHost = getTargetHost(req);
        if (!/^https:\/\/[^/\s]+$/i.test(targetHost)) {
            writeJson(res, 400, {
                error: "No valid Databricks target host was provided. Set the workspace URL in the visual or DATABRICKS_HOST in .env."
            });
            return;
        }

        if (!isAllowedDatabricksHost(targetHost)) {
            writeJson(res, 403, {
                error: "Target host is not an allowed Databricks domain. The host must end with .databricks.com or .azuredatabricks.net."
            });
            return;
        }

        const authorization = getAuthorization(req);
        if (!authorization) {
            writeJson(res, 401, {
                error: "No Databricks token was provided. Set the token in the visual or DATABRICKS_TOKEN in .env."
            });
            return;
        }

        if (req.url === "/assistant/conversations/start" && req.method === "POST") {
            const payload = await readJsonBody(req);
            const route = resolveAssistantRoute(payload);
            if (!route.routedSpaceId) {
                writeJson(res, 400, {
                    error: "No Genie space could be resolved for this assistant profile. Provide a fallback space ID or configure GENIE_ASSISTANT_PROFILES."
                });
                return;
            }

            const upstream = await proxyGenieRequest({
                req,
                targetHost,
                authorization,
                spaceId: route.routedSpaceId,
                pathSuffix: "/start-conversation",
                method: "POST",
                body: Buffer.from(JSON.stringify({ content: payload.content }), "utf8")
            });
            const data = await upstream.json();
            const conversationId = data.conversation_id ?? data.conversation?.id;
            if (conversationId) {
                conversationRegistry.set(conversationId, route);
            }
            writeJson(res, upstream.status, {
                ...data,
                assistant_meta: buildAssistantMeta(route)
            });
            return;
        }

        const sendMatch = req.url.match(/^\/assistant\/conversations\/([^/]+)\/messages$/);
        if (sendMatch && req.method === "POST") {
            const conversationId = decodeURIComponent(sendMatch[1]);
            const payload = await readJsonBody(req);
            const route = conversationRegistry.get(conversationId) ?? resolveAssistantRoute(payload);
            if (!route.routedSpaceId) {
                writeJson(res, 400, {
                    error: "No Genie space could be resolved for this conversation."
                });
                return;
            }

            const upstream = await proxyGenieRequest({
                req,
                targetHost,
                authorization,
                spaceId: route.routedSpaceId,
                pathSuffix: `/conversations/${conversationId}/messages`,
                method: "POST",
                body: Buffer.from(JSON.stringify({ content: payload.content }), "utf8")
            });
            const data = await upstream.json();
            conversationRegistry.set(conversationId, route);
            writeJson(res, upstream.status, {
                ...data,
                assistant_meta: buildAssistantMeta(route)
            });
            return;
        }

        const messageMatch = req.url.match(/^\/assistant\/conversations\/([^/]+)\/messages\/([^/]+)$/);
        if (messageMatch && req.method === "GET") {
            const conversationId = decodeURIComponent(messageMatch[1]);
            const messageId = decodeURIComponent(messageMatch[2]);
            const route = conversationRegistry.get(conversationId);
            if (!route?.routedSpaceId) {
                writeJson(res, 404, {
                    error: "The assistant route for this conversation could not be found. Start a new conversation."
                });
                return;
            }

            const upstream = await proxyGenieRequest({
                req,
                targetHost,
                authorization,
                spaceId: route.routedSpaceId,
                pathSuffix: `/conversations/${conversationId}/messages/${messageId}`,
                method: "GET"
            });
            const data = await upstream.json();
            writeJson(res, upstream.status, {
                ...data,
                assistant_meta: buildAssistantMeta(route),
                suggested_actions: buildSuggestedActions(route)
            });
            return;
        }

        if (!req.url.startsWith("/api/2.0/genie/")) {
            writeJson(res, 404, { error: "Route not found." });
            return;
        }

        const body = req.method === "GET" ? undefined : await readBody(req);
        const targetUrl = new URL(req.url, targetHost).toString();
        const upstream = await fetch(targetUrl, {
            method: req.method,
            headers: {
                Authorization: authorization,
                "Content-Type": req.headers["content-type"] || "application/json"
            },
            body
        });

        const responseBody = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, {
            ...corsHeaders(),
            "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
        });
        res.end(responseBody);
    } catch (error) {
        writeJson(res, 500, {
            error: error instanceof Error ? error.message : "Unknown proxy error."
        });
    }
});

server.listen(port, bindHost, () => {
    process.stdout.write(`[genie-proxy] listening on http://${bindHost}:${port}\n`);
    process.stdout.write("[genie-proxy] health endpoint: /health\n");
});
