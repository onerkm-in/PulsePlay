"use strict";

const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_DATABRICKS_HOST = (process.env.DATABRICKS_HOST || "").replace(/\/$/, "");
const DEFAULT_DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN || "";

// ── Limits ────────────────────────────────────────────────────────────────────

const BODY_SIZE_LIMIT_BYTES = 64 * 1024;         // 64 KB — prompt context is never this large
const UPSTREAM_TIMEOUT_MS   = 90_000;            // 90 s — Genie can be slow on cold warehouses
const RATE_WINDOW_MS        = 10_000;            // 10 s sliding window
const RATE_LIMIT_PER_WINDOW = 20;               // max 20 requests per 10 s per IP

// ── Rate limiter ──────────────────────────────────────────────────────────────

const rateLimitMap = new Map();

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };

    if (now - entry.windowStart > RATE_WINDOW_MS) {
        entry.count = 0;
        entry.windowStart = now;
    }

    entry.count += 1;
    rateLimitMap.set(ip, entry);
    return entry.count > RATE_LIMIT_PER_WINDOW;
}

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Genie-Target-Host",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify(payload));
}

function sendEmpty(res, statusCode) {
    res.writeHead(statusCode, CORS_HEADERS);
    res.end();
}

// ── Body reader ───────────────────────────────────────────────────────────────

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalBytes = 0;

        req.on("data", chunk => {
            totalBytes += chunk.length;
            if (totalBytes > BODY_SIZE_LIMIT_BYTES) {
                reject(new RequestTooLargeError());
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

class RequestTooLargeError extends Error {
    constructor() {
        super(`Request body exceeds the ${BODY_SIZE_LIMIT_BYTES} byte limit.`);
        this.name = "RequestTooLargeError";
    }
}

// ── Request logger ────────────────────────────────────────────────────────────

function logRequest(method, path, status, durationMs) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${method} ${path} → ${status} (${durationMs}ms)`);
}

// ── Host and auth helpers ─────────────────────────────────────────────────────

function getTargetHost(req) {
    const headerHost = (req.headers["x-genie-target-host"] || "").toString().trim().replace(/\/$/, "");
    return headerHost || DEFAULT_DATABRICKS_HOST;
}

function getAuthorizationHeader(req) {
    const headerAuth = (req.headers.authorization || "").toString().trim();
    if (headerAuth) return headerAuth;
    if (DEFAULT_DATABRICKS_TOKEN) return `Bearer ${DEFAULT_DATABRICKS_TOKEN}`;
    return "";
}

function isValidHttpsUrl(value) {
    if (!value) return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:";
    } catch {
        return false;
    }
}

// ── Proxy handler ─────────────────────────────────────────────────────────────

async function proxyDatabricksRequest(req, res) {
    const targetHost = getTargetHost(req);
    if (!targetHost) {
        sendJson(res, 400, { error: "Missing Databricks host. Provide X-Genie-Target-Host header or set DATABRICKS_HOST." });
        return;
    }

    if (!isValidHttpsUrl(targetHost)) {
        sendJson(res, 400, { error: "Target host must be an https:// URL." });
        return;
    }

    const authHeader = getAuthorizationHeader(req);
    if (!authHeader) {
        sendJson(res, 400, { error: "Missing authorization. Provide Authorization header or set DATABRICKS_TOKEN." });
        return;
    }

    const targetUrl = new URL(req.url, targetHost);
    const body = req.method === "POST" ? await readBody(req) : undefined;

    const controller = new AbortController();
    const upstreamTimeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let upstream;
    try {
        upstream = await fetch(targetUrl, {
            method: req.method,
            headers: { "Content-Type": "application/json", "Authorization": authHeader },
            body: body && body.length > 0 ? body : undefined,
            signal: controller.signal
        });
    } catch (err) {
        if (err && err.name === "AbortError") {
            sendJson(res, 504, { error: `Upstream request timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s.` });
        } else {
            sendJson(res, 502, { error: err && err.message ? err.message : "Upstream request failed." });
        }
        return;
    } finally {
        clearTimeout(upstreamTimeout);
    }

    const text = await upstream.text();

    // Log Genie message responses so we can inspect the attachment structure
    // during development. Truncated to keep logs readable.
    if (req.url.match(/\/messages\/[^/]+$/) && req.method === "GET") {
        try {
            const parsed = JSON.parse(text);
            const status = parsed.status ?? "?";
            const attachmentTypes = (parsed.attachments ?? []).map(a => {
                const aid = a.attachment_id ?? a.id ?? "?";
                if (a.text) return `TEXT(id=${aid})`;
                if (a.query) return `QUERY(id=${aid}, title=${a.query.title ?? "-"}, hasResult=${!!a.query?.result})`;
                if (a.suggested_questions) return `SUGGESTIONS(id=${aid}, count=${a.suggested_questions.length})`;
                return `OTHER(id=${aid}, keys=${JSON.stringify(Object.keys(a))})`;
            });
            const followUps = parsed.follow_up_questions ?? parsed.followUpQuestions ?? parsed.suggested_questions;
            console.log(`[genie-msg] status=${status} attachments=[${attachmentTypes.join(", ")}]${followUps ? ` follow_ups=${JSON.stringify(followUps)}` : ""}`);
        } catch {
            console.log(`[genie-msg] raw=${text.substring(0, 200)}`);
        }
    }

    // Log query-result responses
    if (req.url.includes("/query-result/")) {
        try {
            const parsed = JSON.parse(text);
            const sr = parsed.statement_response;
            const cols = sr?.manifest?.schema?.columns ?? sr?.manifest?.columns ?? parsed.columns ?? [];
            const rows = sr?.result?.data_array ?? sr?.result?.data_table ?? parsed.data_array ?? parsed.rows ?? [];
            console.log(`[genie-qr] columns=${JSON.stringify(cols.map(c => c.name ?? c))} rowCount=${rows.length}`);
        } catch {
            console.log(`[genie-qr] raw=${text.substring(0, 200)}`);
        }
    }

    res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        ...CORS_HEADERS
    });
    res.end(text);
}

// ── Feedback handler ──────────────────────────────────────────────────────────

async function handleFeedback(req, res) {
    const body = await readBody(req);
    console.log(`[feedback] ${new Date().toISOString()} ${body}`);
    sendJson(res, 200, { ok: true });
}

// ── Request dispatcher ────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();

    try {
        if (!req.url || !req.method) {
            sendJson(res, 400, { error: "Invalid request." });
            return;
        }

        if (req.method === "OPTIONS") {
            sendEmpty(res, 204);
            return;
        }

        const ip = req.socket.remoteAddress || "unknown";
        if (isRateLimited(ip)) {
            res.setHeader("Retry-After", String(Math.ceil(RATE_WINDOW_MS / 1000)));
            sendJson(res, 429, { error: "Too many requests. Slow down and retry." });
            logRequest(req.method, req.url, 429, Date.now() - startedAt);
            return;
        }

        if (req.url === "/" || req.url === "/health") {
            sendJson(res, 200, {
                ok: true,
                service: "pbi-genie-proxy",
                targetHostConfigured: Boolean(DEFAULT_DATABRICKS_HOST),
                tokenConfigured: Boolean(DEFAULT_DATABRICKS_TOKEN)
            });
            logRequest(req.method, req.url, 200, Date.now() - startedAt);
            return;
        }

        if (req.url === "/feedback" && req.method === "POST") {
            await handleFeedback(req, res);
            logRequest(req.method, req.url, 200, Date.now() - startedAt);
            return;
        }

        if (req.url.startsWith("/api/2.0/genie/spaces/") && (req.method === "GET" || req.method === "POST")) {
            await proxyDatabricksRequest(req, res);
            logRequest(req.method, req.url, res.statusCode, Date.now() - startedAt);
            return;
        }

        sendJson(res, 404, { error: "Route not found." });
        logRequest(req.method, req.url, 404, Date.now() - startedAt);
    } catch (error) {
        if (error instanceof RequestTooLargeError) {
            sendJson(res, 413, { error: error.message });
            logRequest(req.method, req.url, 413, Date.now() - startedAt);
            return;
        }

        const message = error && error.message ? error.message : "Unexpected proxy error.";
        sendJson(res, 500, { error: message });
        logRequest(req.method, req.url, 500, Date.now() - startedAt);
    }
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`PBI Genie proxy listening on http://127.0.0.1:${PORT}`);
    console.log(`  Body limit:    ${BODY_SIZE_LIMIT_BYTES / 1024} KB`);
    console.log(`  Rate limit:    ${RATE_LIMIT_PER_WINDOW} req / ${RATE_WINDOW_MS / 1000}s`);
    console.log(`  Upstream timeout: ${UPSTREAM_TIMEOUT_MS / 1000}s`);
    console.log(`  Target host:   ${DEFAULT_DATABRICKS_HOST || "(from X-Genie-Target-Host header)"}`);
    console.log(`  Token:         ${DEFAULT_DATABRICKS_TOKEN ? "configured" : "not configured"}`);
});
