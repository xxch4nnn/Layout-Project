/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Core Types ---

export type Point = { x: number; y: number };
export type Pin = { componentId: string; holeIndex: number };

export type ComponentType = 'LED' | 'Resistor' | 'Potentiometer' | 'LDR' | 'Pushbutton' | 'Header';

export interface PCBComponent {
    id: string;
    type: ComponentType;
    label: string;
    holes: Point[]; // Relative to the component's anchor (0,0)
    position: Point; // Top-left hole coordinate on the grid
    color?: string;
    rotation: 0 | 90 | 180 | 270;
    width?: number; // In grid units
    height?: number; // In grid units
    analogPin?: 'A0' | 'A1' | 'None';
}

export interface Wire {
    id: string;
    path: Point[]; // Global grid coordinates (can be half-steps)
    color: string;
    startConnection?: { componentId: string; holeIndex: number };
    endConnection?: { componentId: string; holeIndex: number };
}

export interface DesignWarning {
    id: string;
    message: string;
    action: string;
    severity: 'error' | 'warning' | 'info';
    autoFix?: () => void;
}

export interface PathfinderContext {
    wires: Wire[];
    components: PCBComponent[];
    gridCols: number;
    gridRows: number;
    routingAngle: '45' | '90' | 'any';
}
