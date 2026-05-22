// playground/vitest.setup.ts
//
// React 19 requires every test runner that calls `act()` to opt in via
// the global flag below. Without it, vitest emits "The current testing
// environment is not configured to support act(...)" warnings and the
// component never actually flushes state, so async assertions (fetch
// calls, polling transitions, DOM queries) all fail.
//
// Reference:
//   https://github.com/reactwg/react-18/discussions/102
//   https://react.dev/reference/react/act#act-is-not-supported-in-test-environments
//
// Vitest picks this up via setupFiles in vitest.config.ts.

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ECharts uses HTMLCanvasElement.getContext('2d'). jsdom returns null,
// which crashes zrender. Provide a no-op 2D context shim sufficient for
// ECharts to draw without throwing. We do not assert on pixels — only on
// the host element being present — so the stub does not need to track
// state.
if (typeof HTMLCanvasElement !== 'undefined') {
    const noop = () => undefined;
    const fakeContext = new Proxy({}, {
        get: (target, prop) => {
            if (prop === 'canvas') return null;
            if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray() });
            if (prop === 'createImageData') return () => ({ data: new Uint8ClampedArray() });
            if (prop === 'measureText') return () => ({ width: 0 });
            if (prop === 'getLineDash') return () => [];
            if (prop === 'isPointInPath' || prop === 'isPointInStroke') return () => false;
            return noop;
        },
    });
    HTMLCanvasElement.prototype.getContext = function getContext() {
        return fakeContext as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;
}

export {};
