// playground/src/settings/useSettingsDraft.ts
//
// Snapshot-based dirty tracking for the Settings shell.
//
// Strategy: take a snapshot of all `pulseplay:*` localStorage keys when the
// Settings page opens. Poll for drift (+ listen to the display-change event
// that every setter fires). Expose `isDirty`, `save()`, and `discard()` so
// the SettingsSaveBar can give authors an explicit commit step.
//
// Non-invasive: does NOT touch existing setters or stores. Works regardless
// of which store wrote the change (settingsStore, pulseVisualSettingsStore,
// embedConfigStore — all write to localStorage under the pulseplay: prefix).

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'pulseplay:';

function snapshotStorage(): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) out[k] = localStorage.getItem(k) ?? '';
    }
    return out;
}

function computeIsDirty(snap: Record<string, string>): boolean {
    const current = snapshotStorage();
    const keys = new Set([...Object.keys(snap), ...Object.keys(current)]);
    for (const k of keys) {
        if (snap[k] !== current[k]) return true;
    }
    return false;
}

export interface SettingsDraft {
    isDirty: boolean;
    /** Set after a successful save; cleared automatically after 3 s. */
    justSaved: boolean;
    save: () => void;
    discard: () => void;
}

export function useSettingsDraft(): SettingsDraft {
    const snapRef = useRef<Record<string, string>>(snapshotStorage());
    const [isDirty, setIsDirty] = useState(false);
    const [justSaved, setJustSaved] = useState(false);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const recheck = useCallback(() => {
        setIsDirty(computeIsDirty(snapRef.current));
    }, []);

    useEffect(() => {
        // `pulseplay:display-change` fires in the same tab after every setter
        // write (settingsStore, embedConfigStore bridge).
        window.addEventListener('pulseplay:display-change', recheck);
        // Poll as safety net for stores that don't fire the event.
        const t = setInterval(recheck, 500);
        return () => {
            window.removeEventListener('pulseplay:display-change', recheck);
            clearInterval(t);
        };
    }, [recheck]);

    const save = useCallback(() => {
        snapRef.current = snapshotStorage();
        setIsDirty(false);
        setJustSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setJustSaved(false), 3000);
    }, []);

    const discard = useCallback(() => {
        const snap = snapRef.current;
        const current = snapshotStorage();
        // Remove keys added after snapshot.
        for (const k of Object.keys(current)) {
            if (!(k in snap)) localStorage.removeItem(k);
        }
        // Restore snapshot values.
        for (const [k, v] of Object.entries(snap)) {
            localStorage.setItem(k, v);
        }
        // Notify all stores to re-read localStorage.
        window.dispatchEvent(new CustomEvent('pulseplay:display-change'));
        setIsDirty(false);
        setJustSaved(false);
    }, []);

    // Cleanup saved-toast timer on unmount.
    useEffect(() => () => {
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    }, []);

    return { isDirty, justSaved, save, discard };
}
