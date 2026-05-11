/**
 * setupAccessControl.ts — Wave 38 Phase 1
 *
 * Author-side allowlist gate for the in-visual Setup tab. This is a UX gate,
 * NOT an authorization gate: the .pbix can still be downloaded by anyone
 * with PBI workspace access, and the format-pane property
 * `setupAccessAllowedUsers` is just a comma-separated string. The intent is
 * to give report authors a way to keep the Setup tab visible to a subset of
 * named viewers (security stewards, ops leads) without exposing it to every
 * report consumer.
 *
 * Behaviour summary
 * ─────────────────
 *   • Empty allowlist → fall through to the existing `showSetupAccess`
 *     toggle (identical to today's behaviour).
 *   • Non-empty allowlist → strict gate: viewer must match one entry in
 *     the list (case-insensitive, after trimming).
 *   • PBI Desktop edit mode (author authoring the report) → ALWAYS allowed.
 *     Detected via the `viewMode === ViewMode.Edit` signal forwarded from
 *     `update(options)`. Authors editing a report cannot lock themselves
 *     out by typo'ing their own email into the allowlist.
 *
 * Server-side enforcement (Wave 38 Phase 2 candidate, deferred): would
 * require Azure AD Graph integration on the proxy so the allowlist could
 * be evaluated against AD group membership. Out of scope for Phase 1.
 */

/**
 * Parse the raw textarea value into a normalised allowlist:
 *   - split on commas
 *   - trim whitespace
 *   - lowercase
 *   - drop empty entries
 *   - dedupe (preserves first occurrence order)
 *
 * Caller is responsible for any upstream sanitization (e.g. Wave 22
 * pipelines for prompt injection); this helper only normalises the list
 * shape used at render time for the visibility check.
 */
export function parseAllowedUsers(raw: string): string[] {
    if (!raw || typeof raw !== "string") return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(",")) {
        const v = part.trim().toLowerCase();
        if (!v) continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}

/**
 * Decide whether the viewer identified by `viewerIdentity` is permitted
 * to see the Setup tab given the parsed `allowlist`.
 *
 *   • Empty allowlist → returns true (let the caller fall back to the
 *     legacy `showSetupAccess` toggle).
 *   • Non-empty allowlist + empty viewerIdentity → returns false (no bound
 *     User Role measure ⇒ no way to identify the viewer ⇒ deny). Authors
 *     in PBI Desktop edit mode bypass this case via the `isAuthorEditing`
 *     escape hatch in `shouldShowSetupTab` below.
 *   • Otherwise → case-insensitive equality against the lowercase entries.
 */
export function isUserAllowed(viewerIdentity: string, allowlist: string[]): boolean {
    if (!allowlist || allowlist.length === 0) return true;
    const v = (viewerIdentity || "").trim().toLowerCase();
    if (!v) return false;
    return allowlist.includes(v);
}

/**
 * Pull the viewer identity string from the visual's bound data context.
 * Returns "" when no User Role / User Identity measure is bound (e.g. the
 * report author hasn't wired the data role yet, or the measure returned
 * blank). The caller should treat "" as "unknown viewer".
 *
 * Source preference: `dataUserId` (USERPRINCIPALNAME-style email/UPN) is
 * preferred when bound — it's the most specific identity. Falls back to
 * `dataUserRole` so authors who only bound a role-label measure (e.g.
 * "GenieAuthors") can still gate against it. Both are already lowercased
 * in `contextBuilder.ts`, so we re-trim defensively here.
 */
export function getViewerIdentity(props: {
    context?: { dataUserId?: string; dataUserRole?: string };
}): string {
    const ctx = props?.context ?? {};
    const id = (ctx.dataUserId || "").trim().toLowerCase();
    if (id) return id;
    const role = (ctx.dataUserRole || "").trim().toLowerCase();
    return role;
}

/**
 * Combined gate the visual uses to decide whether to render the Setup
 * tab and the Adjust-filters / Developer-Tools entry points. Layered:
 *
 *   1. Author editing in PBI Desktop → ALWAYS allowed (authors can't lock
 *      themselves out by typo'ing their own email into the allowlist).
 *   2. Allowlist non-empty → strict allowlist match (returns false on
 *      no match — overrides the legacy `showSetupAccess` toggle).
 *   3. Allowlist empty → legacy behaviour: respect `showSetupAccess`.
 */
export function shouldShowSetupTab(input: {
    showSetupAccess: boolean;
    allowlistRaw: string;
    viewerIdentity: string;
    isAuthorEditing: boolean;
}): boolean {
    if (input.isAuthorEditing) return true;
    const allowlist = parseAllowedUsers(input.allowlistRaw || "");
    if (allowlist.length > 0) {
        return isUserAllowed(input.viewerIdentity || "", allowlist);
    }
    return !!input.showSetupAccess;
}
