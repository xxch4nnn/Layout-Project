/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Cpu, Layers, FlipHorizontal, Settings2, Zap, MousePointer2, RotateCcw, Download, Eye, EyeOff, Trash2, ChevronUp, ChevronDown, LogIn, LogOut, Save, RefreshCw, ArrowLeftRight, Plus, Undo2, Redo2, Grid3X3, Activity, AlertTriangle, Info, Maximize2, Minimize2, Share2, History, Box, Wand2, X, Lightbulb, CircleDashed, Menu, ToggleLeft, GitMerge, Grid, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import {
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import {
  doc,
  setDoc,
  onSnapshot,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';

import type { Point, Pin, PCBComponent, Wire, DesignWarning } from './types';
import { HOLE_SPACING, HOLE_RADIUS, PCB_PADDING, SNAP_RES, COLORS } from './constants';
import { snapToGrid, findNearestPointOnSegment, getHoleGlobalPos as getHoleGlobalPosUtil } from './utils/geometry';
import { findPath as findPathEngine, intersectsAnyWire as intersectsAnyWireEngine } from './engine/pathfinder';
import { useRouter } from './hooks/useRouter';

// --- Initial State Helpers ---

const createInitialComponents = (): PCBComponent[] => {
  const components: PCBComponent[] = [];
  for (let i = 0; i < 10; i++) {
    components.push({
      id: `led-${i}`,
      type: 'LED',
      label: `L${i + 1}`,
      holes: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      position: { x: 2 + i * 2, y: 2 },
      color: COLORS.LED_RED,
      rotation: 0,
    });
    components.push({
      id: `res-${i}`,
      type: 'Resistor',
      label: `R${i + 1}`,
      holes: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      position: { x: 3 + i * 2, y: 5 },
      rotation: 90,
      width: 4,
    });
  }

  components.push({
    id: 'pot-1',
    type: 'Potentiometer',
    label: 'POT',
    holes: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }],
    position: { x: 4, y: 15 },
    rotation: 0,
    width: 4,
    analogPin: 'A0',
  });
  components.push({
    id: 'ldr-1',
    type: 'LDR',
    label: 'LDR',
    holes: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    position: { x: 12, y: 15 },
    rotation: 0,
    analogPin: 'A1',
  });
  components.push({
    id: 'res-ldr',
    type: 'Resistor',
    label: 'RLDR',
    holes: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
    position: { x: 12, y: 18 },
    rotation: 90,
    width: 4,
  });
  components.push({
    id: 'btn-1',
    type: 'Pushbutton',
    label: 'BTN',
    holes: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }, { x: 4, y: 2 }],
    position: { x: 16, y: 14 },
    rotation: 0,
    width: 4,
    height: 2,
  });
  components.push({
    id: 'res-btn',
    type: 'Resistor',
    label: 'RBTN',
    holes: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
    position: { x: 20, y: 18 },
    rotation: 90,
    width: 4,
  });

  for (let i = 0; i < 10; i++) {
    components.push({
      id: `header-led-${i}`,
      type: 'Header',
      label: `H${i + 1}`,
      holes: [{ x: 0, y: 0 }],
      position: { x: 3 + i * 2, y: 21 },
      rotation: 0,
    });
  }
  components.push({
    id: `header-led-10`,
    type: 'Header',
    label: 'HB',
    holes: [{ x: 0, y: 0 }],
    position: { x: 20, y: 25 },
    rotation: 0,
  });
  const specialHeaders = [
    { label: 'A0', x: 6 },
    { label: 'A1', x: 13 },
    { label: 'GND', x: 2 },
    { label: 'VCC', x: 22 }
  ];
  specialHeaders.forEach((h) => {
    components.push({
      id: `header-spec-${h.label}`,
      type: 'Header',
      label: h.label,
      holes: [{ x: 0, y: 0 }],
      position: { x: h.x, y: 28 },
      rotation: 0,
    });
  });
  return components;
};

// --- App Component ---


