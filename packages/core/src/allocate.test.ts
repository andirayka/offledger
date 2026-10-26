import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { allocate } from './allocate';

fc.configureGlobal({ seed: 20261027, numRuns: 1000 });

const total = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
const parts = fc.integer({ min: 1, max: 50 });

describe('allocate', () => {
  it('never creates or loses a cent', () => {
    fc.assert(
      fc.property(total, parts, (t, n) => {
        expect(allocate(t, n).reduce((a, b) => a + b, 0)).toBe(t);
      }),
    );
  });

  it('returns exactly one integer share per part', () => {
    fc.assert(
      fc.property(total, parts, (t, n) => {
        const shares = allocate(t, n);
        expect(shares).toHaveLength(n);
        expect(shares.every(Number.isInteger)).toBe(true);
      }),
    );
  });

  it('keeps shares within one cent of each other', () => {
    fc.assert(
      fc.property(total, parts, (t, n) => {
        const shares = allocate(t, n);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('gives leftover cents to the earliest parts', () => {
    fc.assert(
      fc.property(total, parts, (t, n) => {
        const magnitudes = allocate(t, n).map(Math.abs);
        expect(magnitudes).toEqual(magnitudes.toSorted((a, b) => b - a));
      }),
    );
  });

  it('splits a debt as the mirror of a credit', () => {
    fc.assert(
      fc.property(total, parts, (t, n) => {
        expect(allocate(-t, n)).toEqual(allocate(t, n).map((share) => -share || 0));
      }),
    );
  });

  it('splits 100 cents three ways as 34, 33, 33', () => {
    expect(allocate(100, 3)).toEqual([34, 33, 33]);
    expect(allocate(-100, 3)).toEqual([-34, -33, -33]);
  });

  it.each([
    [10.5, 2],
    [Number.NaN, 2],
    [2 ** 53, 2],
    [100, 0],
    [100, 1.5],
    [100, -1],
  ])('rejects allocate(%s, %s)', (t, n) => {
    expect(() => allocate(t, n)).toThrow(RangeError);
  });
});
