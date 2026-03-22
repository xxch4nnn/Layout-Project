/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Layout Constants ---

export const HOLE_SPACING = 25; // pixels
export const HOLE_RADIUS = 4;
export const PCB_PADDING = 40;
export const SNAP_RES = 0.5; // Snap to half-grid

export const COLORS = {
    PCB_GREEN: 'var(--color-pcb-green)',
    PCB_DARK: 'var(--color-pcb-dark)',
    COPPER: 'var(--color-copper)',
    SILVER: 'var(--color-solder)',
    LED_RED: '#ef4444',
    WIRE_RED: '#ef4444',
    WIRE_BLACK: '#171717',
    WIRE_BLUE: '#3b82f6',
    WIRE_YELLOW: '#eab308',
} as const;
