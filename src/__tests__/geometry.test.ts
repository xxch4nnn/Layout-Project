import { describe, it, expect } from 'vitest';
import { snapToGrid, findNearestPointOnSegment, getHoleGlobalPos } from '../utils/geometry';
import { PCBComponent } from '../types';

describe('Geometry Utilities', () => {
    describe('snapToGrid', () => {
        it('snaps to 0.5 increments by default', () => {
            expect(snapToGrid(1.2, 1.8)).toEqual({ x: 1, y: 2 });
            expect(snapToGrid(1.4, 1.6)).toEqual({ x: 1.5, y: 1.5 });
        });

        it('snaps to full integers when requested', () => {
            expect(snapToGrid(1.2, 1.8, true)).toEqual({ x: 1, y: 2 });
            expect(snapToGrid(1.6, 1.4, true)).toEqual({ x: 2, y: 1 });
        });
    });

    describe('findNearestPointOnSegment', () => {
        const p1 = { x: 0, y: 0 };
        const p2 = { x: 10, y: 0 };

        it('returns points on the segment', () => {
            expect(findNearestPointOnSegment(p1, p2, { x: 5, y: 5 })).toEqual({ x: 5, y: 0 });
            expect(findNearestPointOnSegment(p1, p2, { x: 2, y: -2 })).toEqual({ x: 2, y: 0 });
        });

        it('caps at endpoints', () => {
            expect(findNearestPointOnSegment(p1, p2, { x: -5, y: 0 })).toEqual({ x: 0, y: 0 });
            expect(findNearestPointOnSegment(p1, p2, { x: 15, y: 0 })).toEqual({ x: 10, y: 0 });
        });
    });

    describe('getHoleGlobalPos', () => {
        const components: PCBComponent[] = [
            {
                id: 'c1',
                type: 'Resistor',
                label: 'R1',
                position: { x: 5, y: 5 },
                rotation: 0,
                holes: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
                color: 'blue'
            },
            {
                id: 'c2',
                type: 'LED',
                label: 'D1',
                position: { x: 10, y: 10 },
                rotation: 90,
                holes: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
                color: 'red'
            }
        ];

        it('calculates global position with 0 rotation', () => {
            expect(getHoleGlobalPos(components, 'c1', 0)).toEqual({ x: 5, y: 5 });
            expect(getHoleGlobalPos(components, 'c1', 1)).toEqual({ x: 7, y: 5 });
        });

        it('calculates global position with 90 rotation', () => {
            // (10, 10) + rotate90({1, 0}) = (10, 10) + {0, 1} = (10, 11)
            expect(getHoleGlobalPos(components, 'c2', 1)).toEqual({ x: 10, y: 11 });
        });
    });
});
