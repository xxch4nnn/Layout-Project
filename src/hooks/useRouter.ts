/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import type { Point, PCBComponent, Wire } from '../types';
import { COLORS } from '../constants';
import { getHoleGlobalPos } from '../utils/geometry';
import { findPath } from '../engine/pathfinder';

interface RouterContext {
    components: PCBComponent[];
    wires: Wire[];
    gridCols: number;
    gridRows: number;
    routingAngle: '45' | '90' | 'any';
    getDynamicPath: (wire: Wire) => Point[];
}

export const useRouter = (ctx: RouterContext) => {
    const { components, wires, gridCols, gridRows, routingAngle, getDynamicPath } = ctx;

    const smartRoute = useCallback((targetIds?: string[]) => {
        const newWires: Wire[] = [...wires];
        const pathfinderCtx = { wires: newWires, components, gridCols, gridRows, routingAngle };

        const getNewDynamicPath = (w: Wire) => {
            // For new wires, we just use their path as is for obstruction checking
            return w.path;
        };

        // Helper to find or create a path
        const routeBetween = (startId: string, startHole: number, endId: string, endHole: number, color: string, id: string) => {
            // Check if already exists
            if (newWires.some(w => w.id === id)) return;

            const p1 = getHoleGlobalPos(components, startId, startHole);
            const p2 = getHoleGlobalPos(components, endId, endHole);

            const path = findPath(p1, p2, { ...pathfinderCtx, wires: newWires }, getNewDynamicPath);
            if (path) {
                newWires.push({
                    id,
                    path,
                    color,
                    startConnection: { componentId: startId, holeIndex: startHole },
                    endConnection: { componentId: endId, holeIndex: endHole }
                });
            }
        };

        // 1. Logic for LEDs and Resistors
        for (let i = 0; i < 10; i++) {
            const ledId = `led-${i}`;
            const resId = `res-${i}`;
            const headerId = `header-led-${i}`;

            if (targetIds && !targetIds.includes(ledId) && !targetIds.includes(resId) && !targetIds.includes(headerId)) continue;

            // LED Pin 1 -> Resistor Pin 0
            routeBetween(ledId, 1, resId, 0, COLORS.WIRE_BLUE, `auto-led-res-${i}`);

            // Resistor Pin 1 -> Header
            routeBetween(resId, 1, headerId, 0, COLORS.WIRE_YELLOW, `auto-res-hdr-${i}`);
        }

        // 2. Common GND Rail
        const gndHeaderId = 'header-spec-GND';
        const gndHeaderPos = getHoleGlobalPos(components, gndHeaderId, 0);

        for (let i = 0; i < 10; i++) {
            const ledId = `led-${i}`;
            if (targetIds && !targetIds.includes(ledId) && !targetIds.includes(gndHeaderId)) continue;

            const ledGndPos = getHoleGlobalPos(components, ledId, 0);
            const id = `auto-led-gnd-${i}`;
            if (newWires.some(w => w.id === id)) continue;

            const path = findPath(ledGndPos, gndHeaderPos, { ...pathfinderCtx, wires: newWires }, getNewDynamicPath);
            if (path) {
                newWires.push({
                    id,
                    path,
                    color: COLORS.WIRE_BLACK,
                    startConnection: { componentId: ledId, holeIndex: 0 },
                    endConnection: { componentId: gndHeaderId, holeIndex: 0 }
                });
            }
        }

        return newWires;
    }, [components, wires, gridCols, gridRows, routingAngle, getDynamicPath]);

    return { smartRoute };
};
