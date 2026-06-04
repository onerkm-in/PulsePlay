// playground/src/components/AppErrorBoundary.tsx
//
// Top-level React error boundary. Wraps the whole <App /> at the root so a
// throw in ANY component (a settings group, BIPanel, a route shell, the
// surface switcher — anything outside the wizard/pulse boundaries that already
// have their own) shows a friendly, actionable recovery screen instead of
// unmounting the tree to a blank white page.
//
// Deliberately dependency-free: no theme tokens, no external CSS, no app
// imports. It must render even when the failure is in styling or a core
// provider. Self-contained inline styles are high-contrast on any background.
//
// Philosophy (same as the #11 insights fix): SURFACE the error, never swallow
// it. The message + component stack are shown (collapsible) and logged so the
// user/developer can see the real cause, not a generic "something went wrong".

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
    info: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
    state: State = { error: null, info: null };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Log loudly — a top-level crash must be visible in the console with the
        // component stack, not silently lost.
        // eslint-disable-next-line no-console
        console.error("[PulsePlay] Uncaught render error:", error, info?.componentStack);
        this.setState({ info });
    }

    private handleReload = (): void => {
        try {
            window.location.reload();
        } catch {
            /* nothing more we can do */
        }
    };

    private handleTryAgain = (): void => {
        this.setState({ error: null, info: null });
    };

    render(): ReactNode {
        const { error, info } = this.state;
        if (!error) return this.props.children;

        return (
            <div
                role="alert"
                aria-live="assertive"
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                    background: "#0d1117",
                    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                }}
            >
                <div
                    style={{
                        maxWidth: 560,
                        width: "100%",
                        background: "#ffffff",
                        color: "#1f2937",
                        border: "1px solid #d0d7de",
                        borderRadius: 12,
                        padding: "28px 28px 24px",
                        boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
                    }}
                >
                    <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 12 }} aria-hidden="true">
                        ⚠️
                    </div>
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
                        Something went wrong
                    </h1>
                    <p style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px", color: "#4b5563" }}>
                        PulsePlay hit an unexpected error and couldn't render this view. Your
                        configuration is safe — try again, or reload the app.
                    </p>
                    <details style={{ margin: "0 0 18px" }}>
                        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#b42318" }}>
                            Error details
                        </summary>
                        <pre
                            style={{
                                marginTop: 8,
                                padding: 12,
                                background: "#f6f8fa",
                                border: "1px solid #d0d7de",
                                borderRadius: 8,
                                fontSize: 12,
                                lineHeight: 1.4,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                maxHeight: 220,
                                overflow: "auto",
                            }}
                        >
                            {error.message}
                            {info?.componentStack ? `\n${info.componentStack}` : ""}
                        </pre>
                    </details>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            type="button"
                            onClick={this.handleTryAgain}
                            style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "1px solid #d0d7de",
                                background: "#ffffff",
                                color: "#1f2937",
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: "pointer",
                            }}
                        >
                            Try again
                        </button>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "1px solid #1f6feb",
                                background: "#1f6feb",
                                color: "#ffffff",
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: "pointer",
                            }}
                        >
                            Reload app
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
