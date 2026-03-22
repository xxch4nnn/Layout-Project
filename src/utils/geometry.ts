/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Point, PCBComponent } from '../types';
import { SNAP_RES } from '../constants';

/**
 * Snap coordinates to the grid.
 * @param fullHole - If true, snap to integer grid positions only
 */
export const snapToGrid = (x: number, y: number, fullHole: boolean = false): Point => {
    const res = fullHole ? 1 : SNAP_RES;
    return {
        x: Math.round(x / res) * res,
        y: Math.round(y / res) * res,
    };
};

/**
 * Find the nearest point on a line segment to a given point.
 * Returns the projection clamped to the segment [p1, p2].
 */
export const findNearestPointOnSegment = (p1: Point, p2: Point, p: Point): Point => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx === 0 && dy === 0) return p1;

    const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));

    return {
        x: p1.x + clampedT * dx,
        y: p1.y + clampedT * dy,
    };
};

/**
 * Compute the global grid position of a component's hole,
 * accounting for rotation.
 */
export const getHoleGlobalPos = (components: PCBComponent[], componentId: string, holeIndex: number): Point => {
    const comp = components.find(c => c.id === componentId);
    if (!comp) return { x: 0, y: 0 };

    const hole = comp.holes[holeIndex];
    const rad = (comp.rotation * Math.PI) / 180;
    const cos = Math.round(Math.cos(rad));
    const sin = Math.round(Math.sin(rad));

    const rx = hole.x * cos - hole.y * sin;
    const ry = hole.x * sin + hole.y * cos;

    return {
        x: comp.position.x + rx,
        y: comp.position.y + ry,
    };
};
