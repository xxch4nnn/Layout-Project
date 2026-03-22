/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A* pathfinder engine for PCB wire routing.
 * All functions are pure — no React state dependencies.
 */

import type { Point, PCBComponent, Wire } from '../types';
import { MinHeap } from '../utils/MinHeap';
import { findNearestPointOnSegment, getHoleGlobalPos } from '../utils/geometry';

// --- Types ---

interface PathfinderContext {
    wires: Wire[];
    components: PCBComponent[];
    gridCols: number;
    gridRows: number;
    routingAngle: '45' | '90' | 'any';
}

type DynamicPathFn = (wire: Wire) => Point[];

// --- Helpers ---

/**
 * Chebyshev-diagonal heuristic for A*.
 */
const heuristic = (p1: Point, p2: Point): number => {
    const dx = Math.abs(p1.x - p2.x);
    const dy = Math.abs(p1.y - p2.y);
    return Math.max(dx, dy) + (Math.sqrt(2) - 1) * Math.min(dx, dy);
};

/**
 * Check if a proposed segment intersects any existing wire.
 */
export const intersectsAnyWire = (
    p1: Point,
    p2: Point,
    obstacleWires: Wire[],
    getDynamicPath: DynamicPathFn
): boolean => {
    for (const w of obstacleWires) {
        const wPath = getDynamicPath(w);
        for (let i = 0; i < wPath.length - 1; i++) {
            const w1 = wPath[i];
            const w2 = wPath[i + 1];

            const det = (p2.x - p1.x) * (w2.y - w1.y) - (p2.y - p1.y) * (w2.x - w1.x);
            if (det === 0) continue;
            const lambda = ((w2.y - w1.y) * (w2.x - p1.x) + (w1.x - w2.x) * (w2.y - p1.y)) / det;
            const gamma = ((p1.y - p2.y) * (w2.x - p1.x) + (p2.x - p1.x) * (w2.y - p1.y)) / det;

            if (lambda > 0.01 && lambda < 0.99 && gamma > 0.01 && gamma < 0.99) return true;
        }
    }
    return false;
};

/**
 * A* pathfinder using a proper min-heap.
 * Returns the shortest path from `start` to `end`, or null if unreachable.
 */
export const findPath = (
    start: Point,
    end: Point,
    ctx: PathfinderContext,
    getDynamicPath: DynamicPathFn,
    excludeWireId?: string,
    additionalWires: Wire[] = []
): Point[] | null => {
    type QueueItem = { pos: Point; path: Point[]; cost: number; priority: number };

    const heap = new MinHeap<QueueItem>((a, b) => a.priority - b.priority);
    heap.push({ pos: start, path: [start], cost: 0, priority: 0 });

    const visited = new Set<string>();
    const allObstacleWires = [...ctx.wires.filter(w => w.id !== excludeWireId), ...additionalWires];

    while (heap.size > 0) {
        const { pos, path, cost } = heap.pop()!;

        const key = `${pos.x},${pos.y}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (pos.x === end.x && pos.y === end.y) return path;

        // 8 directions (half-step grid)
        for (let dx = -0.5; dx <= 0.5; dx += 0.5) {
            for (let dy = -0.5; dy <= 0.5; dy += 0.5) {
                if (dx === 0 && dy === 0) continue;

                // Enforce 90° constraint
                if (ctx.routingAngle === '90' && dx !== 0 && dy !== 0) continue;

                const nextPos = { x: pos.x + dx, y: pos.y + dy };
                if (nextPos.x < 0 || nextPos.x >= ctx.gridCols || nextPos.y < 0 || nextPos.y >= ctx.gridRows) continue;

                // Check for segment intersection
                if (intersectsAnyWire(pos, nextPos, allObstacleWires, getDynamicPath)) continue;

                // Cost calculation
                let stepCost = Math.sqrt(dx * dx + dy * dy);

                const isTarget = (nextPos.x === end.x && nextPos.y === end.y);
                const isStart = (nextPos.x === start.x && nextPos.y === start.y);

                let isBlocked = false;
                for (const w of allObstacleWires) {
                    const wPath = getDynamicPath(w);
                    for (let i = 0; i < wPath.length - 1; i++) {
                        const nearest = findNearestPointOnSegment(wPath[i], wPath[i + 1], nextPos);
                        const dist = Math.sqrt((nearest.x - nextPos.x) ** 2 + (nearest.y - nextPos.y) ** 2);

                        if (dist < 0.1) {
                            if (!isTarget && !isStart) {
                                isBlocked = true;
                                break;
                            } else {
                                stepCost += 2;
                            }
                        }
                    }
                    if (isBlocked) break;
                }

                if (isBlocked) continue;

                // Discourage going under components (except at their holes)
                for (const c of ctx.components) {
                    const isHole = c.holes.some((_, idx) => {
                        const h = getHoleGlobalPos(ctx.components, c.id, idx);
                        return Math.abs(h.x - nextPos.x) < 0.1 && Math.abs(h.y - nextPos.y) < 0.1;
                    });
                    if (!isHole) {
                        const cx = c.position.x;
                        const cy = c.position.y;
                        if (nextPos.x >= cx - 0.5 && nextPos.x <= cx + 1.5 && nextPos.y >= cy - 0.5 && nextPos.y <= cy + 0.5) {
                            stepCost += 5;
                        }
                    }
                }

                heap.push({
                    pos: nextPos,
                    path: [...path, nextPos],
                    cost: cost + stepCost,
                    priority: cost + stepCost + heuristic(nextPos, end),
                });
            }
        }

        // Safety break
        if (visited.size > 8000) break;
    }
    return null;
};
