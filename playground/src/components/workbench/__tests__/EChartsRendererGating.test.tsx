import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EChartsRenderer, scheduleChartInit } from "../EChartsRenderer";

/**
 * A Dashboard of pinned tiles mounts every renderer in one React commit, so
 * every echarts.init + setOption ran in the same frame - the canvas paid full
 * layout cost for tiles nobody had scrolled to, and the main thread stalled in
 * proportion to tile count.
 *
 * These pin the two policies that fix it, and - just as importantly - that the
 * NO-IntersectionObserver path still initialises immediately, because that is
 * the behaviour every other test in the repo depends on.
 */

// A complete cartesian option: a bar series without axes makes ECharts throw
// "xAxis 0 not found" at init, which would mask what these tests are checking.
const OPTION = {
    xAxis: { type: "category" as const, data: ["a", "b", "c"] },
    yAxis: { type: "value" as const },
    series: [{ type: "bar" as const, data: [1, 2, 3] }],
};

/** Controllable IntersectionObserver: nothing intersects until released. */
function installFakeIO() {
    const observed: Array<{ el: Element; fire: () => void }> = [];
    class FakeIO {
        constructor(private cb: IntersectionObserverCallback) { }
        observe(el: Element) {
            observed.push({
                el,
                fire: () => this.cb(
                    [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
                    this as unknown as IntersectionObserver,
                ),
            });
        }
        disconnect() { /* no-op for the test */ }
        unobserve() { /* no-op for the test */ }
        takeRecords() { return []; }
    }
    vi.stubGlobal("IntersectionObserver", FakeIO as unknown as typeof IntersectionObserver);
    return observed;
}

describe("EChartsRenderer initialisation gating", () => {
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it("initialises IMMEDIATELY when IntersectionObserver is unavailable", () => {
        // jsdom's default - and the path every pre-existing test relies on
        expect(typeof IntersectionObserver).toBe("undefined");
        const { container } = render(<EChartsRenderer option={OPTION} />);
        const host = container.querySelector('[data-testid="echarts-host"]')!;
        // ECharts stamps its instance onto the host element
        expect(host.getAttribute("_echarts_instance_")).toBeTruthy();
    });

    it("does NOT initialise while the host is off-screen", () => {
        installFakeIO();
        const { container } = render(<EChartsRenderer option={OPTION} />);
        const host = container.querySelector('[data-testid="echarts-host"]')!;
        expect(host.getAttribute("_echarts_instance_")).toBeFalsy();
    });

    it("initialises once the host scrolls into view", async () => {
        const observed = installFakeIO();
        const { container } = render(<EChartsRenderer option={OPTION} />);
        const host = container.querySelector('[data-testid="echarts-host"]')!;
        expect(host.getAttribute("_echarts_instance_")).toBeFalsy();

        observed.forEach(o => o.fire());
        // one chart per animation frame
        await new Promise(r => requestAnimationFrame(() => r(null)));
        await new Promise(r => setTimeout(r, 0));

        expect(host.getAttribute("_echarts_instance_")).toBeTruthy();
    });
});

describe("scheduleChartInit runs one initialisation per frame", () => {
    // The queue's drain flag is module state, so each case gets a fresh module.
    beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });
    afterEach(() => vi.unstubAllGlobals());

    it("never runs two in the same frame, and keeps FIFO order", async () => {
        let frame = 0;
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            frame += 1;
            const thisFrame = frame;
            setTimeout(() => cb(thisFrame), 0);
            return thisFrame;
        });
        const { scheduleChartInit: schedule } = await import("../EChartsRenderer");

        const order: number[] = [];
        const framesSeen: number[] = [];
        for (let i = 0; i < 4; i++) {
            schedule(() => { order.push(i); framesSeen.push(frame); });
        }
        await new Promise(r => setTimeout(r, 80));

        expect(order).toEqual([0, 1, 2, 3]);                  // FIFO, no reordering
        expect(new Set(framesSeen).size).toBe(order.length);  // a distinct frame each
    });

    it("runs synchronously when there is no animation frame to wait for", async () => {
        vi.stubGlobal("requestAnimationFrame", undefined);
        const { scheduleChartInit: schedule } = await import("../EChartsRenderer");
        let ran = false;
        schedule(() => { ran = true; });
        expect(ran).toBe(true);
    });
});
