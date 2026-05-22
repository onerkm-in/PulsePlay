// playground/src/settings/SettingsSaveBar.tsx
//
// Sticky footer bar that appears inside SettingsShell whenever the author
// has made changes since opening settings. Gives an explicit Save / Discard
// commit step on top of the underlying fire-and-forget store writes.

import type { SettingsDraft } from './useSettingsDraft';

interface SettingsSaveBarProps {
    draft: SettingsDraft;
}

export function SettingsSaveBar({ draft }: SettingsSaveBarProps): React.ReactElement | null {
    const { isDirty, justSaved, save, discard } = draft;

    if (!isDirty && !justSaved) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 20px',
                background: justSaved && !isDirty
                    ? 'rgba(16, 185, 129, 0.10)'
                    : 'rgba(0, 120, 212, 0.06)',
                borderTop: `1px solid ${justSaved && !isDirty
                    ? 'rgba(16, 185, 129, 0.30)'
                    : 'rgba(0, 120, 212, 0.18)'}`,
                transition: 'background 0.2s ease, border-color 0.2s ease',
            }}
        >
            <span
                style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: justSaved && !isDirty ? '#065f46' : '#004a8c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
                {justSaved && !isDirty ? (
                    <>
                        <span aria-hidden="true" style={{ fontSize: 15 }}>✓</span>
                        Settings saved
                    </>
                ) : (
                    <>
                        <span
                            aria-hidden="true"
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#0078d4',
                                display: 'inline-block',
                                animation: 'pp-save-pulse 1.8s ease-in-out infinite',
                            }}
                        />
                        Unsaved changes
                    </>
                )}
            </span>

            {isDirty && (
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={discard}
                        style={{
                            padding: '6px 14px',
                            fontSize: 13,
                            border: '1px solid rgba(0,0,0,0.18)',
                            background: 'transparent',
                            borderRadius: 4,
                            cursor: 'pointer',
                            color: 'inherit',
                        }}
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        style={{
                            padding: '6px 16px',
                            fontSize: 13,
                            border: 'none',
                            background: 'var(--pp-accent, #0078d4)',
                            color: '#fff',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Save changes
                    </button>
                </div>
            )}
        </div>
    );
}
