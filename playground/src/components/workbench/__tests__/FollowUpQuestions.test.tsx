// playground/src/components/workbench/__tests__/FollowUpQuestions.test.tsx

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { FollowUpQuestions } from '../FollowUpQuestions';

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

describe('FollowUpQuestions', () => {
    it('renders nothing when questions is empty', () => {
        mounted = mount(<FollowUpQuestions questions={[]} onAsk={() => {}} />);
        expect(mounted.container.querySelector('[data-testid="workbench-followups"]')).toBeNull();
    });

    it('renders nothing when every question is empty / whitespace', () => {
        mounted = mount(<FollowUpQuestions questions={['', '   ', '']} onAsk={() => {}} />);
        expect(mounted.container.querySelector('[data-testid="workbench-followups"]')).toBeNull();
    });

    it('renders a chip per question with the question text', () => {
        mounted = mount(<FollowUpQuestions questions={['By region?', 'YoY change?']} onAsk={() => {}} />);
        const chips = Array.from(mounted.container.querySelectorAll<HTMLButtonElement>('[data-testid^="workbench-followup-chip-"]'));
        expect(chips).toHaveLength(2);
        expect(chips[0].textContent).toBe('By region?');
        expect(chips[1].textContent).toBe('YoY change?');
    });

    it('calls onAsk with the question text on click', () => {
        const onAsk = vi.fn();
        mounted = mount(<FollowUpQuestions questions={['By region?']} onAsk={onAsk} />);
        const chip = mounted.container.querySelector<HTMLButtonElement>('[data-testid="workbench-followup-chip-0"]')!;
        act(() => { chip.click(); });
        expect(onAsk).toHaveBeenCalledWith('By region?');
    });

    it('clamps to maxChips (default 5) and never truncates the survivors', () => {
        mounted = mount(<FollowUpQuestions questions={['a', 'b', 'c', 'd', 'e', 'f', 'g']} onAsk={() => {}} />);
        const chips = mounted.container.querySelectorAll<HTMLButtonElement>('[data-testid^="workbench-followup-chip-"]');
        expect(chips).toHaveLength(5);
    });

    it('honors maxChips override', () => {
        mounted = mount(<FollowUpQuestions questions={['a', 'b', 'c']} onAsk={() => {}} maxChips={2} />);
        const chips = mounted.container.querySelectorAll<HTMLButtonElement>('[data-testid^="workbench-followup-chip-"]');
        expect(chips).toHaveLength(2);
    });

    it('disables all chips when disabled=true', () => {
        mounted = mount(<FollowUpQuestions questions={['a', 'b']} onAsk={() => {}} disabled />);
        const chips = Array.from(mounted.container.querySelectorAll<HTMLButtonElement>('[data-testid^="workbench-followup-chip-"]'));
        chips.forEach((c) => expect(c.disabled).toBe(true));
    });
});
