// playground/src/canvas/SaveChannel.tsx
//
// The one uniform Save affordance for every eligible section (v3.2 §11). A single
// Save control opens an overflow menu: Pin, Bookmark, Note, Highlight, Snapshot,
// Unpin. Any surface renders the same component with an EligibleSection descriptor;
// behaviour + persistence are identical across segregated and combined modes because
// they hit the same /decision-canvas backend.
//
// Styled to the Industry design system: token-driven buttons + a blueprint popup.

import { useState, useCallback } from "react";
import type { CanvasSection, EligibleSection, SaveState } from "./canvasTypes";
import { saveSection, mutateSection, snapshotSection, snapshotSource } from "./canvasClient";
import "./saveChannel.css";

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
        <div className="sc-root">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Save section"
                className={`btn btn-sm ${pinned ? "btn-secondary sc-trigger--saved" : "btn-secondary"}${compact ? " sc-trigger--compact" : ""}`}
            >{pinned ? "Saved ▾" : "Save ▾"}</button>

            {open && (
                <div aria-label="Save options" className="sc-menu blueprint">
                    <i className="corner tl" /><i className="corner tr" />
                    <i className="corner bl" /><i className="corner br" />
                    <MenuItem label={pinned ? "Unpin from Canvas" : "Pin to Canvas"} onClick={doPin} disabled={!eligible} />
                    <MenuItem label="Bookmark" onClick={doBookmark} />
                    <MenuItem label={noteOpen ? "Cancel note" : "Add note"} onClick={() => setNoteOpen((v) => !v)} />
                    {noteOpen && (
                        <div className="sc-note">
                            <textarea
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={2} placeholder="Your note…" aria-label="Section note"
                                className="input"
                            />
                            <button type="button" onClick={submitNote} disabled={busy || !noteDraft.trim()} className="btn btn-primary btn-sm sc-note-save">
                                Save note
                            </button>
                        </div>
                    )}
                    <MenuItem label={section?.state.emphasis === "highlighted" ? "Remove highlight" : "Highlight"} onClick={doHighlight} />
                    <MenuItem label="Capture snapshot" onClick={doSnapshot} />
                </div>
            )}
            {flash && <span role="status" className="sc-flash">{flash}</span>}
        </div>
    );
}

function MenuItem({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="btn btn-ghost btn-sm sc-item">
            {label}
        </button>
    );
}
