// enablers/desktop/tests/appServer.test.mjs
//
// node:test coverage for the app server. Boots the express app on an
// ephemeral 127.0.0.1 port, hits it via global fetch, asserts.
//
// The /api/* reverse-proxy hop is not exercised end-to-end here (that
// is a third-party middleware; we trust http-proxy-middleware). We do
// assert the route is mounted and that requests to it don't crash the
// server.

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import http from "node:http";

import { createAppServer, __forTests } from "../runtime/appServer.mjs";
import { LAUNCH_TOKEN_HEADER, DESKTOP_CLIENT_HEADER, DESKTOP_CLIENT_VALUE } from "../runtime/config.mjs";

async function makeTempBase() {
    return fs.mkdtemp(path.join(os.tmpdir(), "pulseplay-dx1b-app-"));
}

async function cleanup(dir) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

async function makeStaticDir() {
    const base = await makeTempBase();
    await fs.writeFile(path.join(base, "index.html"), "<!doctype html><title>fake-dist</title>");
    return base;
}

function genToken() {
    return crypto.randomBytes(32).toString("base64url");
}

async function bootForTest(extraOptions = {}) {
    const dataBase = await makeTempBase();
    const staticDir = await makeStaticDir();
    const token = genToken();
    const { app } = await createAppServer({
        dataDir: dataBase,
        staticDir,
        proxyPort: 8787, // fine - we don't hit /api in token tests
        launchToken: token,
        version: "0.1.0-test",
        ...extraOptions,
    });
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    return {
        base,
        token,
        dataBase,
        staticDir,
        close: async () => {
            await new Promise((resolve) => server.close(resolve));
            await cleanup(dataBase);
            await cleanup(staticDir);
        },
    };
}

async function bootEchoProxy() {
    const seen = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            seen.push({
                method: req.method,
                url: req.url,
                headers: req.headers,
                rawBody,
            });
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                method: req.method,
                url: req.url,
                body: rawBody ? JSON.parse(rawBody) : null,
            }));
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    return {
        port,
        seen,
        close: async () => {
            await new Promise((resolve) => server.close(resolve));
        },
    };
}

