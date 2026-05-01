import { describe, expect, it } from 'vitest';
import { calculateEdge, decideSignal } from '../../src/scoring/edge';

describe('calculateEdge', () => {
  it('returns adjusted score minus yes price', () => {
    expect(calculateEdge(0.61, 0.44)).toBeCloseTo(0.17, 8);
  });

  it('returns negative edge when adjusted score is below yes price', () => {
    expect(calculateEdge(0.31, 0.44)).toBeCloseTo(-0.13, 8);
  });
});

describe('decideSignal', () => {
  it('returns BUY_YES when edge is above positive threshold', () => {
    expect(decideSignal({ edge: 0.08, minEdge: 0.03 })).toBe('BUY_YES');
  });

  it('returns BUY_NO when edge is below negative threshold', () => {
    expect(decideSignal({ edge: -0.08, minEdge: 0.03 })).toBe('BUY_NO');
  });

  it('returns HOLD when edge stays inside the neutral band', () => {
    expect(decideSignal({ edge: 0.01, minEdge: 0.03 })).toBe('HOLD');
  });
});
