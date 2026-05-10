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

export {};
