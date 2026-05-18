// playground/src/components/workbench/__tests__/SqlTabSections.test.tsx
//
// Step 6 — SqlTab labelled-sections rendering. Verifies the additive
// behavior: when sqlSections is empty/absent, fall back to a single <pre>;
// when present, render a subtab strip with the canonical "Full SQL" tab
// first, followed by one tab per labelled section.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { SqlTab } from '../ArtifactTabs';

interface MountState { container: HTMLElement; root: Root; }
function mount(ui: React.ReactNode): MountState {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, root };
}
function unmount(state: MountState) {
    act(() => { state.root.unmount(); });
    state.container.remove();
}
let mounted: MountState | null = null;
beforeEach(() => { mounted = null; });
afterEach(() => { if (mounted) unmount(mounted); mounted = null; });

describe('SqlTab — labelled section rendering', () => {
    it('falls back to a single <pre> when sections is absent', () => {
        mounted = mount(<SqlTab sql="SELECT 1" />);
        expect(mounted.container.querySelector('[data-testid="artifact-tab-sql"]')).not.toBeNull();
        expect(mounted.container.querySelectorAll('.workbench-sql-section-btn')).toHaveLength(0);
        expect(mounted.container.querySelector('code')?.textContent).toBe('SELECT 1');
    });

    it('falls back to a single <pre> when sections is an empty array', () => {
        mounted = mount(<SqlTab sql="SELECT 1" sections={[]} />);
        expect(mounted.container.querySelectorAll('.workbench-sql-section-btn')).toHaveLength(0);
        expect(mounted.container.querySelector('code')?.textContent).toBe('SELECT 1');
    });

    it('renders empty-state when neither sql nor sections is provided', () => {
        mounted = mount(<SqlTab sql={undefined} />);
        expect(mounted.container.querySelector('.workbench-tab-empty')?.textContent).toBe('No SQL attached.');
    });

    it('renders Full SQL + one tab per labelled section when both are present', () => {
        mounted = mount(<SqlTab
            sql="SELECT 1 AS headline UNION ALL SELECT 2 AS trend"
            sections={[
                { sectionId: 'HEADLINE', cteName: 'headline', sqlFragment: 'SELECT 1 AS headline' },
                { sectionId: 'TRENDS', sqlFragment: 'SELECT 2 AS trend' },
            ]}
        />);
        const buttons = Array.from(mounted.container.querySelectorAll<HTMLButtonElement>('.workbench-sql-section-btn'));
        expect(buttons).toHaveLength(3);
        expect(buttons.map((b) => b.textContent)).toEqual(['Full SQL', 'HEADLINE (headline)', 'TRENDS']);
        // Default active: Full SQL.
        expect(buttons[0].getAttribute('aria-selected')).toBe('true');
        expect(buttons[1].getAttribute('aria-selected')).toBe('false');
        // Body shows canonical SQL by default.
        expect(mounted.container.querySelector('[data-testid="artifact-sql-section-body-canonical"]')?.textContent).toContain('SELECT 1 AS headline');
    });

    it('clicking a section subtab swaps the body', () => {
        mounted = mount(<SqlTab
            sql="SELECT 1"
            sections={[
                { sectionId: 'HEADLINE', sqlFragment: 'SELECT 1 AS headline_kpi' },
                { sectionId: 'TRENDS', sqlFragment: 'SELECT month FROM trend_view' },
            ]}
        />);
        const trendsBtn = mounted.container.querySelector<HTMLButtonElement>('[data-testid="artifact-sql-section-btn-section-TRENDS"]')!;
        act(() => { trendsBtn.click(); });
        expect(trendsBtn.getAttribute('aria-selected')).toBe('true');
        const body = mounted.container.querySelector('[data-testid="artifact-sql-section-body-section-TRENDS"]')!;
        expect(body.textContent).toContain('SELECT month FROM trend_view');
    });

    it('drops malformed sections (missing sectionId or empty sqlFragment) defensively', () => {
        mounted = mount(<SqlTab
            sql="SELECT 1"
            sections={[
                { sectionId: '', sqlFragment: 'still has sql' },
                { sectionId: 'OK', sqlFragment: '' },
                { sectionId: 'GOOD', sqlFragment: 'SELECT 2' },
            ]}
        />);
        const buttons = Array.from(mounted.container.querySelectorAll<HTMLButtonElement>('.workbench-sql-section-btn'));
        // Full SQL + GOOD; the two malformed sections are dropped.
        expect(buttons.map((b) => b.textContent)).toEqual(['Full SQL', 'GOOD']);
    });

    it('omits the canonical Full SQL tab when only sections is supplied', () => {
        mounted = mount(<SqlTab
            sql={undefined}
            sections={[{ sectionId: 'HEADLINE', sqlFragment: 'SELECT 1' }]}
        />);
        const buttons = Array.from(mounted.container.querySelectorAll<HTMLButtonElement>('.workbench-sql-section-btn'));
        expect(buttons.map((b) => b.textContent)).toEqual(['HEADLINE']);
    });
});
