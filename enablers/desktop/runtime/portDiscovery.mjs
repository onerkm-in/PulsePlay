// enablers/desktop/runtime/portDiscovery.mjs
//
// Ephemeral 127.0.0.1 port discovery. Uses the classic "bind to :0,
// read assigned port, close" pattern then hands off to the child
// process. Race is technically possible (another process grabs the
// port in the gap) but is practically zero on a single-user laptop
// and the spawn will fail loudly if it does happen.
//
// Contract: docs/DX1_LAUNCHER_CONTRACT.md §4. PORT_BIND_HOST and
// PORT_RETRY_COUNT live in config.mjs.

import net from "node:net";
import { PORT_BIND_HOST, PORT_RETRY_COUNT } from "./config.mjs";

/**
 * Find a single free TCP port on 127.0.0.1.
 *
 * @param {object} [opts]
 * @param {string} [opts.host=PORT_BIND_HOST]
 * @returns {Promise<number>}
 */
export function findFreePort(opts = {}) {
    const host = opts.host || PORT_BIND_HOST;
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, host, () => {
            const addr = server.address();
            if (!addr || typeof addr === "string") {
                server.close();
                reject(new Error("findFreePort: address() did not return an object"));
                return;
            }
            const { port } = addr;
            server.close((err) => {
                if (err) reject(err);
                else resolve(port);
            });
        });
    });
}

/**
 * Find N distinct free ports. Probes sequentially and rejects if any
 * single probe fails after PORT_RETRY_COUNT attempts.
 *
 * @param {number} count
 * @returns {Promise<number[]>}
 */
export async function findFreePorts(count) {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error("findFreePorts: count must be a positive integer");
    }
    const seen = new Set();
    const out = [];
    for (let i = 0; i < count; i += 1) {
        let lastErr = null;
        let port = null;
        for (let attempt = 0; attempt < PORT_RETRY_COUNT; attempt += 1) {
            try {
                const p = await findFreePort();
                if (!seen.has(p)) {
                    port = p;
                    break;
                }
            } catch (err) {
                lastErr = err;
            }
        }
        if (port === null) {
            throw lastErr || new Error(`findFreePorts: could not find port ${i + 1} of ${count}`);
        }
        seen.add(port);
        out.push(port);
    }
    return out;
}