const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'face' | 'bottom'>('face');
  const [gridCols, setGridCols] = useState(() => {
    const saved = localStorage.getItem('pcb_gridCols');
    return saved ? JSON.parse(saved) : 30;
  });
  const [gridRows, setGridRows] = useState(() => {
    const saved = localStorage.getItem('pcb_gridRows');
    return saved ? JSON.parse(saved) : 24;
  });
  const [components, setComponents] = useState<PCBComponent[]>(() => {
    const saved = localStorage.getItem('pcb_components');
    return saved ? JSON.parse(saved) : createInitialComponents();
  });
  const [wires, setWires] = useState<Wire[]>(() => {
    const saved = localStorage.getItem('pcb_wires');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [reverseGridCols, setReverseGridCols] = useState(false);
  const [reverseGridRows, setReverseGridRows] = useState(false);
  const [routingAngle, setRoutingAngle] = useState<'45' | '90' | 'any'>(() => {
    const saved = localStorage.getItem('pcb_routingAngle');
    return (saved === '45' || saved === '90' || saved === 'any') ? saved : '45';
  });
  const [isSaving, setIsSaving] = useState(false);

  const isFirstMount = useRef(true);

  // --- Initial Wiring Setup ---
  useEffect(() => {
    if (isFirstMount.current && components.length > 0 && wires.length === 0) {
      smartRouteAll();
      isFirstMount.current = false;
    }
  }, [components]);

  // --- Firebase Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === "auth/unauthorized-domain") {
        alert("Firebase Login Domain Unauthorized. Try local saving instead for now.");
      } else {
        console.error("Login failed:", error);
      }
    }
  };

  const logout = () => signOut(auth);

  // --- Persistence ---
  useEffect(() => {
    if (!user) return;

    const layoutDoc = doc(db, 'layouts', user.uid);
    const unsubscribe = onSnapshot(layoutDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        // Only update if local state is different to avoid loops
        if (data.components) setComponents(data.components);
        if (data.wires) setWires(data.wires);
        if (data.gridCols) setGridCols(data.gridCols);
        if (data.gridRows) setGridRows(data.gridRows);
        if (data.routingAngle) setRoutingAngle(data.routingAngle);
        if (data.reverseGridCols !== undefined) setReverseGridCols(data.reverseGridCols);
        if (data.reverseGridRows !== undefined) setReverseGridRows(data.reverseGridRows);
      }
    }, (error) => {
      console.error("Firestore sync error:", error);
    });

    return () => unsubscribe();
  }, [user]);


  useEffect(() => {
    localStorage.setItem('pcb_components', JSON.stringify(components));
    localStorage.setItem('pcb_wires', JSON.stringify(wires));
    localStorage.setItem('pcb_gridCols', JSON.stringify(gridCols));
    localStorage.setItem('pcb_gridRows', JSON.stringify(gridRows));
    localStorage.setItem('pcb_routingAngle', routingAngle);
  }, [components, wires, gridCols, gridRows, routingAngle]);

  // Debounced save

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await setDoc(doc(db, 'layouts', user.uid), {
          uid: user.uid,
          components,
          wires,
          gridCols,
          gridRows,
          routingAngle,
          reverseGridCols,
          reverseGridRows,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.error("Save error:", error);
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [components, wires, gridCols, gridRows, routingAngle, reverseGridCols, reverseGridRows, user, isAuthReady]);

  // History for Undo

  // --- Component Spawning ---
  const spawnComponent = (type: PCBComponent['type']) => {
    saveHistory();
    const centerX = Math.floor(gridCols / 2);
    const centerY = Math.floor(gridRows / 2);

    const typeCount = components.filter(c => c.type === type).length;
    let label = '';
    let width = 1;
    let height = 1;
    let holes: PCBComponent['holes'] = [];
    let color = undefined;

    switch (type) {
      case 'Resistor':
        label = `R${typeCount + 1}`;
        width = 4;
        height = 1;
        holes = [{ x: 0, y: 0 }, { x: 3, y: 0 }];
        break;
      case 'LED':
        label = `D${typeCount + 1}`;
        width = 2;
        height = 2;
        holes = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
        color = COLORS.LED_RED;
        break;
      case 'Potentiometer':
        label = `RV${typeCount + 1}`;
        width = 3;
        height = 3;
        holes = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 1 }];
        break;
      case 'LDR':
        label = `LDR${typeCount + 1}`;
        width = 2;
        height = 2;
        holes = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
        break;
      case 'Pushbutton':
        label = `SW${typeCount + 1}`;
        width = 4;
        height = 4;
        holes = [
          { x: 0, y: 0 }, { x: 3, y: 0 },
          { x: 0, y: 3 }, { x: 3, y: 3 }
        ];
        break;
      case 'Header':
        label = `J${typeCount + 1}`;
        width = 4;
        height = 1;
        holes = Array.from({ length: 4 }).map((_, i) => ({ x: i, y: 0 }));
        break;
    }

    const newComp: PCBComponent = {
      id: `comp-${Date.now()}`,
      type,
      label,
      position: { x: centerX - Math.floor(width / 2), y: Math.max(0, centerY - Math.floor(height / 2)) },
      rotation: 0,
      holes,
      color
    };

    setComponents(prev => [...prev, newComp]);
    setSelectedIds([newComp.id]);
  };

  type HistoryState = { components: PCBComponent[]; wires: Wire[] };
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const saveHistory = useCallback(() => {
    setHistory(prev => {
      const newState = { components: JSON.parse(JSON.stringify(components)), wires: JSON.parse(JSON.stringify(wires)) };
      return [newState, ...prev].slice(0, 20);
    });
    setFuture([]); // New action invalidates redo stack
  }, [components, wires]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    // Push current state to future for redo
    setFuture(prev => [{ components: JSON.parse(JSON.stringify(components)), wires: JSON.parse(JSON.stringify(wires)) }, ...prev]);
    const [lastState, ...rest] = history;
    setComponents(lastState.components);
    setWires(lastState.wires);
    setHistory(rest);
  }, [history, components, wires]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    // Push current state to history
    setHistory(prev => [{ components: JSON.parse(JSON.stringify(components)), wires: JSON.parse(JSON.stringify(wires)) }, ...prev]);
    const [nextState, ...rest] = future;
    setComponents(nextState.components);
    setWires(nextState.wires);
    setFuture(rest);
  }, [future, components, wires]);

  // Routing State
  const [routingMode, setRoutingMode] = useState(false);
  const [traceColor, setTraceColor] = useState(COLORS.WIRE_BLUE);
  const [activeWirePath, setActiveWirePath] = useState<Point[]>([]);

  const { smartRoute } = useRouter({
    components,
    wires,
    gridCols,
    gridRows,
    routingAngle,
    getDynamicPath: (wire: Wire) => {
      const newPath = [...wire.path];
      if (wire.startConnection) {
        newPath[0] = getHoleGlobalPosUtil(components, wire.startConnection.componentId, wire.startConnection.holeIndex);
      }
      if (wire.endConnection) {
        newPath[newPath.length - 1] = getHoleGlobalPosUtil(components, wire.endConnection.componentId, wire.endConnection.holeIndex);
      }
      return newPath;
    }
  });

  // Selection Box State
  const [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);

  // Wire Selection/Manipulation State
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [draggingWirePoint, setDraggingWirePoint] = useState<{ wireId: string; pointIndex: number } | null>(null);
  const [vccDaisyChainOrder, setVccDaisyChainOrder] = useState<string[]>(['pot-1', 'ldr-1', 'btn-1']);

  const handleExportImage = async () => {
    const pcbElement = document.getElementById('pcb-svg-container');
    if (!pcbElement) return;

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(pcbElement, {
        backgroundColor: '#171717',
        scale: 2,
        logging: false,
        useCORS: true
      });

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `pcb-design-${Date.now()}.png`;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const rotateBoard = () => {
    saveHistory();
    const oldCols = gridCols;
    const oldRows = gridRows;

    // Swap grid dimensions
    setGridCols(oldRows);
    setGridRows(oldCols);

    // Rotate components: (x, y) -> (y, oldCols - 1 - x)
    // We also need to rotate the component itself
    setComponents(prev => prev.map(c => ({
      ...c,
      position: {
        x: c.position.y,
        y: oldCols - 1 - c.position.x
      },
      rotation: ((c.rotation + 90) % 360) as 0 | 90 | 180 | 270
    })));

    // Rotate wires
    setWires(prev => prev.map(w => ({
      ...w,
      path: w.path.map(p => ({
        x: p.y,
        y: oldCols - 1 - p.x
      }))
    })));
  };

  const moveVccItem = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...vccDaisyChainOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setVccDaisyChainOrder(newOrder);
  };

  const reverseLabels = () => {
    saveHistory();
    const targetIds = selectedIds.length > 0 ? selectedIds : components.map(c => c.id);
    const targetComps = components.filter(c => targetIds.includes(c.id));

    // Group components by type to reverse labels within each type
    const types = Array.from(new Set(targetComps.map(c => c.type)));

    setComponents(prev => prev.map(c => {
      if (targetIds.includes(c.id)) {
        const sameTypeComps = targetComps.filter(tc => tc.type === c.type);
        if (sameTypeComps.length < 2) return c;

        const labels = sameTypeComps.map(tc => tc.label).sort((a, b) => {
          const numA = parseInt(a.replace(/^\D+/g, '')) || 0;
          const numB = parseInt(b.replace(/^\D+/g, '')) || 0;
          return numA - numB;
        });

        const currentIndex = sameTypeComps.findIndex(tc => tc.id === c.id);
        const reversedLabels = [...labels].reverse();

        return { ...c, label: reversedLabels[currentIndex] };
      }
      return c;
    }));
  };

  // --- Helpers ---

  const getHoleGlobalPos = useCallback((componentId: string, holeIndex: number): Point => {
    return getHoleGlobalPosUtil(components, componentId, holeIndex);
  }, [components]);

  const getAdvancedWarnings = useCallback((): DesignWarning[] => {
    const warnings: DesignWarning[] = [];

    // 1. Build Nets
    const nets: Pin[][] = [];
    const visitedWires = new Set<string>();

    const findNet = (pin: Pin): number => {
      return nets.findIndex(net =>
        net.some(p => p.componentId === pin.componentId && p.holeIndex === pin.holeIndex)
      );
    };

    wires.forEach(wire => {
      if (visitedWires.has(wire.id)) return;

      let currentNet: Pin[] = [];
      const stack: Wire[] = [wire];
      visitedWires.add(wire.id);

      while (stack.length > 0) {
        const w = stack.pop()!;
        if (w.startConnection) currentNet.push(w.startConnection);
        if (w.endConnection) currentNet.push(w.endConnection);

        wires.forEach(otherWire => {
          if (visitedWires.has(otherWire.id)) return;

          const sharedPin = (w.startConnection && otherWire.startConnection && w.startConnection.componentId === otherWire.startConnection.componentId && w.startConnection.holeIndex === otherWire.startConnection.holeIndex) ||
            (w.startConnection && otherWire.endConnection && w.startConnection.componentId === otherWire.endConnection.componentId && w.startConnection.holeIndex === otherWire.endConnection.holeIndex) ||
            (w.endConnection && otherWire.startConnection && w.endConnection.componentId === otherWire.startConnection.componentId && w.endConnection.holeIndex === otherWire.startConnection.holeIndex) ||
            (w.endConnection && otherWire.endConnection && w.endConnection.componentId === otherWire.endConnection.componentId && w.endConnection.holeIndex === otherWire.endConnection.holeIndex);

          if (sharedPin) {
            visitedWires.add(otherWire.id);
            stack.push(otherWire);
          }
        });
      }

      const uniquePins: Pin[] = [];
      currentNet.forEach(p => {
        if (!uniquePins.some(up => up.componentId === p.componentId && up.holeIndex === p.holeIndex)) {
          uniquePins.push(p);
        }
      });

      if (uniquePins.length > 0) {
        nets.push(uniquePins);
      }
    });

    components.forEach(comp => {
      comp.holes.forEach((_, idx) => {
        if (findNet({ componentId: comp.id, holeIndex: idx }) === -1) { }
      });
    });

    // 2. Analyze Nets
    nets.forEach((net, netIdx) => {
      let hasVcc = false;
      let hasGnd = false;
      const connectedComps = net.map(p => ({ pin: p, comp: components.find(c => c.id === p.componentId)! }));

      connectedComps.forEach(({ pin, comp }) => {
        if (comp.type === 'Header') {
          if (comp.label === 'VCC') hasVcc = true;
          if (comp.label === 'GND') hasGnd = true;
        }
      });

      if (hasVcc && hasGnd) {
        warnings.push({
          id: `short-${netIdx}`,
          severity: 'error',
          message: 'Short Circuit Detected!',
          action: 'VCC and GND are connected in the same net. Tap to remove offending wires.',
          autoFix: () => {
            saveHistory();
            const wiresInNet = nets[netIdx];
            setWires(prev => prev.filter(w => {
              if (w.startConnection && wiresInNet.some(p => p.componentId === w.startConnection?.componentId && p.holeIndex === w.startConnection?.holeIndex)) return false;
              if (w.endConnection && wiresInNet.some(p => p.componentId === w.endConnection?.componentId && p.holeIndex === w.endConnection?.holeIndex)) return false;
              return true;
            }));
          }
        });
      }
    });

    // 3. Component Specific Checks
    components.forEach(comp => {
      const pins = comp.holes.map((_, idx) => ({ componentId: comp.id, holeIndex: idx }));
      const pinNets = pins.map(p => findNet(p));

      if (comp.type === 'LED') {
        const cathodeNetIdx = pinNets[0];
        const anodeNetIdx = pinNets[1];

        if (cathodeNetIdx === -1 && anodeNetIdx === -1) {
          warnings.push({
            id: `unconnected-${comp.id}`,
            severity: 'warning',
            message: `${comp.label} is not connected.`,
            action: 'Tap to auto-route this LED.',
            autoFix: () => {
              saveHistory();
              setSelectedIds([comp.id]);
              setTimeout(() => smartRouteSelected(), 0);
            }
          });
        } else {
          const anodeNet = anodeNetIdx !== -1 ? nets[anodeNetIdx] : [];
          const hasResistor = anodeNet.some(p => {
            const c = components.find(comp => comp.id === p.componentId);
            return c?.type === 'Resistor';
          });

          const isDirectToVcc = anodeNet.some(p => {
            const c = components.find(comp => comp.id === p.componentId);
            return c?.type === 'Header' && c.label === 'VCC';
          });

          if (isDirectToVcc && !hasResistor) {
            warnings.push({
              id: `led-no-resistor-${comp.id}`,
              severity: 'error',
              message: `${comp.label} connected directly to VCC.`,
              action: 'Tap to fix. This will reroute via a resistor.',
              autoFix: () => {
                saveHistory();
                setSelectedIds([comp.id]);
                setTimeout(() => smartRouteSelected(), 0);
              }
            });
          }
        }
      }

      if (comp.type === 'Potentiometer') {
        if (pinNets[1] === -1) {
          warnings.push({
            id: `pot-floating-${comp.id}`,
            severity: 'warning',
            message: `${comp.label} signal pin is floating.`,
            action: 'Tap to auto-route analog pin.',
            autoFix: () => {
              saveHistory();
              setSelectedIds([comp.id]);
              setTimeout(() => smartRouteSelected(), 0);
            }
          });
        }
      }

      if (comp.type === 'Pushbutton') {
        const isAnyConnected = pinNets.some(idx => idx !== -1);
        if (!isAnyConnected) {
          warnings.push({
            id: `btn-unconnected-${comp.id}`,
            severity: 'info',
            message: `${comp.label} is unused.`,
            action: 'Tap to auto-route this button.',
            autoFix: () => {
              saveHistory();
              setSelectedIds([comp.id]);
              setTimeout(() => smartRouteSelected(), 0);
            }
          });
        } else {
          const signalPinIdx = comp.holes.length === 4 ? 2 : 1;
          const signalNetIdx = pinNets[signalPinIdx];
          if (signalNetIdx !== -1) {
            const net = nets[signalNetIdx];
            const hasResistorToGnd = net.some(p => {
              const c = components.find(comp => comp.id === p.componentId);
              if (c?.type === 'Resistor') {
                const otherPinNetIdx = findNet({ componentId: c.id, holeIndex: p.holeIndex === 0 ? 1 : 0 });
                if (otherPinNetIdx !== -1) {
                  return nets[otherPinNetIdx].some(p2 => {
                    const c2 = components.find(comp => comp.id === p2.componentId);
                    return c2?.type === 'Header' && c2.label === 'GND';
                  });
                }
              }
              return false;
            });

            if (!hasResistorToGnd) {
              warnings.push({
                id: `btn-no-pulldown-${comp.id}`,
                severity: 'warning',
                message: `${comp.label} may have a floating input.`,
                action: 'Tap to add a pull-down resistor.',
                autoFix: () => {
                  saveHistory();
                  setSelectedIds([comp.id]);
                  setTimeout(() => smartRouteSelected(), 0);
                }
              });
            }
          }
        }
      }
    });

    return warnings;
  }, [components, wires]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoTapGround = useCallback((componentId: string, holeIndex: number) => {
    saveHistory();
    const startPos = getHoleGlobalPos(componentId, holeIndex);

    // Find nearest GND header or GND wire
    const gndHeader = components.find(c => c.type === 'Header' && c.label === 'GND');
    let targetPoint: Point | null = null;

    if (gndHeader) {
      targetPoint = getHoleGlobalPos(gndHeader.id, 0);
    }

    if (targetPoint) {
      const newWire: Wire = {
        id: `wire-${Date.now()}`,
        path: [startPos, targetPoint],
        color: COLORS.WIRE_BLACK,
        startConnection: { componentId, holeIndex },
        endConnection: gndHeader ? { componentId: gndHeader.id, holeIndex: 0 } : undefined
      };
      setWires(prev => [...prev, newWire]);
    }
  }, [components, getHoleGlobalPos, saveHistory]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  const snapToGrid = (x: number, y: number, fullHole: boolean = false): Point => {
    const res = fullHole ? 1 : SNAP_RES;
    return {
      x: Math.round(x / res) * res,
      y: Math.round(y / res) * res
    };
  };

  const findNearestPointOnSegment = (p1: Point, p2: Point, p: Point): Point => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (dx === 0 && dy === 0) return p1;

    const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));

    return {
      x: p1.x + clampedT * dx,
      y: p1.y + clampedT * dy
    };
  };

  const getSnapPoint = useCallback((p: Point): Point => {
    // 1. Check for component holes
    let bestHole: Point | null = null;
    let minHoleDist = 0.4;

    components.forEach(comp => {
      comp.holes.forEach((_, idx) => {
        const holePos = getHoleGlobalPos(comp.id, idx);
        const dist = Math.sqrt((holePos.x - p.x) ** 2 + (holePos.y - p.y) ** 2);
        if (dist < minHoleDist) {
          minHoleDist = dist;
          bestHole = holePos;
        }
      });
    });

    if (bestHole) return bestHole;

    // 2. Check for existing wires (tapping)
    let bestWirePoint: Point | null = null;
    let minWireDist = 0.3;

    wires.forEach(wire => {
      const path = getDynamicPath(wire);
      for (let i = 0; i < path.length - 1; i++) {
        const nearest = findNearestPointOnSegment(path[i], path[i + 1], p);
        const dist = Math.sqrt((nearest.x - p.x) ** 2 + (nearest.y - p.y) ** 2);
        if (dist < minWireDist) {
          minWireDist = dist;
          bestWirePoint = nearest;
        }
      }
    });

    if (bestWirePoint) return bestWirePoint;

    // 3. Default to grid
    return snapToGrid(p.x, p.y);
  }, [components, wires, getHoleGlobalPos]);

  const findConnectionAtPoint = useCallback((p: Point) => {
    for (const comp of components) {
      for (let i = 0; i < comp.holes.length; i++) {
        const holePos = getHoleGlobalPos(comp.id, i);
        if (Math.abs(holePos.x - p.x) < 0.1 && Math.abs(holePos.y - p.y) < 0.1) {
          return { componentId: comp.id, holeIndex: i };
        }
      }
    }
    return null;
  }, [components, getHoleGlobalPos]);

  const getDynamicPath = useCallback((wire: Wire) => {
    const newPath = [...wire.path];
    if (wire.startConnection) {
      newPath[0] = getHoleGlobalPos(wire.startConnection.componentId, wire.startConnection.holeIndex);
    }
    if (wire.endConnection) {
      newPath[newPath.length - 1] = getHoleGlobalPos(wire.endConnection.componentId, wire.endConnection.holeIndex);
    }
    return newPath;
  }, [getHoleGlobalPos]);

  const handleWireMouseDown = (e: React.MouseEvent, wireId: string) => {
    e.stopPropagation();
    if (view === 'bottom' || routingMode) return;

    setSelectedWireId(wireId);
    setSelectedIds([]); // Deselect components

    // Check if we clicked on a segment to add a point
    const wire = wires.find(w => w.id === wireId);
    if (!wire) return;

    const svg = e.currentTarget.closest('svg');
    if (!svg) return;
    const CTM = svg.getScreenCTM();
    if (!CTM) return;

    const mouseX = (e.clientX - CTM.e) / CTM.a;
    const mouseY = (e.clientY - CTM.f) / CTM.d;
    const mouseGridPos = {
      x: (mouseX - PCB_PADDING) / HOLE_SPACING,
      y: (mouseY - PCB_PADDING) / HOLE_SPACING
    };

    const path = getDynamicPath(wire);
    for (let i = 0; i < path.length - 1; i++) {
      const nearest = findNearestPointOnSegment(path[i], path[i + 1], mouseGridPos);
      const dist = Math.sqrt((nearest.x - mouseGridPos.x) ** 2 + (nearest.y - mouseGridPos.y) ** 2);

      if (dist < 0.2) {
        // Clicked on segment, add a point
        saveHistory();
        const newPath = [...wire.path];
        newPath.splice(i + 1, 0, snapToGrid(mouseGridPos.x, mouseGridPos.y));
        setWires(prev => prev.map(w => w.id === wireId ? { ...w, path: newPath } : w));
        setDraggingWirePoint({ wireId, pointIndex: i + 1 });
        break;
      }
    }
  };

  const handleWirePointMouseDown = (e: React.MouseEvent, wireId: string, pointIndex: number) => {
    e.stopPropagation();
    if (view === 'bottom' || routingMode) return;

    saveHistory();
    setDraggingWirePoint({ wireId, pointIndex });
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent SVG onMouseDown
    if (view === 'bottom' || routingMode) return;

    saveHistory();
    setSelectedWireId(null); // Deselect wire
    const isShift = e.shiftKey;
    const comp = components.find(c => c.id === id);
    if (!comp) return;

    if (isShift) {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
      }
    }

    setIsDragging(true);

    const svg = e.currentTarget.closest('svg');
    if (!svg) return;

    const CTM = svg.getScreenCTM();
    if (!CTM) return;

    const mouseX = (e.clientX - CTM.e) / CTM.a;
    const mouseY = (e.clientY - CTM.f) / CTM.d;

    setDragOffset({
      x: mouseX - (comp.position.x * HOLE_SPACING + PCB_PADDING),
      y: mouseY - (comp.position.y * HOLE_SPACING + PCB_PADDING)
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const svg = e.currentTarget.closest('svg');
    if (!svg) return;

    const CTM = svg.getScreenCTM();
    if (!CTM) return;

    const mouseX = (e.clientX - CTM.e) / CTM.a;
    const mouseY = (e.clientY - CTM.f) / CTM.d;

    if (selectionBox) {
      setSelectionBox(prev => prev ? { ...prev, end: { x: mouseX, y: mouseY } } : null);
      return;
    }

    if (draggingWirePoint) {
      const { wireId, pointIndex } = draggingWirePoint;
      const mouseGridPos = {
        x: (mouseX - PCB_PADDING) / HOLE_SPACING,
        y: (mouseY - PCB_PADDING) / HOLE_SPACING
      };
      const snapPoint = getSnapPoint(mouseGridPos);

      setWires(prev => prev.map(w => {
        if (w.id === wireId) {
          const newPath = [...w.path];
          newPath[pointIndex] = snapPoint;
          return { ...w, path: newPath };
        }
        return w;
      }));
      return;
    }

    if (isDragging && selectedIds.length > 0 && view === 'face') {
      const primaryId = selectedIds[selectedIds.length - 1];
      const primaryComp = components.find(c => c.id === primaryId);
      if (!primaryComp) return;

      const newPos = snapToGrid(
        (mouseX - dragOffset.x - PCB_PADDING) / HOLE_SPACING,
        (mouseY - dragOffset.y - PCB_PADDING) / HOLE_SPACING,
        true // Snap to full holes for components
      );

      const targetPos = snapToGrid(
        (mouseX - PCB_PADDING) / HOLE_SPACING - dragOffset.x,
        (mouseY - PCB_PADDING) / HOLE_SPACING - dragOffset.y,
        true
      );

      const dx = targetPos.x - primaryComp.position.x;
      const dy = targetPos.y - primaryComp.position.y;

      if (dx !== 0 || dy !== 0) {
        setComponents(prev => prev.map(c => {
          if (selectedIds.includes(c.id)) {
            return {
              ...c,
              position: {
                x: Math.max(0, Math.min(gridCols - 1, c.position.x + dx)),
                y: Math.max(0, Math.min(gridRows - 1, c.position.y + dy))
              }
            };
          }
          return c;
        }));
      }
    }

    if (routingMode && activeWirePath.length > 0) {
      const mouseGridPos = {
        x: (mouseX - PCB_PADDING) / HOLE_SPACING,
        y: (mouseY - PCB_PADDING) / HOLE_SPACING
      };

      const lastPoint = activeWirePath[activeWirePath.length - 1];
      const prevPoint = activeWirePath.length > 1 ? activeWirePath[activeWirePath.length - 2] : null;

      // If we are placing the first point, snap it to holes/wires
      // If we are placing subsequent points, we snap the "current" point
      const snapPoint = getSnapPoint(mouseGridPos);

      let constrainedPos = { ...snapPoint };

      if (prevPoint) {
        // Enforce 45/90 degree logic relative to the PREVIOUS point (the one we just clicked)
        const dx = snapPoint.x - prevPoint.x;
        const dy = snapPoint.y - prevPoint.y;

        if (routingAngle === '90') {
          if (Math.abs(dx) > Math.abs(dy)) {
            constrainedPos.y = prevPoint.y;
          } else {
            constrainedPos.x = prevPoint.x;
          }
        } else {
          if (Math.abs(dx) > Math.abs(dy) * 2) constrainedPos.y = prevPoint.y; // 90 deg horizontal
          else if (Math.abs(dy) > Math.abs(dx) * 2) constrainedPos.x = prevPoint.x; // 90 deg vertical
          else if (Math.abs(dx) > 0 && Math.abs(dy) > 0) {
            // 45 deg
            const side = Math.min(Math.abs(dx), Math.abs(dy));
            constrainedPos.x = prevPoint.x + Math.sign(dx) * side;
            constrainedPos.y = prevPoint.y + Math.sign(dy) * side;
          }
        }
      }

      // Update preview point (last in path)
      setActiveWirePath(prev => [...prev.slice(0, -1), constrainedPos]);
    }
  };

  const handleSvgClick = (e: React.MouseEvent) => {
    if (!routingMode) return;

    const svg = e.currentTarget.closest('svg');
    if (!svg) return;
    const CTM = svg.getScreenCTM();
    if (!CTM) return;

    const mouseX = (e.clientX - CTM.e) / CTM.a;
    const mouseY = (e.clientY - CTM.f) / CTM.d;
    const mouseGridPos = {
      x: (mouseX - PCB_PADDING) / HOLE_SPACING,
      y: (mouseY - PCB_PADDING) / HOLE_SPACING
    };

    const snapPoint = getSnapPoint(mouseGridPos);

    if (activeWirePath.length === 0) {
      setActiveWirePath([snapPoint, snapPoint]);
    } else {
      // Check for collisions before adding point
      const lastPoint = activeWirePath[activeWirePath.length - 1];

      // Allow start/end points to be on wires (tapping)
      // But check if the segment itself crosses anything
      let isBlocked = intersectsAnyWireEngine(lastPoint, snapPoint, wires, (w: Wire) => w.path);

      if (!isBlocked) {
        wires.forEach(w => {
          const wPath = getDynamicPath(w);
          for (let i = 0; i < wPath.length - 1; i++) {
            // Check if snapPoint is on this wire
            const nearest = findNearestPointOnSegment(wPath[i], wPath[i + 1], snapPoint);
            const dist = Math.sqrt((nearest.x - snapPoint.x) ** 2 + (nearest.y - snapPoint.y) ** 2);

            // If it's not a hole or the very start of the wire, block it
            const isHole = components.some(c => c.holes.some((_, idx) => {
              const h = getHoleGlobalPosUtil(components, c.id, idx);
              return Math.abs(h.x - snapPoint.x) < 0.1 && Math.abs(h.y - snapPoint.y) < 0.1;
            }));

            if (dist < 0.1 && !isHole && activeWirePath.length > 2) {
              isBlocked = true;
            }
          }
        });
      }

      if (isBlocked) {
        // Optional: Provide feedback or just block
        return;
      }

      // Finish wire on double click or click near last point
      if (e.detail === 2) {
        if (activeWirePath.length > 1) {
          saveHistory();
          const startConn = findConnectionAtPoint(activeWirePath[0]);
          const endConn = findConnectionAtPoint(activeWirePath[activeWirePath.length - 1]);

          setWires(prev => [...prev, {
            id: `wire-${Date.now()}`,
            path: activeWirePath,
            color: traceColor,
            startConnection: startConn || undefined,
            endConnection: endConn || undefined
          }]);
        }
        setActiveWirePath([]);
      } else {
        // Add the current snapped point to the path
        const lastPoint = activeWirePath[activeWirePath.length - 1];
        setActiveWirePath(prev => [...prev, lastPoint]);
      }
    }
  };

  const handleMouseUp = () => {
    if (isDragging && selectedIds.length > 0) {
      rerouteTetheredWires(selectedIds);
    }

    if (selectionBox) {
      const x1 = Math.min(selectionBox.start.x, selectionBox.end.x);
      const y1 = Math.min(selectionBox.start.y, selectionBox.end.y);
      const x2 = Math.max(selectionBox.start.x, selectionBox.end.x);
      const y2 = Math.max(selectionBox.start.y, selectionBox.end.y);

      const newlySelected = components.filter(comp => {
        const cx = comp.position.x * HOLE_SPACING + PCB_PADDING;
        const cy = comp.position.y * HOLE_SPACING + PCB_PADDING;
        // Check if component anchor is within box
        return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
      }).map(c => c.id);

      if (newlySelected.length > 0) {
        setSelectedIds(prev => {
          const combined = new Set([...prev, ...newlySelected]);
          return Array.from(combined);
        });
      }
      setSelectionBox(null);
    }
    setIsDragging(false);
    setDraggingWirePoint(null);
  };

  const rotateSelected = () => {
    if (selectedIds.length === 0) return;
    saveHistory();

    if (selectedIds.length === 1) {
      // Single rotation
      setComponents(prev => prev.map(c => {
        if (selectedIds.includes(c.id)) {
          return { ...c, rotation: ((c.rotation + 90) % 360) as 0 | 90 | 180 | 270 };
        }
        return c;
      }));
    } else {
      // Group rotation around center
      const selectedComps = components.filter(c => selectedIds.includes(c.id));
      const avgX = selectedComps.reduce((sum, c) => sum + c.position.x, 0) / selectedComps.length;
      const avgY = selectedComps.reduce((sum, c) => sum + c.position.y, 0) / selectedComps.length;

      // Snap center to grid for cleaner rotation
      const cx = Math.round(avgX);
      const cy = Math.round(avgY);

      setComponents(prev => prev.map(c => {
        if (selectedIds.includes(c.id)) {
          // Rotate position 90 deg around (cx, cy)
          // x' = cx - (y - cy)
          // y' = cy + (x - cx)
          const newX = cx - (c.position.y - cy);
          const newY = cy + (c.position.x - cx);

          return {
            ...c,
            position: snapToGrid(newX, newY, true),
            rotation: ((c.rotation + 90) % 360) as 0 | 90 | 180 | 270
          };
        }
        return c;
      }));
    }

    // Re-route after rotation
    setTimeout(() => rerouteTetheredWires(selectedIds), 0);
  };

  // --- Auto Routing (A*) ---





  const rerouteTetheredWires = useCallback((ids: string[]) => {
    setWires(prev => prev.map(wire => {
      const startMoved = wire.startConnection && ids.includes(wire.startConnection.componentId);
      const endMoved = wire.endConnection && ids.includes(wire.endConnection.componentId);

      if (startMoved || endMoved) {
        const start = wire.startConnection
          ? getHoleGlobalPosUtil(components, wire.startConnection.componentId, wire.startConnection.holeIndex)
          : wire.path[0];

        const end = wire.endConnection
          ? getHoleGlobalPosUtil(components, wire.endConnection.componentId, wire.endConnection.holeIndex)
          : wire.path[wire.path.length - 1];

        const ctx = { wires: prev, components, gridCols, gridRows, routingAngle };
        const newPath = findPathEngine(start, end, ctx, (w: Wire) => w.path, wire.id);
        if (newPath) {
          return { ...wire, path: newPath };
        }
      }
      return wire;
    }));
  }, [components, gridCols, gridRows, routingAngle]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveWirePath([]);
        setSelectedIds([]);
        setSelectionBox(null);
        setIsDragging(false);
        setRoutingMode(false);
        setSelectedWireId(null);
        setDraggingWirePoint(null);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        redo();
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.length > 0) {
        e.preventDefault();
        saveHistory();

        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -1;
        if (e.key === 'ArrowDown') dy = 1;
        if (e.key === 'ArrowLeft') dx = -1;
        if (e.key === 'ArrowRight') dx = 1;

        setComponents(prev => prev.map(c => {
          if (selectedIds.includes(c.id)) {
            return {
              ...c,
              position: {
                x: Math.max(0, Math.min(gridCols - 1, c.position.x + dx)),
                y: Math.max(0, Math.min(gridRows - 1, c.position.y + dy))
              }
            };
          }
          return c;
        }));

        // Re-route after move
        setTimeout(() => rerouteTetheredWires(selectedIds), 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedIds, rerouteTetheredWires, setActiveWirePath, setSelectedIds, setSelectionBox, setIsDragging, setRoutingMode, setSelectedWireId, setDraggingWirePoint]);

  const smartRouteAll = useCallback(() => {
    saveHistory();
    const newWires = smartRoute();
    if (newWires) setWires(newWires);
  }, [saveHistory, smartRoute]);

  const smartRouteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    saveHistory();
    const newWires = smartRoute(selectedIds);
    if (newWires) setWires(newWires);
  }, [selectedIds, saveHistory, smartRoute]);

  const junctions = useMemo(() => {
    const points: Point[] = [];
    const threshold = 0.05;

    wires.forEach((w1, i) => {
      // Check both ends of w1
      const ends = [w1.path[0], w1.path[w1.path.length - 1]];

      ends.forEach(end => {
        wires.forEach((w2, j) => {
          if (i === j) return;

          for (let k = 0; k < w2.path.length - 1; k++) {
            const nearest = findNearestPointOnSegment(w2.path[k], w2.path[k + 1], end);
            const dist = Math.sqrt((nearest.x - end.x) ** 2 + (nearest.y - end.y) ** 2);

            if (dist < threshold) {
              // Check if it's already in junctions (avoid duplicates)
              const exists = points.some(p => Math.sqrt((p.x - end.x) ** 2 + (p.y - end.y) ** 2) < threshold);
              if (!exists) {
                points.push(end);
              }
              return;
            }
          }
        });
      });
    });
    return points;
  }, [wires]);

  const advancedWarnings = useMemo(() => getAdvancedWarnings(), [getAdvancedWarnings]);



  const exportBoard = () => {
    handleExportImage();
  };

  const getRecommendations = () => {
    const recs: { type: 'error' | 'warning' | 'success'; msg: string }[] = [];
    if (components.length === 0) recs.push({ type: 'warning', msg: 'Add some components to start.' });
    if (components.length > 0 && wires.length === 0) recs.push({ type: 'warning', msg: 'No traces routed yet.' });
    return recs;
  };

  const updateComponentProp = (id: string, updates: Partial<PCBComponent>) => {
    saveHistory();
    setComponents(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  // --- Rendering ---

  const renderGrid = () => {
    const holes = [];
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const x = c * HOLE_SPACING + PCB_PADDING;
        const y = r * HOLE_SPACING + PCB_PADDING;

        const displayX = view === 'bottom'
          ? (gridCols - 1 - c) * HOLE_SPACING + PCB_PADDING
          : x;

        holes.push(
          <g key={`hole-${r}-${c}`}>
            {/* Copper Pad on Bottom View */}
            {view === 'bottom' && (
              <circle
                cx={displayX}
                cy={y}
                r={HOLE_RADIUS + 2.5}
                fill={COLORS.COPPER}
                opacity={0.6}
              />
            )}
            <circle
              cx={displayX}
              cy={y}
              r={HOLE_RADIUS}
              fill={COLORS.PCB_DARK}
              opacity={showGrid ? 0.9 : 0.15}
              className="transition-opacity duration-300"
            />
            {/* Subtle highlight for grid intersections */}
            {showGrid && (
              <circle
                cx={displayX}
                cy={y}
                r={1}
                fill="white"
                opacity={0.1}
              />
            )}
          </g>
        );
      }
    }
    return holes;
  };

  const renderGridLabels = () => {
    const labels = [];
    // Column labels
    for (let c = 0; c < gridCols; c++) {
      const displayIndex = reverseGridCols ? (gridCols - 1 - c) : c;
      const label = gridCols === 30 ? (displayIndex + 1).toString() : String.fromCharCode(65 + displayIndex);
      const x = c * HOLE_SPACING + PCB_PADDING;
      const displayX = view === 'bottom'
        ? (gridCols - 1 - c) * HOLE_SPACING + PCB_PADDING
        : x;

      labels.push(
        <text
          key={`col-label-${c}`}
          x={displayX}
          y={PCB_PADDING - 18}
          fontSize="9"
          fill="white"
          opacity={0.4}
          textAnchor="middle"
          fontWeight="600"
          className="pointer-events-none select-none font-mono tracking-tighter"
          transform={view === 'bottom' ? `scale(-1, 1) translate(${-2 * displayX}, 0)` : undefined}
        >
          {label}
        </text>
      );
    }

    // Row labels
    for (let r = 0; r < gridRows; r++) {
      const displayIndex = reverseGridRows ? (gridRows - 1 - r) : r;
      const label = gridRows === 30 ? (displayIndex + 1).toString() : String.fromCharCode(65 + displayIndex);
      const xPos = view === 'bottom'
        ? (gridCols - 1) * HOLE_SPACING + PCB_PADDING + 22
        : PCB_PADDING - 22;

      labels.push(
        <text
          key={`row-label-${r}`}
          x={xPos}
          y={r * HOLE_SPACING + PCB_PADDING + 3.5}
          fontSize="9"
          fill="white"
          opacity={0.4}
          textAnchor="middle"
          fontWeight="600"
          className="pointer-events-none select-none font-mono tracking-tighter"
          transform={view === 'bottom' ? `scale(-1, 1) translate(${-2 * xPos}, 0)` : undefined}
        >
          {label}
        </text>
      );
    }
    return labels;
  };

  const renderComponents = () => {
    if (view === 'bottom') return null;

    return components.map(comp => {
      const x = comp.position.x * HOLE_SPACING + PCB_PADDING;
      const y = comp.position.y * HOLE_SPACING + PCB_PADDING;
      const isSelected = selectedIds.includes(comp.id);

      return (
        <g
          key={comp.id}
          className={`cursor-move transition-all duration-200 ${isDragging && !isSelected ? 'opacity-30' : 'opacity-100'}`}
          onMouseDown={(e) => handleMouseDown(e, comp.id)}
          transform={`rotate(${comp.rotation}, ${x}, ${y})`}
        >
          {/* Analog Pin Label */}
          {comp.analogPin && comp.analogPin !== 'None' && (
            <text
              x={x + (comp.width ?? 1) * HOLE_SPACING / 2}
              y={y - 22}
              fontSize="8"
              fill="#60a5fa"
              fontWeight="600"
              textAnchor="middle"
              className="pointer-events-none select-none font-mono tracking-tighter"
            >
              {comp.analogPin}
            </text>
          )}

          {/* Component Body Visuals */}
          {comp.type === 'LED' && (
            <g>
              <circle cx={x + HOLE_SPACING / 2} cy={y} r={11} fill={comp.color} opacity={0.9} className="filter drop-shadow-sm" />
              <circle cx={x + HOLE_SPACING / 2} cy={y} r={9} fill="white" opacity={0.15} />
              <circle cx={x + HOLE_SPACING / 2 - 3} cy={y - 3} r={2} fill="white" opacity={0.3} />
            </g>
          )}
          {comp.type === 'Resistor' && (
            <g>
              <rect
                x={x - 4}
                y={y - 6}
                width={(comp.width ?? 2) * HOLE_SPACING + 8}
                height={12}
                rx={6}
                fill="#e5c07b"
                className="filter drop-shadow-sm"
              />
              <rect x={x + 4} y={y - 6} width={3} height={12} fill="#8b4513" />
              <rect x={x + 14} y={y - 6} width={3} height={12} fill="#8b4513" />
              <rect x={x + 24} y={y - 6} width={3} height={12} fill="#ffd700" />
            </g>
          )}
          {comp.type === 'Potentiometer' && (
            <g>
              <rect
                x={x - 10}
                y={y - 15}
                width={(comp.width ?? 2) * HOLE_SPACING + 20}
                height={30}
                rx={6}
                fill="#1e40af"
                stroke="#1e3a8a"
                strokeWidth={1.5}
                className="filter drop-shadow-md"
              />
              <circle
                cx={x + ((comp.width ?? 2) * HOLE_SPACING) / 2}
                cy={y}
                r={11}
                fill="#f3f4f6"
                stroke="#d1d5db"
                strokeWidth={1}
              />
              <rect
                x={x + ((comp.width ?? 2) * HOLE_SPACING) / 2 - 1.5}
                y={y - 8}
                width={3}
                height={16}
                fill="#9ca3af"
                rx={1}
                transform={`rotate(45, ${x + ((comp.width ?? 2) * HOLE_SPACING) / 2}, ${y})`}
              />
            </g>
          )}
          {comp.type === 'LDR' && (
            <g>
              <circle cx={x + HOLE_SPACING / 2} cy={y} r={9} fill="#fef08a" stroke="#92400e" strokeWidth={1.5} className="filter drop-shadow-sm" />
              <path d={`M ${x + HOLE_SPACING / 2 - 5} ${y - 3} Q ${x + HOLE_SPACING / 2} ${y - 7} ${x + HOLE_SPACING / 2 + 5} ${y - 3} T ${x + HOLE_SPACING / 2 - 5} ${y + 3} T ${x + HOLE_SPACING / 2 + 5} ${y + 7}`} fill="none" stroke="#92400e" strokeWidth={1.2} />
            </g>
          )}
          {comp.type === 'Pushbutton' && (
            <g>
              <rect
                x={x - 10}
                y={y - 10}
                width={(comp.width ?? 2) * HOLE_SPACING + 20}
                height={(comp.height ?? 0) * HOLE_SPACING + 20}
                rx={6}
                fill="#262626"
                stroke="#0a0a0a"
                strokeWidth={1.5}
                className="filter drop-shadow-md"
              />
              <circle
                cx={x + ((comp.width ?? 2) * HOLE_SPACING) / 2}
                cy={y + ((comp.height ?? 0) * HOLE_SPACING) / 2}
                r={11}
                fill="#0a0a0a"
              />
              <circle
                cx={x + ((comp.width ?? 2) * HOLE_SPACING) / 2}
                cy={y + ((comp.height ?? 0) * HOLE_SPACING) / 2}
                r={9}
                fill="#171717"
              />
            </g>
          )}
          {comp.type === 'Header' && (
            <g>
              <rect x={x - 7} y={y - 7} width={14} height={14} fill="#171717" rx={2} className="filter drop-shadow-sm" />
              <rect x={x - 2} y={y - 2} width={4} height={4} fill="#fbbf24" rx={0.5} />
            </g>
          )}

          {/* Selection Highlight */}
          {isSelected && (
            <rect
              x={x - 18} y={y - 18}
              width={((comp.width ?? (comp.holes.length > 1 ? Math.max(...comp.holes.map(h => h.x)) : 0)) * HOLE_SPACING) + 36}
              height={((comp.height ?? (comp.holes.length > 1 ? Math.max(...comp.holes.map(h => h.y)) : 0)) * HOLE_SPACING) + 36}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="6 3"
              rx={10}
              className="animate-pulse"
            />
          )}

          {/* Label */}
          {showLabels && (
            <text
              x={x}
              y={y - 20}
              fontSize="10"
              fill="white"
              fontWeight="600"
              className="pointer-events-none select-none opacity-60 font-sans tracking-tight"
              transform={`rotate(${-comp.rotation}, ${x}, ${y - 20})`}
            >
              {comp.label}
            </text>
          )}
        </g>
      );
    });
  };

  const renderWires = () => {
    const allWires = [...wires];
    if (activeWirePath.length > 0) {
      allWires.push({ id: 'active', path: activeWirePath, color: traceColor });
    }

    return (
      <g>
        {allWires.map(wire => {
          const path = getDynamicPath(wire);
          const isSelected = selectedWireId === wire.id;
          const points = path.map(p => {
            let px = p.x * HOLE_SPACING + PCB_PADDING;
            let py = p.y * HOLE_SPACING + PCB_PADDING;
            if (view === 'bottom') {
              px = (gridCols - 1 - p.x) * HOLE_SPACING + PCB_PADDING;
            }
            return `${px},${py}`;
          }).join(' ');

          return (
            <g key={wire.id}>
              {/* Invisible thicker path for easier selection */}
              <polyline
                points={points}
                fill="none"
                stroke="transparent"
                strokeWidth={10}
                className="cursor-pointer"
                onMouseDown={(e) => handleWireMouseDown(e, wire.id)}
              />
              {/* Selection Glow */}
              {isSelected && (
                <polyline
                  points={points}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={view === 'bottom' ? 10 : 8}
                  strokeOpacity={0.3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="pointer-events-none"
                />
              )}
              <polyline
                points={points}
                fill="none"
                stroke={wire.color}
                strokeWidth={view === 'bottom' ? 4 : (isSelected ? 3 : 1.5)}
                strokeOpacity={view === 'bottom' ? 0.9 : (isSelected ? 1 : 0.6)}
                strokeLinejoin="round"
                strokeLinecap="round"
                className={wire.id === 'active' ? 'animate-pulse' : ''}
                style={{ filter: isSelected ? 'drop-shadow(0 0 2px white)' : 'none' }}
              />

              {/* Control Points for selected wire */}
              {isSelected && view === 'face' && path.map((p, idx) => {
                const px = p.x * HOLE_SPACING + PCB_PADDING;
                const py = p.y * HOLE_SPACING + PCB_PADDING;
                return (
                  <circle
                    key={`${wire.id}-p-${idx}`}
                    cx={px}
                    cy={py}
                    r={4}
                    fill="white"
                    stroke={wire.color}
                    strokeWidth={1}
                    className="cursor-move"
                    onMouseDown={(e) => handleWirePointMouseDown(e, wire.id, idx)}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Junction Dots */}
        {junctions.map((p, idx) => {
          let px = p.x * HOLE_SPACING + PCB_PADDING;
          let py = p.y * HOLE_SPACING + PCB_PADDING;
          if (view === 'bottom') {
            px = (gridCols - 1 - p.x) * HOLE_SPACING + PCB_PADDING;
          }
          return (
            <circle
              key={`junction-${idx}`}
              cx={px} cy={py} r={3}
              fill="#fff"
              className="pointer-events-none"
            />
          );
        })}

        {/* Snap Indicator */}
        {routingMode && activeWirePath.length > 0 && (
          <circle
            cx={activeWirePath[activeWirePath.length - 1].x * HOLE_SPACING + PCB_PADDING}
            cy={activeWirePath[activeWirePath.length - 1].y * HOLE_SPACING + PCB_PADDING}
            r={5}
            fill="none"
            stroke={traceColor}
            strokeWidth={1}
            className="animate-ping"
          />
        )}
      </g>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-200 font-sans selection:bg-emerald-500/30 overflow-hidden">
      {/* Header */}
      <header className="h-16 shrink-0 border-b border-white/5 bg-neutral-900/50 backdrop-blur-xl z-50">
        <div className="max-w-[1800px] mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
              <Cpu className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                PCB DESIGNER <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-neutral-400 font-mono uppercase tracking-widest">v2.0</span>
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] text-neutral-500 uppercase font-mono tracking-wider">{gridCols}x{gridRows} Prototyping Grid</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setView('face')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${view === 'face' ? 'bg-emerald-500 text-black shadow-lg' : 'hover:bg-white/5 text-neutral-500'
                }`}
            >
              <Eye className="w-3.5 h-3.5" />
              FACE
            </button>
            <button
              onClick={() => setView('bottom')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${view === 'bottom' ? 'bg-emerald-500 text-black shadow-lg' : 'hover:bg-white/5 text-neutral-500'
                }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              BOTTOM
            </button>
          </div>

          <div className="flex items-center gap-4">
            {isSaving && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500">
                <RefreshCw className="w-3 h-3 animate-spin" />
                SYNCING...
              </div>
            )}
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-[11px] font-bold text-white leading-none">{user.displayName}</p>
                  <p className="text-[9px] text-emerald-500/70 font-mono leading-none mt-1 uppercase tracking-tighter">Connected</p>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 text-neutral-500 hover:text-red-400 transition-all"
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="px-4 py-2 bg-emerald-500 text-black rounded-lg text-xs font-bold flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-emerald-500/20"
              >
                <LogIn className="w-3.5 h-3.5" />
                SIGN IN
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden bg-neutral-950 w-full h-full text-white">

        {/* LEFT SIDEBAR - Tools & Actions */}
        <motion.aside
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="w-[260px] bg-black/60 backdrop-blur-3xl border-r border-white/10 p-5 flex flex-col gap-6 z-40 overflow-y-auto custom-scrollbar shadow-2xl h-full"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Cpu className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Design Tools</h2>
              <p className="text-xs text-neutral-400">Layout & routing</p>
            </div>
          </div>

          {/* Toolbar - Mode Selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Mode</h3>
            <div className="flex bg-neutral-900/80 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => { setRoutingMode(false); setActiveWirePath([]); setDraggingWirePoint(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all ${!routingMode ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <MousePointer2 className="w-3.5 h-3.5" />
                Select
              </button>
              <button
                onClick={() => { setRoutingMode(true); setSelectedIds([]); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all ${routingMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <GitMerge className="w-3.5 h-3.5" />
                Route
              </button>
            </div>
          </div>

          {/* Board Controls */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Board Controls</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={undo} disabled={history.length === 0} className="hardware-card flex flex-col items-center justify-center p-3 gap-2 disabled:opacity-30 disabled:hover:border-white/5">
                <Undo2 className="w-4 h-4 text-neutral-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Undo</span>
              </button>
              <button onClick={redo} disabled={future.length === 0} className="hardware-card flex flex-col items-center justify-center p-3 gap-2 disabled:opacity-30 disabled:hover:border-white/5">
                <Redo2 className="w-4 h-4 text-neutral-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Redo</span>
              </button>
              <button onClick={rotateBoard} className="hardware-card flex flex-col items-center justify-center p-3 gap-2">
                <RefreshCw className="w-4 h-4 text-neutral-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Rotate</span>
              </button>
              <button onClick={() => setShowLabels(!showLabels)} className={`hardware-card flex flex-col items-center justify-center p-3 gap-2 ${showLabels ? 'bg-white/5 border-white/20' : ''}`}>
                <Eye className="w-4 h-4 text-neutral-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Labels</span>
              </button>
              <button onClick={() => setShowGrid(!showGrid)} className={`hardware-card flex flex-col items-center justify-center p-3 gap-2 ${showGrid ? 'bg-white/5 border-white/20' : ''}`}>
                <Grid className="w-4 h-4 text-neutral-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Grid</span>
              </button>
              <button onClick={exportBoard} className="hardware-card col-span-2 flex items-center justify-center p-3 gap-2">
                <Download className="w-4 h-4 text-neutral-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Export PNG</span>
              </button>
            </div>
          </div>

          {/* Component Library */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Component Library</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => spawnComponent('LED')} className="hardware-card flex flex-col items-center justify-center p-3 gap-2">
                <Lightbulb className="w-4 h-4 text-red-400" />
                <span className="text-[10px] text-neutral-300 font-medium">LED</span>
              </button>
              <button onClick={() => spawnComponent('Resistor')} className="hardware-card flex flex-col items-center justify-center p-3 gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Resistor</span>
              </button>
              <button onClick={() => spawnComponent('Potentiometer')} className="hardware-card flex flex-col items-center justify-center p-3 gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Trimpot</span>
              </button>
              <button onClick={() => spawnComponent('LDR')} className="hardware-card flex flex-col items-center justify-center p-3 gap-2">
                <CircleDashed className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-neutral-300 font-medium">LDR</span>
              </button>
              <button onClick={() => spawnComponent('Pushbutton')} className="hardware-card flex flex-col items-center justify-center p-3 gap-2">
                <ToggleLeft className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Button</span>
              </button>
              <button onClick={() => spawnComponent('Header')} className="hardware-card flex flex-col items-center justify-center p-3 gap-2">
                <Menu className="w-4 h-4 text-neutral-400" />
                <span className="text-[10px] text-neutral-300 font-medium">Header</span>
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={smartRouteAll}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  <span className="text-xs font-medium">Smart Route All</span>
                </div>
              </button>

              <button
                onClick={() => { if (confirm('Clear all traces?')) { saveHistory(); setWires([]); } }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-white/5 hover:border-white/10 hover:bg-neutral-800 transition-all group"
              >
                <div className="flex items-center gap-2 text-neutral-400 group-hover:text-white transition-colors">
                  <Trash2 className="w-4 h-4" />
                  <span className="text-xs font-medium">Clear Traces</span>
                </div>
              </button>

              <button
                onClick={() => { if (confirm('Reset board? This cannot be undone.')) { setComponents(createInitialComponents()); setWires([]); setHistory([]); } }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs font-medium">Reset Board</span>
                </div>
              </button>
            </div>
          </div>

          {/* Routing Angle & Trace Color (Only visible in Route mode) */}
          {routingMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 pt-4 border-t border-white/10"
            >
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider flex items-center justify-between">
                  Trace Angle
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{routingAngle}°</span>
                </h3>
                <div className="flex bg-neutral-900/80 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setRoutingAngle('any')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${routingAngle === 'any' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    Any
                  </button>
                  <button
                    onClick={() => setRoutingAngle('90')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${routingAngle === '90' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    90°
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Trace Color</h3>
                <div className="grid grid-cols-5 gap-2">
                  {[COLORS.WIRE_RED, COLORS.WIRE_BLUE, '#10b981', COLORS.WIRE_YELLOW, COLORS.WIRE_BLACK].map(color => (
                    <button
                      key={color}
                      onClick={() => setTraceColor(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all ${traceColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                        }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </motion.aside>

        {/* CENTER CANVAS */}
        <div className="flex-1 relative bg-neutral-900 flex items-center justify-center p-8 custom-scrollbar group z-0 overflow-auto">

          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-2 z-30 pointer-events-auto">
            <div className="flex bg-black/60 backdrop-blur-3xl p-1 rounded-xl border border-white/10 shadow-xl">
              <button
                onClick={undo}
                disabled={history.length === 0}
                className={`p-2 rounded-lg transition-all ${history.length > 0 ? 'text-white hover:bg-white/10' : 'text-neutral-700 cursor-not-allowed'}`}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={future.length === 0}
                className={`p-2 rounded-lg transition-all ${future.length > 0 ? 'text-white hover:bg-white/10' : 'text-neutral-700 cursor-not-allowed'}`}
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex bg-black/60 backdrop-blur-3xl p-1 rounded-xl border border-white/10 shadow-xl">
              <button
                onClick={rotateBoard}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
                title="Rotate Board 90°"
                aria-label="Rotate Board 90 degrees"
              >
                <FlipHorizontal className="w-4 h-4 rotate-90" />
              </button>
              <button
                onClick={() => setShowLabels(!showLabels)}
                className={`p-2 rounded-lg transition-all ${showLabels ? 'text-emerald-400 bg-emerald-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}
                title="Toggle Labels"
                aria-label="Toggle Labels"
              >
                <Box className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`p-2 rounded-lg transition-all ${showGrid ? 'text-emerald-400 bg-emerald-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}
                title="Toggle Grid"
                aria-label="Toggle Grid"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="relative inline-block shadow-2xl transition-transform duration-200"

          >
            {/* Corner Screws */}
            <div className="absolute top-4 left-4 w-4 h-4 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-neutral-900" /></div>
            <div className="absolute top-4 right-4 w-4 h-4 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-neutral-900" /></div>
            <div className="absolute bottom-4 left-4 w-4 h-4 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-neutral-900" /></div>
            <div className="absolute bottom-4 right-4 w-4 h-4 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-neutral-900" /></div>

            <motion.svg
              id="pcb-svg"
              width={gridCols * HOLE_SPACING + PCB_PADDING * 2}
              height={gridRows * HOLE_SPACING + PCB_PADDING * 2}
              viewBox={`0 0 ${gridCols * HOLE_SPACING + PCB_PADDING * 2} ${gridRows * HOLE_SPACING + PCB_PADDING * 2}`}
              initial={false}
              animate={{ rotateY: view === 'bottom' ? 180 : 0 }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onMouseDown={(e) => {
                if (routingMode || view === 'bottom') return;
                const svg = e.currentTarget;
                const CTM = svg.getScreenCTM();
                if (!CTM) return;
                const mouseX = (e.clientX - CTM.e) / CTM.a;
                const mouseY = (e.clientY - CTM.f) / CTM.d;
                setSelectionBox({ start: { x: mouseX, y: mouseY }, end: { x: mouseX, y: mouseY } });
                if (!e.shiftKey) {
                  setSelectedIds([]);
                  setSelectedWireId(null);
                }
              }}
              onClick={(e) => {
                handleSvgClick(e);
              }}
            >
              {/* PCB Base */}
              <rect
                x={0} y={0}
                width={gridCols * HOLE_SPACING + PCB_PADDING * 2}
                height={gridRows * HOLE_SPACING + PCB_PADDING * 2}
                fill={COLORS.PCB_GREEN}
                rx={12}
              />

              {/* Grid Holes */}
              {renderGrid()}

              {/* Grid Labels */}
              {renderGridLabels()}

              {/* Wires (Bottom Side) */}
              {renderWires()}

              {/* Components (Face Side) */}
              <g style={{ transform: view === 'bottom' ? 'scaleX(-1)' : 'none', transformOrigin: 'center' }}>
                {renderComponents()}
              </g>

              {/* Selection Box */}
              {selectionBox && (
                <rect
                  x={Math.min(selectionBox.start.x, selectionBox.end.x)}
                  y={Math.min(selectionBox.start.y, selectionBox.end.y)}
                  width={Math.abs(selectionBox.end.x - selectionBox.start.x)}
                  height={Math.abs(selectionBox.end.y - selectionBox.start.y)}
                  fill="rgba(59, 130, 246, 0.1)"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />
              )}
            </motion.svg>

          </div>
        </div>

        {/* RIGHT SIDEBAR - Context & Management */}
        <motion.aside
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="w-[320px] bg-black/60 backdrop-blur-3xl border-l border-white/10 p-5 flex flex-col gap-6 z-40 overflow-y-auto custom-scrollbar shadow-2xl h-full"
        >
          {/* Recommendations Context */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-400 mb-2">
              <AlertCircle className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">Recommendations</h3>
            </div>
            {(() => {
              const recs = getRecommendations();
              return recs.length > 0 ? (
                <div className="space-y-2">
                  {recs.map((rec, i) => (
                    <div key={i} className={`p-3 rounded-xl border text-xs leading-relaxed ${rec.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-300' :
                      rec.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
                        'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      }`}>
                      {rec.msg}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-white/5 bg-neutral-900 text-neutral-500 text-xs text-center flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500/50" />
                  Board looks good!
                </div>
              );
            })()}
          </div>

          {/* Inspector (Selection-aware) */}
          {selectedIds.length === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 pt-4 border-t border-white/10"
            >
              {(() => {
                const comp = components.find(c => c.id === selectedIds[0]);
                if (!comp) return null;
                return (
                  <>
                    <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider flex items-center justify-between">
                      Component Inspector
                      <span className="text-[10px] text-neutral-400 bg-white/5 px-1.5 py-0.5 rounded font-mono">{comp.type}</span>
                    </h3>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1 block">Label</label>
                        <input
                          type="text"
                          value={comp.label}
                          onChange={(e) => updateComponentProp(comp.id, { label: e.target.value })}
                          className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1 block">X Position</label>
                          <input
                            type="number"
                            value={comp.position.x}
                            min={0} max={gridCols - 1}
                            onChange={(e) => updateComponentProp(comp.id, { position: { ...comp.position, x: parseInt(e.target.value) || 0 } })}
                            className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1 block">Y Position</label>
                          <input
                            type="number"
                            value={comp.position.y}
                            min={0} max={gridRows - 1}
                            onChange={(e) => updateComponentProp(comp.id, { position: { ...comp.position, y: parseInt(e.target.value) || 0 } })}
                            className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}

          {/* Trace Manager */}
          <div className="space-y-3 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Trace Manager</h3>
              <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-neutral-400">{wires.length} Total</span>
            </div>

            <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
              {wires.map(wire => (
                <div key={wire.id} className="group flex items-center justify-between p-2 rounded-lg bg-neutral-900 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: wire.color }} />
                    <span className="text-xs font-mono text-neutral-300">
                      {wire.startConnection ? components.find(c => c.id === wire.startConnection?.componentId)?.label : 'GND'} → {components.find(c => c.id === wire.endConnection?.componentId)?.label || 'Via'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      saveHistory();
                      setWires(prev => prev.filter(w => w.id !== wire.id));
                    }}
                    className="p-1 rounded bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {wires.length === 0 && (
                <div className="text-xs text-neutral-500 text-center py-4 border border-dashed border-white/10 rounded-lg">
                  No traces routed yet
                </div>
              )}
            </div>
          </div>

          {/* VCC Tapping Order */}
          <div className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider flex items-center justify-between">
              VCC Tapping Order
              <button
                onClick={() => setVccDaisyChainOrder([])}
                className="text-[10px] text-neutral-400 hover:text-white"
              >
                Reset
              </button>
            </h3>
            <div className="p-3 bg-neutral-900 border border-white/5 rounded-xl text-xs text-neutral-400">
              {vccDaisyChainOrder.length === 0 ? (
                <p>Click components in routing mode to define custom VCC chain order.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {vccDaisyChainOrder.map((id, idx) => {
                    const comp = components.find(c => c.id === id);
                    return comp ? (
                      <div key={id} className="flex items-center gap-1.5">
                        {idx > 0 && <span className="text-neutral-600">→</span>}
                        <span className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-white">{comp.label}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.aside>

      </main>

      {/* Footer Status Bar */}
      <footer className="h-8 shrink-0 bg-neutral-900 border-t border-white/5 px-6 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>System Ready</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-3 h-3" />
            <span>MCU: ATMEGA328P</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span>{components.length} Components</span>
          <span>{wires.length} Traces</span>
          <span className="text-neutral-800">© 2026 Hardware Labs</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
