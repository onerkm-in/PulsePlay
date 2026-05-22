// enablers/desktop/runtime/config.mjs
//
// Locked DX1b constants. Each value carries a reference to either the
// canonical launcher contract section that mandates it or the
// DECISIONS.md entry that picked the value.
//
// Do not edit values here without updating both DECISIONS.md and the
// launcher contract. The PULSE_SYNC.md Tier 3.5 Desktop EXE Cascade
// expects callers (launcher.mjs, app-server.mjs, future React-side
// client) to read constants from this single file.

// Heartbeat / shutdown (contract §10)
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TIMEOUT_MS = 45_000;

// Token (contract §5, DECISIONS §4)
export const TOKEN_BYTES = 32; // 256-bit
export const LAUNCH_TOKEN_HEADER = "X-PulsePlay-Launch-Token";

// Port discovery (contract §4)
export const PORT_BIND_HOST = "127.0.0.1";
export const PORT_RETRY_COUNT = 5;

// Logging (contract §12)
export const LOG_FILE_BYTES_MAX = 10 * 1024 * 1024;
export const LOG_FILE_ROTATION_COUNT = 5;

// PX1 client identity (proxy/lib/pulseClientContext.js already normalizes this)
export const DESKTOP_CLIENT_HEADER = "X-Pulse-Client";
export const DESKTOP_CLIENT_VALUE = "pulseplay-desktop";
export const DESKTOP_CLIENT_VERSION_HEADER = "X-Pulse-Client-Version";
export const DESKTOP_REQUEST_ID_HEADER = "X-Pulse-Request-Id";

// Launcher build version - read from package.json at runtime so the value
// can't drift away from the source of truth. The launcher exposes this via
// /runtime/version. Defaults to "0.0.0-dev" if package.json is not on the
// filesystem (e.g. inside a packaged binary that strips the manifest).
export const LAUNCHER_VERSION_FALLBACK = "0.0.0-dev";

// /runtime/* path namespace. The app-server mounts router under this prefix.
export const RUNTIME_PREFIX = "/runtime";

// /api/* prefix that the app server reverse-proxies to the bundled proxy.
// Mirrors the dev-server rewrite in playground/vite.config.ts.
export const API_PREFIX = "/api";

// Launch path: app server redirects from /launch to the React app root with
// the token already moved to sessionStorage via the index.html shim. See
// contract §5 for the fragment-not-query rule.
export const LAUNCH_PATH = "/launch";

// Heartbeat path mounted under RUNTIME_PREFIX.
export const HEARTBEAT_PATH = "/heartbeat";

// Recon-disclaimer state key (per DECISIONS §5). React side reads this from
// the active profile's state.json under desktop.reconDisclaimerDismissed.
export const RECON_DISCLAIMER_STATE_KEY = "desktop.reconDisclaimerDismissed";

// PulsePlayData/ layout (contract §9). Resolved at runtime to be alongside
// the launcher binary (process.execPath in packaged mode, cwd in dev mode).
export const DATA_DIRNAME = "PulsePlayData";
export const RUNTIME_LOCK_FILENAME = "runtime/lock.json";
export const RUNTIME_LAST_ERROR_FILENAME = "runtime/last-error.txt";
export const LOGS_LAUNCH_FILENAME = "logs/launch.log";
export const LOGS_RUNTIME_FILENAME = "logs/runtime.log";
export const LOGS_PROXY_FILENAME = "logs/proxy.log";
export const PROFILES_DIRNAME = "profiles";
export const DEFAULT_PROFILE_NAME = "default";
export const PROFILE_STATE_FILENAME = "state.json";
export const SECRETS_FILENAME_PLAINTEXT = "secrets.json"; // DX1b
export const SECRETS_FILENAME_ENCRYPTED = "secrets.enc"; // DX2
