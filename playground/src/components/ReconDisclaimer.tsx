// playground/src/components/ReconDisclaimer.tsx
//
// Renders the "Local recon mode" callout mandated by
// docs/DX1_LAUNCHER_CONTRACT.md §11. Two presentations:
//
//   <ReconDisclaimer variant="settings" />  - persistent, NOT dismissable.
//                                              Shown inside Settings -> System.
//   <ReconDisclaimer variant="banner"   />  - top-bar style, dismissable
//                                              per machine via the
//                                              desktopRuntimeClient APIs.
//
// In browser mode (not in the packaged launcher) the component returns
// null - same component, both deployments.

import React, { useState } from "react";
import {
    isDesktopMode,
    isReconDisclaimerDismissed,
    dismissReconDisclaimer,
} from "../lib/desktopRuntimeClient";

const DISCLAIMER_TEXT =
    "Local recon mode. This is a packaged local runtime for inspecting and experimenting with PulsePlay on your own machine. Do not share screenshots that include the launch URL, profile names, or proxy logs. Do not use this build to serve other users.";

interface Props {
    variant: "settings" | "banner";
}

export function ReconDisclaimer({ variant }: Props): React.ReactElement | null {
    const desktop = isDesktopMode();
    const initiallyDismissed = variant === "banner" && desktop ? isReconDisclaimerDismissed() : false;
    const [dismissed, setDismissed] = useState<boolean>(initiallyDismissed);

    if (!desktop) return null;
    if (variant === "banner" && dismissed) return null;

    const onDismiss = () => {
        setDismissed(true);
        void dismissReconDisclaimer();
    };

    const isBanner = variant === "banner";
    return (
        <div
            role="note"
            aria-label="Local recon mode disclaimer"
            data-testid={isBanner ? "pp-recon-banner" : "pp-recon-settings"}
            style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: isBanner ? "10px 16px" : "12px 16px",
                margin: isBanner ? 0 : "0 0 16px",
                background: "rgba(245, 158, 11, 0.10)",
                border: "1px solid rgba(245, 158, 11, 0.45)",
                borderLeftWidth: 4,
                borderRadius: 4,
                color: "#7c2d12",
                fontSize: 13,
                lineHeight: 1.45,
            }}
        >
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
            <div style={{ flex: 1 }}>
                <strong style={{ fontWeight: 600 }}>Local recon mode.</strong>{" "}
                <span>{DISCLAIMER_TEXT.replace(/^Local recon mode\.\s*/, "")}</span>
            </div>
            {isBanner && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss recon disclaimer"
                    data-testid="pp-recon-banner-dismiss"
                    style={{
                        marginLeft: 4,
                        padding: "2px 8px",
                        fontSize: 13,
                        background: "transparent",
                        border: "1px solid rgba(124, 45, 18, 0.30)",
                        borderRadius: 3,
                        color: "inherit",
                        cursor: "pointer",
                        flex: "0 0 auto",
                    }}
                >
                    Dismiss
                </button>
            )}
        </div>
    );
}
