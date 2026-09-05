import { describe, it, expect } from 'vitest';
import { wallJoinExtensions, wallEdgeInsets } from '$lib/utils/canvasRenderer';
import type { Wall } from '$lib/models/types';

const W = (id: string, x1: number, y1: number, x2: number, y2: number, thickness = 20): Wall => ({
  id, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, height: 280, color: '#444444',
});

// A runs east; B turns south from A's end — a plain 90° corner.
const A = W('A', 0, 0, 400, 0);
const B = W('B', 400, 0, 400, 300);

describe('wallJoinExtensions', () => {
  it('extends by half the neighbour’s thickness at a right angle', () => {
    expect(wallJoinExtensions(A, [A, B])).toEqual({ start: 0, end: 10 });
    expect(wallJoinExtensions(B, [A, B])).toEqual({ start: 10, end: 0 });
  });

  it('uses the neighbour’s thickness, not its own', () => {
    const thick = W('T', 400, 0, 400, 300, 40);
    expect(wallJoinExtensions(A, [A, thick]).end).toBe(20);
  });

  it('grows the miter at oblique angles', () => {
    const at45 = W('D', 400, 0, 700, 300);
    // 10 / sin(45°)
    expect(wallJoinExtensions(A, [A, at45]).end).toBeCloseTo(10 * Math.SQRT2, 6);
  });

  it('does not extend into a collinear continuation', () => {
    const straightOn = W('C', 400, 0, 800, 0);
    expect(wallJoinExtensions(A, [A, straightOn])).toEqual({ start: 0, end: 0 });
  });

  it('ignores collinear neighbours but still honours a real corner at the same joint', () => {
    const straightOn = W('C', 400, 0, 800, 0);
    expect(wallJoinExtensions(A, [A, B, straightOn]).end).toBe(10);
  });

  it('does not extend at a T-junction, where no endpoint is shared', () => {
    const stub = W('T', 200, 0, 200, 300); // meets A mid-span
    expect(wallJoinExtensions(A, [A, stub])).toEqual({ start: 0, end: 0 });
  });

  it('clamps runaway miters at very shallow corners', () => {
    const foldBack = W('G', 400, 0, 100, 30); // ~6°, miter would be ~100
    expect(wallJoinExtensions(A, [A, foldBack]).end).toBeLessThanOrEqual(20 * 4);
  });

  it('takes the largest extension when several walls meet at one point', () => {
    const thick = W('T', 400, 0, 400, -300, 50);
    expect(wallJoinExtensions(A, [A, B, thick]).end).toBe(25);
  });

  it('returns zero for an isolated wall', () => {
    expect(wallJoinExtensions(A, [A])).toEqual({ start: 0, end: 0 });
  });
});

describe('wallEdgeInsets', () => {
  it('shortens a wall by half the abutting wall at each end', () => {
    const C = W('C', 0, 0, 0, 300);
    expect(wallEdgeInsets(A, [A, B, C])).toEqual({ start: 10, end: 10 });
  });

  it('ignores collinear continuations', () => {
    const straightOn = W('C', 400, 0, 800, 0);
    expect(wallEdgeInsets(A, [A, straightOn])).toEqual({ start: 0, end: 0 });
  });

  it('is the clear-span complement of the centreline length', () => {
    const C = W('C', 0, 0, 0, 300);
    const ins = wallEdgeInsets(A, [A, B, C]);
    expect(400 - ins.start - ins.end).toBe(380); // 4.00 m axis-to-axis -> 3.80 m clear
  });
});