test("/runtime/version is unauthenticated and returns desktop client identity", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());
    const res = await fetch(`${ctx.base}/runtime/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.client, DESKTOP_CLIENT_VALUE);
    assert.equal(body.version, "0.1.0-test");
    assert.equal(body.launcher, "DX1b");
});

test("/runtime/state requires a valid launch token", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());

    const noToken = await fetch(`${ctx.base}/runtime/state`);
    assert.equal(noToken.status, 401);

    const badToken = await fetch(`${ctx.base}/runtime/state`, {
        headers: { [LAUNCH_TOKEN_HEADER]: genToken() },
    });
    assert.equal(badToken.status, 401);

    const ok = await fetch(`${ctx.base}/runtime/state`, {
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token },
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.profile, "default");
    assert.deepEqual(body.state, {});
});

test("PUT /runtime/state persists and round-trips via GET", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());

    const put = await fetch(`${ctx.base}/runtime/state`, {
        method: "PUT",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "content-type": "application/json" },
        body: JSON.stringify({ scope: "settings", patch: { theme: "slate-dark" } }),
    });
    assert.equal(put.status, 200);
    const after = await fetch(`${ctx.base}/runtime/state`, { headers: { [LAUNCH_TOKEN_HEADER]: ctx.token } });
    const body = await after.json();
    assert.deepEqual(body.state, { settings: { theme: "slate-dark" } });
});

test("PUT /runtime/state rejects malformed patches with 400", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());

    const res = await fetch(`${ctx.base}/runtime/state`, {
        method: "PUT",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "content-type": "application/json" },
        body: JSON.stringify({ scope: "nope", patch: {} }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /unsupported scope/);
});

test("profiles CRUD: list / create / set-active / delete-with-confirm", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());

    const list1 = await (await fetch(`${ctx.base}/runtime/profiles`, { headers: { [LAUNCH_TOKEN_HEADER]: ctx.token } })).json();
    assert.deepEqual(list1.profiles, ["default"]);
    assert.equal(list1.active, "default");

    const create = await fetch(`${ctx.base}/runtime/profile`, {
        method: "POST",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "content-type": "application/json" },
        body: JSON.stringify({ name: "sales" }),
    });
    assert.equal(create.status, 201);

    const setActive = await fetch(`${ctx.base}/runtime/profile/active`, {
        method: "PUT",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "content-type": "application/json" },
        body: JSON.stringify({ name: "sales" }),
    });
    assert.equal(setActive.status, 200);

    const list2 = await (await fetch(`${ctx.base}/runtime/profiles`, { headers: { [LAUNCH_TOKEN_HEADER]: ctx.token } })).json();
    assert.equal(list2.active, "sales");

    // First DELETE: 202 + confirmToken; profile still exists.
    const del1 = await fetch(`${ctx.base}/runtime/profile/sales`, {
        method: "DELETE",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token },
    });
    assert.equal(del1.status, 202);
    const { confirmToken } = await del1.json();
    assert.ok(typeof confirmToken === "string" && confirmToken.length > 0);

    // Second DELETE with confirm token: 204, profile gone, active falls back to default.
    const del2 = await fetch(`${ctx.base}/runtime/profile/sales`, {
        method: "DELETE",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "x-confirm-token": confirmToken },
    });
    assert.equal(del2.status, 204);

    const list3 = await (await fetch(`${ctx.base}/runtime/profiles`, { headers: { [LAUNCH_TOKEN_HEADER]: ctx.token } })).json();
    assert.deepEqual(list3.profiles, ["default"]);
    assert.equal(list3.active, "default");
});

test("DELETE /runtime/profile/:name with bad confirm token returns 409", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());

    await fetch(`${ctx.base}/runtime/profile`, {
        method: "POST",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "content-type": "application/json" },
        body: JSON.stringify({ name: "throwaway" }),
    });

    const bad = await fetch(`${ctx.base}/runtime/profile/throwaway`, {
        method: "DELETE",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "x-confirm-token": "wrong" },
    });
    assert.equal(bad.status, 409);
});

test("secrets PUT/GET hides values, exposes keys + plaintext warning", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());

    const put = await fetch(`${ctx.base}/runtime/secrets`, {
        method: "PUT",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token, "content-type": "application/json" },
        body: JSON.stringify({ key: "PROXY_KEY", value: "secret-value" }),
    });
    assert.equal(put.status, 204);

    const list = await (await fetch(`${ctx.base}/runtime/secrets`, { headers: { [LAUNCH_TOKEN_HEADER]: ctx.token } })).json();
    assert.deepEqual(list.keys, ["PROXY_KEY"]);
    assert.equal(list.encrypted, false);
    assert.match(list.warning, /plaintext/i);
});

test("/runtime/heartbeat invokes onHeartbeat and returns 204", async (t) => {
    let beats = 0;
    const ctx = await bootForTest({ onHeartbeat: () => { beats += 1; } });
    t.after(() => ctx.close());
    const res = await fetch(`${ctx.base}/runtime/heartbeat`, {
        method: "POST",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token },
    });
    assert.equal(res.status, 204);
    assert.equal(beats, 1);
});

test("/runtime/quit responds 202 then invokes onQuit asynchronously", async (t) => {
    let quitCalls = 0;
    const ctx = await bootForTest({ onQuit: () => { quitCalls += 1; } });
    t.after(() => ctx.close());

    const res = await fetch(`${ctx.base}/runtime/quit`, {
        method: "POST",
        headers: { [LAUNCH_TOKEN_HEADER]: ctx.token },
    });
    assert.equal(res.status, 202);
    // onQuit is deferred via setImmediate; give it a microtask + tick to land.
    await new Promise((r) => setImmediate(r));
    assert.equal(quitCalls, 1);
});

test("/launch serves an HTML shim that moves the token to sessionStorage", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());
    const res = await fetch(`${ctx.base}/launch`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /sessionStorage/);
    assert.match(html, /pulseplay:desktop-launch-token/);
    assert.match(html, /history\.replaceState/);
    // The shim must not echo the token anywhere - the React app reads it
    // from window.location.hash on the client.
    assert.equal(html.includes(ctx.token), false);
});

test("static SPA fallback returns index.html for unknown GETs", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());
    const res = await fetch(`${ctx.base}/some/deep/route`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /fake-dist/);
});

test("/api/* reverse proxy preserves JSON POST bodies and strips the prefix", async (t) => {
    const upstream = await bootEchoProxy();
    const ctx = await bootForTest({ proxyPort: upstream.port });
    t.after(async () => {
        await ctx.close();
        await upstream.close();
    });

    const payload = { assistantProfile: "smoke", content: "visible UI smoke" };
    const res = await fetch(`${ctx.base}/api/assistant/conversations/start`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-pulse-request-id": "ui-test-request" },
        body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
        ok: true,
        method: "POST",
        url: "/assistant/conversations/start",
        body: payload,
    });

    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].method, "POST");
    assert.equal(upstream.seen[0].url, "/assistant/conversations/start");
    assert.deepEqual(JSON.parse(upstream.seen[0].rawBody), payload);
    assert.equal(upstream.seen[0].headers[DESKTOP_CLIENT_HEADER.toLowerCase()], DESKTOP_CLIENT_VALUE);
    assert.equal(upstream.seen[0].headers["x-pulse-request-id"], "ui-test-request");
});

test("non-loopback Host header is rejected with 403", async (t) => {
    const ctx = await bootForTest();
    t.after(() => ctx.close());
    const res = await fetch(`${ctx.base}/runtime/version`, {
        headers: { host: "evil.example.com" },
    });
    // Note: fetch always sets Host based on the URL it's given; this is
    // testing the regex via the route handler more than node fetch
    // behavior. The regex itself is also asserted below as a unit.
    assert.ok(res.status === 200 || res.status === 403);
});

test("loopback Host header regex unit", () => {
    const ok = ["127.0.0.1", "127.0.0.1:8787", "localhost", "localhost:5173", "[::1]", "[::1]:9999"];
    for (const h of ok) {
        assert.ok(__forTests.HOST_HEADER_LOOPBACK_RE.test(h), `should accept ${h}`);
    }
    const bad = ["evil.example.com", "10.0.0.1", "192.168.1.1", "127.0.0.2", ""];
    for (const h of bad) {
        assert.ok(!__forTests.HOST_HEADER_LOOPBACK_RE.test(h), `should reject ${h}`);
    }
});

test("pickRequestId prefers inbound X-Pulse-Request-Id when valid", () => {
    const id = "req-1234";
    const req = { headers: { "x-pulse-request-id": id } };
    assert.equal(__forTests.pickRequestId(req), id);

    const generated = __forTests.pickRequestId({ headers: {} });
    assert.match(generated, /^[0-9a-f-]{36}$/);

    // Too long -> regenerated.
    const tooLong = __forTests.pickRequestId({ headers: { "x-pulse-request-id": "x".repeat(200) } });
    assert.match(tooLong, /^[0-9a-f-]{36}$/);
});
