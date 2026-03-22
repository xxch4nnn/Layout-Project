import { describe, it, expect } from 'vitest';
import { findPath, intersectsAnyWire } from '../engine/pathfinder';
import { PathfinderContext, Wire, PCBComponent } from '../types';

describe('Pathfinder Engine', () => {
    const components: PCBComponent[] = [];
    const wires: Wire[] = [];
    const ctx: PathfinderContext = {
        wires,
        components,
        gridCols: 30,
        gridRows: 20,
        routingAngle: 'any'
    };
    const getDynamicPath = (w: Wire) => w.path;

    describe('findPath', () => {
        it('finds a direct path on an empty grid', () => {
            const start = { x: 0, y: 0 };
            const end = { x: 2, y: 0 };
            const path = findPath(start, end, ctx, getDynamicPath);
            expect(path).toBeDefined();
            expect(path![0]).toEqual(start);
            expect(path![path!.length - 1]).toEqual(end);
        });

        it('returns null if no path is possible (out of bounds)', () => {
            const start = { x: 0, y: 0 };
            const end = { x: 100, y: 100 };
            const path = findPath(start, end, ctx, getDynamicPath);
            expect(path).toBeNull();
        });

        it('respects 90-degree routing', () => {
            const ctx90: PathfinderContext = { ...ctx, routingAngle: '90' };
            const start = { x: 0, y: 0 };
            const end = { x: 1, y: 1 };
            const path = findPath(start, end, ctx90, getDynamicPath);

            // With 0.5 step size, should be 5 points (0,0), (0.5,0), (1,0), (1,0.5), (1,1)
            expect(path).toHaveLength(5);
            expect(path![1].x !== path![0].x && path![1].y !== path![0].y).toBe(false);
        });
    });

    describe('intersectsAnyWire', () => {
        const wire: Wire = {
            id: 'w1',
            path: [{ x: 5, y: 0 }, { x: 5, y: 10 }],
            color: 'blue'
        };

        it('detects intersection with another segment', () => {
            const p1 = { x: 0, y: 5 };
            const p2 = { x: 10, y: 5 };
            expect(intersectsAnyWire(p1, p2, [wire], getDynamicPath)).toBe(true);
        });

        it('does not detect intersection if parallel', () => {
            const p1 = { x: 6, y: 0 };
            const p2 = { x: 6, y: 10 };
            expect(intersectsAnyWire(p1, p2, [wire], getDynamicPath)).toBe(false);
        });

        it('ignores the excluded wire', () => {
            const p1 = { x: 0, y: 5 };
            const p2 = { x: 10, y: 5 };
            const excludedWires = [wire].filter(w => w.id !== 'w1');
            expect(intersectsAnyWire(p1, p2, excludedWires, getDynamicPath)).toBe(false);
        });
    });
});
