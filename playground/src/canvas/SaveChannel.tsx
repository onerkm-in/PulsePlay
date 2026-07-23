// playground/src/canvas/SaveChannel.tsx
//
// The one uniform Save affordance for every eligible section (v3.2 §11). Instead of
// six permanent icons, a single Save control opens an overflow menu: Pin, Bookmark,
// Note, Highlight, Snapshot, Unpin. Any surface (Action Insights, AI Insights, Ask
// Pulse, eligible Dashboard) renders the same component with an EligibleSection
// descriptor; behavior + persistence are identical across segregated and combined
// modes because they hit the same /decision-canvas backend.

import { useState, useCallback } from "react";
import type { CanvasSection, EligibleSection, SaveState } from "./canvasTypes";
import { saveSection, mutateSection, snapshotSection, snapshotSource } from "./canvasClient";

function isPinned(s: SaveState): boolean { return s === "pinned" || s === "pinned-and-bookmarked"; }

export function SaveChannel({ eligible, compact }: { eligible: EligibleSection; compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const [section, setSection] = useState<CanvasSection | null>(null);
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState("");
    const [noteOpen, setNoteOpen] = useState(false);

    const notify = (m: string) => {
        setFlash(m); setTimeout(() => setFlash(null), 2200);
        try { window.dispatchEvent(new CustomEvent("pulseplay:canvas-changed")); } catch { /* swallow */ }
    };

    // ensure a server section exists (create/focus), returning the current one
    const ensure = useCallback(async (saveOp?: "pin" | "bookmark"): Promise<CanvasSection> => {
        if (section) return section;
        const { section: s } = await saveSection(eligible, saveOp);
        setSection(s);
        return s;
    }, [eligible, section]);

    const withBusy = async (fn: () => Promise<void>) => {
        setBusy(true);
        try { await fn(); }
        catch (e) { notify((e as Error).message || "Action failed."); }
        finally { setBusy(false); }
    };

    const doPin = () => withBusy(async () => {
        const s = section ? await mutateSection(section.section_id, isPinned(section.state.save_state) ? "unpin" : "pin", section.version) : await ensure("pin");
        setSection(s);
        notify(isPinned(s.state.save_state) ? "Pinned to Canvas." : "Unpinned.");
        setOpen(false);
    });
    const doBookmark = () => withBusy(async () => {
        const base = await ensure();
        const s = await mutateSection(base.section_id, "bookmark", base.version);
        setSection(s); notify("Bookmarked."); setOpen(false);
    });
    const doHighlight = () => withBusy(async () => {
        const base = await ensure();
        const on = base.state.emphasis !== "highlighted";
        const s = await mutateSection(base.section_id, on ? "highlight" : "unhighlight", base.version);
        setSection(s); notify(on ? "Highlighted (and saved)." : "Highlight removed."); setOpen(false);
    });
    const doSnapshot = () => withBusy(async () => {
        if (section) await snapshotSection(section.section_id);
        else await snapshotSource(eligible);
        notify("Snapshot captured."); setOpen(false);
    });
    const submitNote = () => withBusy(async () => {
        const base = await ensure();
        const s = await mutateSection(base.section_id, "note", base.version, { note: noteDraft });
        setSection(s); notify("Note added (and saved)."); setNoteOpen(false); setOpen(false);
    });

    const pinned = section ? isPinned(section.state.save_state) : false;

    return (
        <div style={{ position: "relative", display: "inline-block" }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Save section"
                style={{
                    padding: compact ? "4px 9px" : "6px 11px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                    border: "1px solid rgba(128,128,128,0.35)", background: pinned ? "rgba(37,99,235,0.1)" : "transparent",
                    color: "inherit", fontWeight: 550,
                }}
            >{pinned ? "Saved ▾" : "Save ▾"}</button>

            {open && (
                <div aria-label="Save options" style={{
                    position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20, minWidth: 180,
                    background: "var(--pp-card-bg, #fff)", border: "1px solid rgba(128,128,128,0.3)",
                    borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 6,
                }}>
                    <MenuItem label={pinned ? "Unpin from Canvas" : "Pin to Canvas"} onClick={doPin} disabled={!eligible} />
                    <MenuItem label="Bookmark" onClick={doBookmark} />
                    <MenuItem label={noteOpen ? "Cancel note" : "Add note"} onClick={() => setNoteOpen((v) => !v)} />
                    {noteOpen && (
                        <div style={{ padding: "4px 6px 8px" }}>
                            <textarea
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={2} placeholder="Your note…" aria-label="Section note"
                                style={{ width: "100%", fontSize: 12, borderRadius: 6, border: "1px solid rgba(128,128,128,0.35)", padding: 6, resize: "vertical" }}
                            />
                            <button type="button" onClick={submitNote} disabled={busy || !noteDraft.trim()}
                                style={{ marginTop: 4, padding: "4px 10px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", fontSize: 12, cursor: "pointer" }}>
                                Save note
                            </button>
                        </div>
                    )}
                    <MenuItem label={section?.state.emphasis === "highlighted" ? "Remove highlight" : "Highlight"} onClick={doHighlight} />
                    <MenuItem label="Capture snapshot" onClick={doSnapshot} />
                </div>
            )}
            {flash && <span role="status" style={{ marginLeft: 8, fontSize: 11, color: "#2563eb" }}>{flash}</span>}
        </div>
    );
}

function MenuItem({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button" onClick={onClick} disabled={disabled}
            style={{
                display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 7,
                border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12.5,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(128,128,128,0.12)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >{label}</button>
    );
}
