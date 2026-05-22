// enablers/desktop/runtime/watchdog.mjs
//
// Heartbeat watchdog. Receives kick() calls from the app-server's
// /runtime/heartbeat handler. Fires onTimeout() when no kick lands
// within timeoutMs. Re-arming behavior is automatic: every kick
// schedules a fresh deadline.
//
// Contract: docs/DX1_LAUNCHER_CONTRACT.md §10. 15s client heartbeat,
// 45s server timeout - the gap survives 2 missed beats which is
// intentional given background-tab throttling in private browsers.

import { HEARTBEAT_TIMEOUT_MS } from "./config.mjs";

/**
 * @param {object} opts
 * @param {() => void} opts.onTimeout
 * @param {number} [opts.timeoutMs]
 * @param {() => number} [opts.now]   injectable for tests
 * @returns {{ kick: () => void, stop: () => void, lastKickAt: () => number, isStopped: () => boolean }}
 */
export function createWatchdog(opts) {
    const onTimeout = opts && opts.onTimeout;
    if (typeof onTimeout !== "function") {
        throw new Error("createWatchdog: onTimeout function required");
    }
    const timeoutMs = Number.isInteger(opts.timeoutMs) ? opts.timeoutMs : HEARTBEAT_TIMEOUT_MS;
    const now = typeof opts.now === "function" ? opts.now : Date.now;

    let timer = null;
    let lastKick = now();
    let stopped = false;
    let firing = false;

    function clear() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function arm() {
        clear();
        if (stopped) return;
        timer = setTimeout(() => {
            if (stopped || firing) return;
            firing = true;
            try { onTimeout(); } finally { firing = false; }
        }, timeoutMs);
        if (typeof timer.unref === "function") timer.unref();
    }

    arm();

    return {
        kick() {
            if (stopped) return;
            lastKick = now();
            arm();
        },
        stop() {
            stopped = true;
            clear();
        },
        lastKickAt: () => lastKick,
        isStopped: () => stopped,
    };
}
