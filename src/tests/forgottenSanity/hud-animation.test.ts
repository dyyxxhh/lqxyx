import { describe, it, expect, vi } from 'vitest';

describe('HUD animation helpers', () => {
  it('smoothBarValue interpolates between current and target', async () => {
    const { smoothBarValue } = await import('../../forgottenSanity/ui/ForgottenSanityHUD');
    expect(smoothBarValue(100, 80, 0.5)).toBeCloseTo(90, 0);
    expect(smoothBarValue(100, 80, 1.0)).toBe(80);
    expect(smoothBarValue(100, 80, 0)).toBe(100);
  });
});
