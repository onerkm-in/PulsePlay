// playground/src/workbench/composerInput.ts
//
// Step 6 — additive Pulse asset reuse.
//
// The workbench composer accepts free-text input that is then sent to the
// Genie / supervisor / Foundation Model start endpoint. The Pulse-PBI
// sibling has already done the hard work of building a conservative
// secrets-redactor + prompt-injection-keyword stripper (`safeAuthorPrompt`
// in `playground/src/pulse/promptRedaction.ts`). Importing that here is the
// additive reuse the Pulse-port detangling doc calls out as a Category-B
// extraction (`docs/PULSE_PORT_DETANGLING.md`).
//
// We do NOT modify the Pulse module — the sibling consumes it as-is.
// We add a workbench-facing wrapper so the call site is explicit about
// intent and so a future swap (e.g. to a more sophisticated guard) does
// not have to touch the composer.

import {
    detectAuthorPromptSecrets,
    detectInstructionKeywords,
    safeAuthorPrompt,
} from '../pulse/promptRedaction';

export interface SanitizedComposerInput {
    /** The sanitized text safe to send to the proxy. */
    readonly sanitized: string;
    /** True when redaction or injection-stripping changed the text. */
    readonly mutated: boolean;
    /** Pattern names from the Pulse secret-redactor that fired. */
    readonly secretsHit: ReadonlyArray<string>;
    /** Pattern names from the Pulse injection-keyword stripper that fired. */
    readonly injectionHit: ReadonlyArray<string>;
}

/**
 * Sanitize a user-supplied composer input before sending it to the
 * `/assistant/conversations/start` endpoint. Returns the sanitized text
 * plus diagnostic hit lists the UI can surface ("we found 1 token and 1
 * injection keyword — these were stripped before send").
 *
 * Empty / whitespace-only input passes through unchanged with mutated=false.
 */
export function sanitizeComposerInput(input: string | null | undefined): SanitizedComposerInput {
    if (!input || !input.trim()) {
        return { sanitized: input ?? '', mutated: false, secretsHit: [], injectionHit: [] };
    }
    const secretsHit = detectAuthorPromptSecrets(input);
    const injectionHit = detectInstructionKeywords(input);
    const sanitized = safeAuthorPrompt(input);
    return {
        sanitized,
        mutated: sanitized !== input,
        secretsHit,
        injectionHit,
    };
}
