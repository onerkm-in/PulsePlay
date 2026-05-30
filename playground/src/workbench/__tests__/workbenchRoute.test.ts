// playground/src/workbench/__tests__/workbenchRoute.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { isWorkbenchEnabled, parseWorkbenchRoute, setWorkbenchPreviewEnabled } from '../workbenchRoute';

beforeEach(() => {
    try { window.localStorage.removeItem('pulseplay:workbench-preview'); } catch { /* swallow */ }
});

describe('parseWorkbenchRoute', () => {
    it('matches /workbench exactly', () => {
        expect(parseWorkbenchRoute('/workbench')).toBe(true);
    });
    it('matches /workbench/...', () => {
        expect(parseWorkbenchRoute('/workbench/conversation/x')).toBe(true);
    });
    it('does not match /workbenchxyz', () => {
        expect(parseWorkbenchRoute('/workbenchxyz')).toBe(false);
    });
    it('does not match unrelated paths', () => {
        expect(parseWorkbenchRoute('/settings')).toBe(false);
        expect(parseWorkbenchRoute('/')).toBe(false);
    });
});

describe('isWorkbenchEnabled', () => {
    it('returns false by default', () => {
        expect(isWorkbenchEnabled()).toBe(false);
    });
    it('returns true after setWorkbenchPreviewEnabled(true)', () => {
        setWorkbenchPreviewEnabled(true);
        expect(isWorkbenchEnabled()).toBe(true);
    });
    it('returns false after setWorkbenchPreviewEnabled(false)', () => {
        setWorkbenchPreviewEnabled(true);
        expect(isWorkbenchEnabled()).toBe(true);
        setWorkbenchPreviewEnabled(false);
        expect(isWorkbenchEnabled()).toBe(false);
    });
});
