
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { toPng, toJpeg, toSvg } from 'html-to-image';
import { GraphState, NodeData, EdgeData, NodeType, DragState, ConnectionState, SelectionBoxState, ShapeData, ShapeType, HandleSide } from './types';
import Toolbar from './components/Toolbar';
import PropertiesPanel from './components/PropertiesPanel';
import AIPanel from './components/AIPanel';
import { 
  User, Building, MapPin, Calendar, Square, CreditCard, Briefcase, Flag, FileText,
  Phone, Mail, Home, DollarSign, Car, AlertTriangle, Globe, File, Landmark, Crop,
  Clock, Key, Lock, Shield, Trophy, Heart, Star, Zap, ShoppingCart, Camera, Video, Music, Search, Link, Hash,
  Check, RotateCcw, X as XIcon, Sparkles, Image as ImageIcon, StickyNote
} from 'lucide-react';

const INITIAL_SCALE = 1;

// Constants for Node Geometry (to calculate arrow intersections)
const NODE_WIDTH = 160;
const NODE_HEIGHT_ESTIMATE = 104; // Base height of standard node card body
const NODE_OFFSET_X = 80; // Center offset X
const NODE_OFFSET_Y = 52; // Center offset Y (approx)

const getNodeDimensions = (node: NodeData) => {
  if (node.type === NodeType.IMAGE) {
    const w = node.width || 240;
    const imgH = node.height || 180;
    const labelH = node.label ? 32 : 0;
    const detailsH = node.details && node.details.length > 0 ? 12 + node.details.length * 18 : 0;
    const h = imgH + labelH + detailsH;
    return { width: w, height: h, offsetX: w / 2, offsetY: h / 2 };
  }
  if (node.type === NodeType.POSTIT) {
    const w = node.width || 220;
    const baseH = node.height || 180;
    const detailsH = node.details && node.details.length > 0 ? 12 + node.details.length * 18 : 0;
    const h = baseH + detailsH;
    return { width: w, height: h, offsetX: w / 2, offsetY: h / 2 };
  }
  const detailsH = node.details && node.details.length > 0 ? 10 + node.details.length * 18 : 0;
  const h = NODE_HEIGHT_ESTIMATE + detailsH;
  return { width: NODE_WIDTH, height: h, offsetX: NODE_OFFSET_X, offsetY: h / 2 };
};

const getNodeHandlePoint = (node: NodeData, side: HandleSide) => {
  const dim = getNodeDimensions(node);
  const isFlatTopCard = node.type === NodeType.IMAGE || node.type === NodeType.POSTIT;
  switch (side) {
    case 'top':
      // Standard nodes have a portrait frame sticking 64px (-top-16) above the card
      return {
        x: node.x + dim.offsetX,
        y: isFlatTopCard ? node.y : node.y - 64
      };
    case 'bottom':
      return { x: node.x + dim.offsetX, y: node.y + dim.height };
    case 'left':
      return { x: node.x, y: node.y + dim.offsetY };
    case 'right':
      return { x: node.x + dim.width, y: node.y + dim.offsetY };
  }
};

const getLayoutPositions = (currentNodes: NodeData[], currentEdges: EdgeData[], layoutType: string): NodeData[] => {
  if (currentNodes.length === 0) return currentNodes;
  const centerX = 500;
  const centerY = 350;

  switch (layoutType) {
    case 'circle': {
      const radius = Math.min(280, currentNodes.length * 35 + 80);
      return currentNodes.map((node, i) => {
        const angle = (i / currentNodes.length) * 2 * Math.PI;
        return {
          ...node,
          x: centerX + Math.cos(angle) * radius - 80,
          y: centerY + Math.sin(angle) * radius - 40
        };
      });
    }

    case 'grid': {
      const cols = Math.ceil(Math.sqrt(currentNodes.length)) || 1;
      const hSpacing = 200;
      const vSpacing = 160;
      const startX = 150;
      const startY = 150;
      return currentNodes.map((node, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        return {
          ...node,
          x: startX + col * hSpacing,
          y: startY + row * vSpacing
        };
      });
    }

    case 'dual-ring': {
      const degrees: Record<string, number> = {};
      currentNodes.forEach(n => { degrees[n.id] = 0; });
      currentEdges.forEach(e => {
        if (degrees[e.source] !== undefined) degrees[e.source]++;
        if (degrees[e.target] !== undefined) degrees[e.target]++;
      });
      const sortedNodes = [...currentNodes].sort((a, b) => (degrees[b.id] || 0) - (degrees[a.id] || 0));
      const innerCount = Math.max(1, Math.min(Math.floor(sortedNodes.length / 3), 5));
      const innerNodes = sortedNodes.slice(0, innerCount);
      const outerNodes = sortedNodes.slice(innerCount);

      return currentNodes.map(node => {
        const isInner = innerNodes.some(inNode => inNode.id === node.id);
        if (isInner) {
          const idx = innerNodes.findIndex(inNode => inNode.id === node.id);
          const angle = (idx / innerNodes.length) * 2 * Math.PI;
          const radius = 100;
          return {
            ...node,
            x: centerX + Math.cos(angle) * radius - 80,
            y: centerY + Math.sin(angle) * radius - 40
          };
        } else {
          const idx = outerNodes.findIndex(outNode => outNode.id === node.id);
          const angle = (idx / (outerNodes.length || 1)) * 2 * Math.PI;
          const radius = 260;
          return {
            ...node,
            x: centerX + Math.cos(angle) * radius - 80,
            y: centerY + Math.sin(angle) * radius - 40
          };
        }
      });
    }

    case 'hierarchical': {
      const tiers: Record<NodeType, number> = {
        [NodeType.ORGANIZATION]: 0,
        [NodeType.PERSON]: 1,
        [NodeType.LOCATION]: 2,
        [NodeType.EVENT]: 2,
        [NodeType.GENERIC]: 3,
        [NodeType.IMAGE]: 3,
        [NodeType.POSTIT]: 3
      };
      const nodesByTier: Record<number, NodeData[]> = { 0: [], 1: [], 2: [], 3: [] };
      currentNodes.forEach(node => {
        const tierIdx = tiers[node.type] !== undefined ? tiers[node.type] : 3;
        nodesByTier[tierIdx].push(node);
      });

      const startY = 100;
      const vSpacing = 160;
      const canvasWidth = 1000;

      return currentNodes.map(node => {
        const tierIdx = tiers[node.type] !== undefined ? tiers[node.type] : 3;
        const tierNodes = nodesByTier[tierIdx];
        const idx = tierNodes.findIndex(n => n.id === node.id);
        const totalInTier = tierNodes.length;
        const hSpacing = canvasWidth / (totalInTier + 1);
        return {
          ...node,
          x: hSpacing * (idx + 1) - 80,
          y: startY + tierIdx * vSpacing
        };
      });
    }

    case 'star': {
      const degrees: Record<string, number> = {};
      currentNodes.forEach(n => { degrees[n.id] = 0; });
      currentEdges.forEach(e => {
        if (degrees[e.source] !== undefined) degrees[e.source]++;
        if (degrees[e.target] !== undefined) degrees[e.target]++;
      });
      
      let maxDegreeNodeId = currentNodes[0]?.id || "";
      let maxDegree = -1;
      currentNodes.forEach(node => {
        const deg = degrees[node.id] || 0;
        if (deg > maxDegree) {
          maxDegree = deg;
          maxDegreeNodeId = node.id;
        }
      });

      const orbitNodes = currentNodes.filter(n => n.id !== maxDegreeNodeId);

      return currentNodes.map(node => {
        if (node.id === maxDegreeNodeId) {
          return { ...node, x: centerX - 80, y: centerY - 40 };
        } else {
          const idx = orbitNodes.findIndex(n => n.id === node.id);
          const angle = (idx / (orbitNodes.length || 1)) * 2 * Math.PI;
          const radius = 220;
          return {
            ...node,
            x: centerX + Math.cos(angle) * radius - 80,
            y: centerY + Math.sin(angle) * radius - 40
          };
        }
      });
    }

    case 'random': {
      return currentNodes.map(node => ({
        ...node,
        x: 150 + Math.random() * 600,
        y: 100 + Math.random() * 400
      }));
    }

    case 'no-cross': {
      const n = currentNodes.length;
      if (n <= 1) return currentNodes;

      // Exact visual bounding box helpers (accounting for -top-16 portrait on standard nodes)
      const getNodeBox = (node: NodeData, x: number, y: number, padX = 36, padY = 36) => {
        const dim = getNodeDimensions(node);
        const isFlatTop = node.type === NodeType.IMAGE || node.type === NodeType.POSTIT;
        const topExtra = isFlatTop ? 0 : 64;
        return {
          left: x - padX,
          right: x + dim.width + padX,
          top: y - topExtra - padY,
          bottom: y + dim.height + padY,
          width: dim.width + padX * 2,
          height: dim.height + topExtra + padY * 2,
          cx: x + dim.offsetX,
          cy: y + (dim.height - topExtra) / 2
        };
      };

      const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
        (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);

      const segmentsIntersect = (
        ax: number, ay: number, bx: number, by: number,
        cx: number, cy: number, dx: number, dy: number
      ) => {
        return (
          ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
          ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
        );
      };

      // Distance from point (px, py) to segment (ax, ay)-(bx, by)
      const pointToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
        const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
        if (l2 === 0) return { dist: Math.hypot(px - ax, py - ay), projX: ax, projY: ay, t: 0 };
        let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
        t = Math.max(0.08, Math.min(0.92, t));
        const projX = ax + t * (bx - ax);
        const projY = ay + t * (by - ay);
        return { dist: Math.hypot(px - projX, py - projY), projX, projY, t };
      };

      // Deduplicate undirected edges for topology analysis
      const nodeMap = new Map<string, NodeData>();
      currentNodes.forEach(node => nodeMap.set(node.id, node));

      const uniqueEdges: Array<{ u: string; v: string }> = [];
      const seenPairs = new Set<string>();
      const adj = new Map<string, Set<string>>();
      currentNodes.forEach(node => adj.set(node.id, new Set()));

      currentEdges.forEach(edge => {
        if (edge.source === edge.target) return;
        if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return;
        const pairKey = [edge.source, edge.target].sort().join('::');
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          uniqueEdges.push({ u: edge.source, v: edge.target });
        }
        adj.get(edge.source)?.add(edge.target);
        adj.get(edge.target)?.add(edge.source);
      });

      const countCrossings = (pos: Map<string, { x: number; y: number }>, edgeList: Array<{ u: string; v: string }>) => {
        let crossings = 0;
        for (let i = 0; i < edgeList.length; i++) {
          const e1 = edgeList[i];
          const p1 = pos.get(e1.u)!;
          const p2 = pos.get(e1.v)!;
          const n1 = nodeMap.get(e1.u)!;
          const n2 = nodeMap.get(e1.v)!;
          const d1 = getNodeDimensions(n1);
          const d2 = getNodeDimensions(n2);
          const a1x = p1.x + d1.offsetX, a1y = p1.y + d1.offsetY;
          const a2x = p2.x + d2.offsetX, a2y = p2.y + d2.offsetY;

          for (let j = i + 1; j < edgeList.length; j++) {
            const e2 = edgeList[j];
            if (e1.u === e2.u || e1.u === e2.v || e1.v === e2.u || e1.v === e2.v) continue;
            const p3 = pos.get(e2.u)!;
            const p4 = pos.get(e2.v)!;
            const n3 = nodeMap.get(e2.u)!;
            const n4 = nodeMap.get(e2.v)!;
            const d3 = getNodeDimensions(n3);
            const d4 = getNodeDimensions(n4);
            const b1x = p3.x + d3.offsetX, b1y = p3.y + d3.offsetY;
            const b2x = p4.x + d4.offsetX, b2y = p4.y + d4.offsetY;

            if (segmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y)) {
              crossings++;
            }
          }
        }
        return crossings;
      };

      const totalEdgeLength = (pos: Map<string, { x: number; y: number }>, edgeList: Array<{ u: string; v: string }>) => {
        let sum = 0;
        for (const e of edgeList) {
          const p1 = pos.get(e.u)!;
          const p2 = pos.get(e.v)!;
          sum += Math.hypot(p1.x - p2.x, p1.y - p2.y);
        }
        return sum;
      };

      // 1. Find connected components
      const visited = new Set<string>();
      const components: string[][] = [];
      currentNodes.forEach(node => {
        if (visited.has(node.id)) return;
        const comp: string[] = [];
        const queue = [node.id];
        visited.add(node.id);
        while (queue.length > 0) {
          const curr = queue.shift()!;
          comp.push(curr);
          adj.get(curr)?.forEach(nb => {
            if (!visited.has(nb)) {
              visited.add(nb);
              queue.push(nb);
            }
          });
        }
        components.push(comp);
      });

      // Sort larger components first
      components.sort((a, b) => b.length - a.length);

      const finalPositions = new Map<string, { x: number; y: number }>();

      // Layout each connected component independently to guarantee zero inter-component crossings
      const layoutComponent = (compIds: string[]): Map<string, { x: number; y: number }> => {
        const compSet = new Set(compIds);
        const compEdges = uniqueEdges.filter(e => compSet.has(e.u) && compSet.has(e.v));

        if (compIds.length === 1) {
          const m = new Map<string, { x: number; y: number }>();
          m.set(compIds[0], { x: 0, y: 0 });
          return m;
        }

        if (compIds.length === 2) {
          const m = new Map<string, { x: number; y: number }>();
          const d0 = getNodeDimensions(nodeMap.get(compIds[0])!);
          m.set(compIds[0], { x: 0, y: 0 });
          m.set(compIds[1], { x: d0.width + 140, y: 0 });
          return m;
        }

        // Pick hub (highest degree in component)
        const sortedByDeg = [...compIds].sort(
          (a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0)
        );
        const rootId = sortedByDeg[0];

        // --- Candidate A: Sugiyama Layered Layout with Barycenter Crossing Reduction ---
        const buildLayeredCandidate = (): Map<string, { x: number; y: number }> => {
          const layers: string[][] = [];
          const layerOf = new Map<string, number>();
          const q = [rootId];
          layerOf.set(rootId, 0);
          while (q.length > 0) {
            const u = q.shift()!;
            const l = layerOf.get(u)!;
            if (!layers[l]) layers[l] = [];
            layers[l].push(u);
            adj.get(u)?.forEach(v => {
              if (compSet.has(v) && !layerOf.has(v)) {
                layerOf.set(v, l + 1);
                q.push(v);
              }
            });
          }

          // Barycenter sweeps up and down to minimize crossings between layers
          for (let iter = 0; iter < 12; iter++) {
            for (let l = 1; l < layers.length; l++) {
              const prevLayer = layers[l - 1];
              const prevIdx = new Map<string, number>();
              prevLayer.forEach((id, idx) => prevIdx.set(id, idx));
              layers[l].sort((a, b) => {
                const aNbs = Array.from(adj.get(a) || []).filter(nb => prevIdx.has(nb));
                const bNbs = Array.from(adj.get(b) || []).filter(nb => prevIdx.has(nb));
                const aBary = aNbs.length
                  ? aNbs.reduce((s, nb) => s + prevIdx.get(nb)!, 0) / aNbs.length
                  : 999;
                const bBary = bNbs.length
                  ? bNbs.reduce((s, nb) => s + prevIdx.get(nb)!, 0) / bNbs.length
                  : 999;
                return aBary - bBary;
              });
            }
            for (let l = layers.length - 2; l >= 0; l--) {
              const nextLayer = layers[l + 1];
              const nextIdx = new Map<string, number>();
              nextLayer.forEach((id, idx) => nextIdx.set(id, idx));
              layers[l].sort((a, b) => {
                const aNbs = Array.from(adj.get(a) || []).filter(nb => nextIdx.has(nb));
                const bNbs = Array.from(adj.get(b) || []).filter(nb => nextIdx.has(nb));
                const aBary = aNbs.length
                  ? aNbs.reduce((s, nb) => s + nextIdx.get(nb)!, 0) / aNbs.length
                  : 999;
                const bBary = bNbs.length
                  ? bNbs.reduce((s, nb) => s + nextIdx.get(nb)!, 0) / bNbs.length
                  : 999;
                return aBary - bBary;
              });
            }
          }

          const pos = new Map<string, { x: number; y: number }>();
          const hGap = 280;
          const vGap = 250;
          layers.forEach((layer, lIdx) => {
            const rowWidth = (layer.length - 1) * hGap;
            layer.forEach((id, idx) => {
              // Slight vertical stagger on wide rows so horizontal edges within same layer don't overlap nodes
              const staggerY = layer.length > 2 ? (idx % 2 === 0 ? -18 : 18) : 0;
              pos.set(id, {
                x: -rowWidth / 2 + idx * hGap,
                y: lIdx * vGap + staggerY
              });
            });
          });
          return pos;
        };

        // --- Candidate B: Planar Radial Subtree Wedge Layout (0 crossings on trees/stars) ---
        const buildRadialWedgeCandidate = (): Map<string, { x: number; y: number }> => {
          const children = new Map<string, string[]>();
          const depth = new Map<string, number>();
          const seen = new Set<string>([rootId]);
          depth.set(rootId, 0);
          const q = [rootId];
          while (q.length > 0) {
            const u = q.shift()!;
            children.set(u, []);
            const nbs = Array.from(adj.get(u) || []).filter(v => compSet.has(v));
            nbs.sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0));
            nbs.forEach(v => {
              if (!seen.has(v)) {
                seen.add(v);
                depth.set(v, (depth.get(u) || 0) + 1);
                children.get(u)!.push(v);
                q.push(v);
              }
            });
          }

          const leafWeight = new Map<string, number>();
          const calcWeight = (u: string): number => {
            const ch = children.get(u) || [];
            if (ch.length === 0) {
              leafWeight.set(u, 1);
              return 1;
            }
            const sum = ch.reduce((acc, c) => acc + calcWeight(c), 0);
            leafWeight.set(u, sum);
            return sum;
          };
          calcWeight(rootId);

          const pos = new Map<string, { x: number; y: number }>();
          pos.set(rootId, { x: 0, y: 0 });
          const ringStep = 270;

          const assignAngles = (u: string, startAngle: number, endAngle: number) => {
            const ch = children.get(u) || [];
            if (ch.length === 0) return;
            const totalW = ch.reduce((acc, c) => acc + (leafWeight.get(c) || 1), 0);
            let cur = startAngle;
            ch.forEach(c => {
              const w = leafWeight.get(c) || 1;
              const span = ((endAngle - startAngle) * w) / totalW;
              const mid = cur + span / 2;
              const r = (depth.get(c) || 1) * ringStep;
              pos.set(c, {
                x: Math.cos(mid) * r,
                y: Math.sin(mid) * r
              });
              assignAngles(c, cur, cur + span);
              cur += span;
            });
          };

          assignAngles(rootId, 0, Math.PI * 2);
          return pos;
        };

        // --- Candidate C: DFS Ordered Circular Layout ---
        const buildCircularCandidate = (): Map<string, { x: number; y: number }> => {
          const order: string[] = [];
          const seen = new Set<string>();
          const dfs = (u: string) => {
            seen.add(u);
            order.push(u);
            const nbs = Array.from(adj.get(u) || []).filter(v => compSet.has(v));
            nbs.sort((a, b) => (adj.get(a)?.size || 0) - (adj.get(b)?.size || 0));
            nbs.forEach(v => {
              if (!seen.has(v)) dfs(v);
            });
          };
          dfs(rootId);

          const pos = new Map<string, { x: number; y: number }>();
          const radius = Math.max(220, order.length * 48);
          order.forEach((id, idx) => {
            const angle = (idx / order.length) * Math.PI * 2;
            pos.set(id, {
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius
            });
          });
          return pos;
        };

        const candidates = [
          buildRadialWedgeCandidate(),
          buildLayeredCandidate(),
          buildCircularCandidate()
        ];

        // Choose candidate with minimum crossings (tie-break by total edge length)
        let bestPos = candidates[0];
        let bestCrossings = countCrossings(bestPos, compEdges);
        let bestLen = totalEdgeLength(bestPos, compEdges);

        for (let i = 1; i < candidates.length; i++) {
          const cand = candidates[i];
          const cCount = countCrossings(cand, compEdges);
          const cLen = totalEdgeLength(cand, compEdges);
          if (cCount < bestCrossings || (cCount === bestCrossings && cLen < bestLen)) {
            bestPos = cand;
            bestCrossings = cCount;
            bestLen = cLen;
          }
        }

        // 2. Combinatorial 2-opt swap pass to eliminate remaining edge crossings
        if (bestCrossings > 0 && compIds.length <= 60) {
          let improved = true;
          let pass = 0;
          while (improved && pass < 25 && bestCrossings > 0) {
            improved = false;
            pass++;
            for (let i = 0; i < compIds.length; i++) {
              for (let j = i + 1; j < compIds.length; j++) {
                const u = compIds[i];
                const v = compIds[j];
                const pu = bestPos.get(u)!;
                const pv = bestPos.get(v)!;

                // Try swapping positions of u and v
                bestPos.set(u, pv);
                bestPos.set(v, pu);

                const newCrossings = countCrossings(bestPos, compEdges);
                const newLen = totalEdgeLength(bestPos, compEdges);

                if (
                  newCrossings < bestCrossings ||
                  (newCrossings === bestCrossings && newLen < bestLen - 15)
                ) {
                  bestCrossings = newCrossings;
                  bestLen = newLen;
                  improved = true;
                } else {
                  // Revert swap
                  bestPos.set(u, pu);
                  bestPos.set(v, pv);
                }
              }
            }
          }
        }

        // 3. Continuous Stress, Node-Edge Clearance & Overlap Repulsion
        const idealEdgeLen = 280;
        for (let iter = 0; iter < 90; iter++) {
          const forces = new Map<string, { fx: number; fy: number }>();
          compIds.forEach(id => forces.set(id, { fx: 0, fy: 0 }));

          // 3a. Node-Node repulsion (strong inverse-square + bounding box clearance)
          for (let i = 0; i < compIds.length; i++) {
            for (let j = i + 1; j < compIds.length; j++) {
              const idA = compIds[i];
              const idB = compIds[j];
              const pA = bestPos.get(idA)!;
              const pB = bestPos.get(idB)!;
              const boxA = getNodeBox(nodeMap.get(idA)!, pA.x, pA.y, 44, 44);
              const boxB = getNodeBox(nodeMap.get(idB)!, pB.x, pB.y, 44, 44);

              let dx = boxB.cx - boxA.cx;
              let dy = boxB.cy - boxA.cy;
              if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
                dx = (i % 2 === 0 ? 1 : -1) * 5;
                dy = (j % 2 === 0 ? 1 : -1) * 5;
              }

              const overlapX = (boxA.width + boxB.width) / 2 - Math.abs(dx);
              const overlapY = (boxA.height + boxB.height) / 2 - Math.abs(dy);

              if (overlapX > 0 && overlapY > 0) {
                const pushX = (dx >= 0 ? 1 : -1) * (overlapX * 0.45 + 6);
                const pushY = (dy >= 0 ? 1 : -1) * (overlapY * 0.45 + 6);
                forces.get(idA)!.fx -= pushX;
                forces.get(idA)!.fy -= pushY;
                forces.get(idB)!.fx += pushX;
                forces.get(idB)!.fy += pushY;
              } else {
                const distSq = dx * dx + dy * dy + 100;
                const dist = Math.sqrt(distSq);
                const rep = 45000 / distSq;
                forces.get(idA)!.fx -= (dx / dist) * rep;
                forces.get(idA)!.fy -= (dy / dist) * rep;
                forces.get(idB)!.fx += (dx / dist) * rep;
                forces.get(idB)!.fy += (dy / dist) * rep;
              }
            }
          }

          // 3b. Edge spring attraction
          compEdges.forEach(e => {
            const pU = bestPos.get(e.u)!;
            const pV = bestPos.get(e.v)!;
            const dx = pV.x - pU.x;
            const dy = pV.y - pU.y;
            const dist = Math.hypot(dx, dy) || 1;
            const delta = (dist - idealEdgeLen) * 0.06;
            const fx = (dx / dist) * delta;
            const fy = (dy / dist) * delta;
            forces.get(e.u)!.fx += fx;
            forces.get(e.u)!.fy += fy;
            forces.get(e.v)!.fx -= fx;
            forces.get(e.v)!.fy -= fy;
          });

          // 3c. Node-Edge repulsion (keep unrelated nodes off connection lines)
          compEdges.forEach(e => {
            const pU = bestPos.get(e.u)!;
            const pV = bestPos.get(e.v)!;
            const dU = getNodeDimensions(nodeMap.get(e.u)!);
            const dV = getNodeDimensions(nodeMap.get(e.v)!);
            const ax = pU.x + dU.offsetX, ay = pU.y + dU.offsetY;
            const bx = pV.x + dV.offsetX, by = pV.y + dV.offsetY;

            compIds.forEach(nodeId => {
              if (nodeId === e.u || nodeId === e.v) return;
              const pW = bestPos.get(nodeId)!;
              const boxW = getNodeBox(nodeMap.get(nodeId)!, pW.x, pW.y, 20, 20);
              const { dist, projX, projY } = pointToSegment(boxW.cx, boxW.cy, ax, ay, bx, by);
              const clearanceRadius = Math.hypot(boxW.width, boxW.height) * 0.52;

              if (dist < clearanceRadius) {
                let nx = boxW.cx - projX;
                let ny = boxW.cy - projY;
                const nLen = Math.hypot(nx, ny);
                if (nLen < 1) {
                  // Perpendicular normal to edge
                  const edx = bx - ax;
                  const edy = by - ay;
                  const eLen = Math.hypot(edx, edy) || 1;
                  nx = -edy / eLen;
                  ny = edx / eLen;
                } else {
                  nx /= nLen;
                  ny /= nLen;
                }
                const strength = (clearanceRadius - dist) * 0.55;
                forces.get(nodeId)!.fx += nx * strength;
                forces.get(nodeId)!.fy += ny * strength;
                forces.get(e.u)!.fx -= nx * strength * 0.25;
                forces.get(e.u)!.fy -= ny * strength * 0.25;
                forces.get(e.v)!.fx -= nx * strength * 0.25;
                forces.get(e.v)!.fy -= ny * strength * 0.25;
              }
            });
          });

          // Apply forces only if they do not increase edge crossings
          const snapshot = new Map<string, { x: number; y: number }>();
          bestPos.forEach((val, key) => snapshot.set(key, { ...val }));

          const cooling = 1 - iter / 110;
          compIds.forEach(id => {
            const f = forces.get(id)!;
            const cur = bestPos.get(id)!;
            const stepX = Math.max(-35, Math.min(35, f.fx * cooling));
            const stepY = Math.max(-35, Math.min(35, f.fy * cooling));
            bestPos.set(id, { x: cur.x + stepX, y: cur.y + stepY });
          });

          const nextCrossings = countCrossings(bestPos, compEdges);
          if (nextCrossings > bestCrossings) {
            // Revert if physics step introduced a new edge crossing
            bestPos = snapshot;
          } else {
            bestCrossings = nextCrossings;
          }
        }

        // 4. Strict Bounding-Box Overlap Removal within Component
        for (let pass = 0; pass < 80; pass++) {
          let anyOverlap = false;
          for (let i = 0; i < compIds.length; i++) {
            for (let j = i + 1; j < compIds.length; j++) {
              const idA = compIds[i];
              const idB = compIds[j];
              const pA = bestPos.get(idA)!;
              const pB = bestPos.get(idB)!;
              const boxA = getNodeBox(nodeMap.get(idA)!, pA.x, pA.y, 32, 32);
              const boxB = getNodeBox(nodeMap.get(idB)!, pB.x, pB.y, 32, 32);

              const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
              const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);

              if (overlapX > 0 && overlapY > 0) {
                anyOverlap = true;
                const dx = boxB.cx - boxA.cx || (i < j ? 1 : -1);
                const dy = boxB.cy - boxA.cy || (i % 2 === 0 ? 1 : -1);
                if (overlapX < overlapY) {
                  const shift = (overlapX / 2 + 4) * (dx >= 0 ? 1 : -1);
                  bestPos.set(idA, { x: pA.x - shift, y: pA.y });
                  bestPos.set(idB, { x: pB.x + shift, y: pB.y });
                } else {
                  const shift = (overlapY / 2 + 4) * (dy >= 0 ? 1 : -1);
                  bestPos.set(idA, { x: pA.x, y: pA.y - shift });
                  bestPos.set(idB, { x: pB.x, y: pB.y + shift });
                }
              }
            }
          }
          if (!anyOverlap) break;
        }

        return bestPos;
      };

      // Pack components neatly without overlapping
      let cursorX = 120;
      let cursorY = 140;
      let currentRowMaxHeight = 0;
      const maxRowWidth = 1400;

      components.forEach(compIds => {
        const compPos = layoutComponent(compIds);

        // Compute bounding box of this component
        let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
        compIds.forEach(id => {
          const p = compPos.get(id)!;
          const box = getNodeBox(nodeMap.get(id)!, p.x, p.y, 16, 16);
          if (box.left < minLeft) minLeft = box.left;
          if (box.top < minTop) minTop = box.top;
          if (box.right > maxRight) maxRight = box.right;
          if (box.bottom > maxBottom) maxBottom = box.bottom;
        });

        const compW = maxRight - minLeft;
        const compH = maxBottom - minTop;

        if (cursorX > 120 && cursorX + compW > maxRowWidth) {
          cursorX = 120;
          cursorY += currentRowMaxHeight + 110;
          currentRowMaxHeight = 0;
        }

        const offsetX = cursorX - minLeft;
        const offsetY = cursorY - minTop;

        compIds.forEach(id => {
          const p = compPos.get(id)!;
          finalPositions.set(id, {
            x: Math.round(p.x + offsetX),
            y: Math.round(p.y + offsetY)
          });
        });

        cursorX += compW + 110;
        if (compH > currentRowMaxHeight) currentRowMaxHeight = compH;
      });

      return currentNodes.map(node => {
        const p = finalPositions.get(node.id);
        return p ? { ...node, x: p.x, y: p.y } : node;
      });
    }

    default:
      return currentNodes;
  }
};

type CropState = {
  isActive: boolean; // Mode enabled via toolbar
  isDrawing: boolean; // User is actively dragging
  isComplete: boolean; // Selection finished, waiting for confirmation
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
} | null;

type DrawingShapeState = {
    type: ShapeType;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
} | null;

type ResizeNodeState = {
  nodeId: string;
  startX: number;
  startY: number;
  initialWidth: number;
  initialHeight: number;
  aspectRatio: number;
} | null;

const App: React.FC = () => {
  // State
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  
  const [scale, setScale] = useState(INITIAL_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // Interaction State
  const [activeTool, setActiveTool] = useState<'CURSOR' | ShapeType>('CURSOR');
  const [dragState, setDragState] = useState<DragState>(null);
  const [resizeNodeState, setResizeNodeState] = useState<ResizeNodeState>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState>(null);
  const [drawingShape, setDrawingShape] = useState<DrawingShapeState>(null);
  const [isDraggingFileOverCanvas, setIsDraggingFileOverCanvas] = useState(false);
  
  // Selection State (Multi-Select)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [editingPostItId, setEditingPostItId] = useState<string | null>(null);

  // Download & Crop & Save State
  const [cropState, setCropState] = useState<CropState>(null);
  const [pendingDownloadFormat, setPendingDownloadFormat] = useState<'png' | 'jpeg' | 'svg' | null>(null);
  const [exportFileName, setExportFileName] = useState<string>('grafo-export');
  const [isSaveProjectModalOpen, setIsSaveProjectModalOpen] = useState<boolean>(false);
  const [projectFileName, setProjectFileName] = useState<string>('grafo-facil-projeto');
  const [clipboardToast, setClipboardToast] = useState<string | null>(null);

  // AI Chat Assistant Panel State
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

  // Refs for canvas calculations
  const canvasRef = useRef<HTMLDivElement>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);
  const tripleClickTrackerRef = useRef<{ id: string; time: number; count: number }>({ id: '', time: 0, count: 0 });
  const lastMouseCanvasPosRef = useRef<{ x: number; y: number } | null>(null);
  const zoomedNodeReturnStateRef = useRef<{ nodeId: string; scale: number; pan: { x: number; y: number } } | null>(null);
  const [isPropertiesHiddenByZoom, setIsPropertiesHiddenByZoom] = useState(false);

  // --- Helpers ---
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const container = appContainerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale
    };
  }, [pan.x, pan.y, scale]);

  // Keep draft connection line following the mouse smoothly across the entire window
  useEffect(() => {
    if (!connectionState?.isConnecting) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const pos = screenToCanvas(e.clientX, e.clientY);
      lastMouseCanvasPosRef.current = pos;
      setConnectionState(prev => (prev && prev.isConnecting ? { ...prev, mousePos: pos } : prev));
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    return () => window.removeEventListener('pointermove', handleWindowPointerMove);
  }, [connectionState?.isConnecting, screenToCanvas]);

  const createImageNodeFromDataUrl = useCallback((
    dataUrl: string,
    targetCanvasPos?: { x: number; y: number },
    offsetIndex: number = 0
  ) => {
    const img = new window.Image();
    img.onload = () => {
      const maxWidth = 380;
      const maxHeight = 280;
      const natW = img.naturalWidth || 240;
      const natH = img.naturalHeight || 180;
      const ratio = Math.min(maxWidth / natW, maxHeight / natH, 1);
      let w = Math.round(natW * ratio);
      let h = Math.round(natH * ratio);
      if (w < 100) {
        const up = 100 / Math.max(1, w);
        w = 100;
        h = Math.max(20, Math.round(h * up));
      }
      h = Math.max(20, h);

      const fallbackCenter = {
        x: (window.innerWidth / 2 - pan.x) / scale,
        y: (window.innerHeight / 2 - pan.y) / scale
      };
      const basePos = targetCanvasPos || lastMouseCanvasPosRef.current || fallbackCenter;
      const newId = `node-img-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const newNode: NodeData = {
        id: newId,
        x: Math.round(basePos.x - w / 2 + offsetIndex * 24),
        y: Math.round(basePos.y - h / 2 + offsetIndex * 24),
        label: '',
        type: NodeType.IMAGE,
        customImage: dataUrl,
        width: w,
        height: h,
        details: []
      };

      setNodes(prev => [...prev, newNode]);
      setSelectedNodeIds(new Set([newId]));
      setSelectedEdgeId(null);
      setSelectedShapeId(null);
      setIsPropertiesHiddenByZoom(false);
      setActiveTool('CURSOR');
    };
    img.onerror = () => {
      // Fallback if image dimensions can't be read
      const fallbackCenter = {
        x: (window.innerWidth / 2 - pan.x) / scale,
        y: (window.innerHeight / 2 - pan.y) / scale
      };
      const basePos = targetCanvasPos || lastMouseCanvasPosRef.current || fallbackCenter;
      const newId = `node-img-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newNode: NodeData = {
        id: newId,
        x: Math.round(basePos.x - 120 + offsetIndex * 24),
        y: Math.round(basePos.y - 90 + offsetIndex * 24),
        label: '',
        type: NodeType.IMAGE,
        customImage: dataUrl,
        width: 240,
        height: 180,
        details: []
      };
      setNodes(prev => [...prev, newNode]);
      setSelectedNodeIds(new Set([newId]));
      setSelectedEdgeId(null);
      setSelectedShapeId(null);
      setActiveTool('CURSOR');
    };
    img.src = dataUrl;
  }, [pan.x, pan.y, scale]);

  const handleAddImageFiles = useCallback((files: FileList, targetPos?: { x: number; y: number }) => {
    let imgIndex = 0;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const currentIdx = imgIndex++;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          createImageNodeFromDataUrl(result, targetPos, currentIdx);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [createImageNodeFromDataUrl]);

  const applyImageToNodeOrCanvas = useCallback((dataUrl: string, idx: number = 0, totalCount: number = 1) => {
    const singleSelectedId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const targetNode = singleSelectedId ? nodes.find(n => n.id === singleSelectedId) : null;

    // If a single entity is selected (e.g., Person, Organization, Location, Event, Generic, or an empty Image card),
    // paste the image directly as that entity's photo!
    if (
      totalCount === 1 &&
      targetNode &&
      targetNode.type !== NodeType.POSTIT &&
      (targetNode.type !== NodeType.IMAGE || !targetNode.customImage)
    ) {
      if (targetNode.type === NodeType.IMAGE) {
        const img = new window.Image();
        img.onload = () => {
          const maxWidth = 380;
          const maxHeight = 280;
          const natW = img.naturalWidth || 240;
          const natH = img.naturalHeight || 180;
          const ratio = Math.min(maxWidth / natW, maxHeight / natH, 1);
          let w = Math.round(natW * ratio);
          let h = Math.round(natH * ratio);
          if (w < 100) {
            const up = 100 / Math.max(1, w);
            w = 100;
            h = Math.max(20, Math.round(h * up));
          }
          setNodes(prev => prev.map(n => n.id === targetNode.id ? { ...n, customImage: dataUrl, width: w, height: Math.max(20, h) } : n));
        };
        img.onerror = () => {
          setNodes(prev => prev.map(n => n.id === targetNode.id ? { ...n, customImage: dataUrl } : n));
        };
        img.src = dataUrl;
      } else {
        setNodes(prev => prev.map(n => n.id === targetNode.id ? { ...n, customImage: dataUrl } : n));
      }

      setClipboardToast(`Foto colada em "${targetNode.label || 'Entidade'}"!`);
      setTimeout(() => {
        setClipboardToast(prev => (prev?.startsWith('Foto colada') ? null : prev));
      }, 2400);
      return;
    }

    createImageNodeFromDataUrl(dataUrl, undefined, idx);
  }, [selectedNodeIds, nodes, createImageNodeFromDataUrl]);

  // Listen for global paste (Ctrl+V / Cmd+V) to paste photo into selected entity or create image entity on canvas
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (cropState?.isActive) return;

      const activeEl = document.activeElement;
      const isEditableFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );

      // Ignore paste inside AIPanel chat
      if (activeEl && activeEl.closest('#helix-chat-panel')) {
        return;
      }

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 1. Check for image files/blobs in clipboard items
      const imageItems = Array.from(clipboardData.items || []).filter(item => item.type.startsWith('image/'));
      if (imageItems.length > 0) {
        e.preventDefault();
        imageItems.forEach((item, idx) => {
          const blob = item.getAsFile();
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            if (dataUrl) {
              applyImageToNodeOrCanvas(dataUrl, idx, imageItems.length);
            }
          };
          reader.readAsDataURL(blob);
        });
        return;
      }

      // 2. If not typing in an input/textarea, also check if clipboard text is a direct image URL or data:image URI
      if (!isEditableFocused) {
        const pastedText = clipboardData.getData('text/plain')?.trim();
        if (
          pastedText &&
          (pastedText.startsWith('data:image/') ||
            /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(pastedText))
        ) {
          e.preventDefault();
          applyImageToNodeOrCanvas(pastedText, 0, 1);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [cropState?.isActive, applyImageToNodeOrCanvas]);

  // Helper to convert any image dataUrl/URL into a PNG Blob for system clipboard compatibility
  const convertImageToPngBlob = useCallback((src: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      // Fast path if already a base64 PNG data URL
      if (src.startsWith('data:image/png;base64,')) {
        try {
          const base64 = src.split(',')[1];
          const byteChars = atob(base64);
          const byteNumbers = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          resolve(new Blob([byteNumbers], { type: 'image/png' }));
          return;
        } catch {
          // Fall through to canvas conversion if atob fails
        }
      }

      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 400;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível criar contexto de imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao converter imagem para PNG.'));
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem para cópia.'));
      img.src = src;
    });
  }, []);

  const copySelectedImageToClipboard = useCallback(async (imageSrc: string) => {
    try {
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const pngBlobPromise = convertImageToPngBlob(imageSrc);
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': pngBlobPromise
          })
        ]);
        setClipboardToast('Imagem copiada para a área de transferência!');
        setTimeout(() => {
          setClipboardToast(prev => (prev === 'Imagem copiada para a área de transferência!' ? null : prev));
        }, 2600);
      }
    } catch (err) {
      console.error('Erro ao copiar imagem para a área de transferência:', err);
      setClipboardToast('Não foi possível copiar a imagem neste navegador.');
      setTimeout(() => setClipboardToast(null), 2600);
    }
  }, [convertImageToPngBlob]);

  // Listen for Ctrl+C / Cmd+C when an image entity (or entity with photo) is selected
  useEffect(() => {
    const handleKeyDownCopy = (e: KeyboardEvent) => {
      if (cropState?.isActive) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return;

      const activeEl = document.activeElement;
      const isEditableFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );
      if (isEditableFocused) return;

      // Don't override if the user highlighted text on the page
      const selectedText = window.getSelection()?.toString();
      if (selectedText && selectedText.trim().length > 0) return;

      if (selectedNodeIds.size === 0) return;

      const selectedNodesList = nodes.filter(n => selectedNodeIds.has(n.id) && n.customImage);
      const targetImageNode =
        selectedNodesList.find(n => n.type === NodeType.IMAGE) || selectedNodesList[0];

      if (targetImageNode?.customImage) {
        e.preventDefault();
        copySelectedImageToClipboard(targetImageNode.customImage);
      }
    };

    window.addEventListener('keydown', handleKeyDownCopy);
    return () => window.removeEventListener('keydown', handleKeyDownCopy);
  }, [cropState?.isActive, selectedNodeIds, nodes, copySelectedImageToClipboard]);

  // Listen for Delete / Backspace to delete selected entities (nodes), connections (edges), or shapes
  useEffect(() => {
    const handleKeyDownDelete = (e: KeyboardEvent) => {
      if (cropState?.isActive) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      const activeEl = document.activeElement;
      const isEditableFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        (activeEl as HTMLElement).isContentEditable
      );
      if (isEditableFocused || editingPostItId) return;

      if (selectedNodeIds.size > 0) {
        e.preventDefault();
        setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
        setEdges(prev => prev.filter(edge => !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target)));
        setSelectedNodeIds(new Set());
        return;
      }

      if (selectedEdgeId) {
        e.preventDefault();
        setEdges(prev => prev.filter(edge => edge.id !== selectedEdgeId));
        setSelectedEdgeId(null);
        return;
      }

      if (selectedShapeId) {
        e.preventDefault();
        setShapes(prev => prev.filter(shape => shape.id !== selectedShapeId));
        setSelectedShapeId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDownDelete);
    return () => window.removeEventListener('keydown', handleKeyDownDelete);
  }, [cropState?.isActive, selectedNodeIds, selectedEdgeId, selectedShapeId, editingPostItId]);

  // Obsidian Canvas Wheel Controls:
  // - Ctrl + Scroll = Zoom (centered on mouse cursor)
  // - Shift + Scroll = Pan left/right (horizontal)
  // - Scroll = Pan up/down (vertical)
  useEffect(() => {
    const container = appContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (cropState?.isActive) return;

      const targetEl = e.target as HTMLElement | null;
      const isInsideScrollablePanel = targetEl?.closest('#helix-chat-panel, #properties-panel');

      // 1. Ctrl + Scroll (or Cmd + Scroll) => Zoom centered at cursor
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomStep = Math.abs(e.deltaY) >= 40
          ? (e.deltaY < 0 ? 1.12 : 0.89)
          : Math.exp(-e.deltaY * 0.0025);

        const newScale = Math.min(Math.max(scale * zoomStep, 0.2), 6);
        const canvasX = (mouseX - pan.x) / scale;
        const canvasY = (mouseY - pan.y) / scale;

        setScale(newScale);
        setPan({
          x: mouseX - canvasX * newScale,
          y: mouseY - canvasY * newScale
        });
        return;
      }

      // Allow normal scrolling inside side panels (PropertiesPanel / AIPanel)
      if (isInsideScrollablePanel) return;

      e.preventDefault();

      // 2. Shift + Scroll => Horizontal pan (left / right)
      if (e.shiftKey) {
        const horizontalDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        setPan(prev => ({
          ...prev,
          x: prev.x - horizontalDelta
        }));
        return;
      }

      // 3. Scroll => Vertical pan (up / down) + trackpad 2D pan
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [cropState?.isActive, pan.x, pan.y, scale]);

  // Calculates the point where a line from sourceCenter to targetCenter hits the target's bounding box.
  const getInterceptPoint = (source: {x: number, y: number}, target: {x: number, y: number}, w: number, h: number) => {
      const dx = target.x - source.x;
      const dy = target.y - source.y;

      if (dx === 0 && dy === 0) return target;

      // The angle of the line
      const theta = Math.atan2(dy, dx);
      
      // Calculate distance to edge assuming rectangle
      const halfW = w / 2;
      const halfH = h / 2;

      const distToVertical = halfW / Math.abs(Math.cos(theta));
      const distToHorizontal = halfH / Math.abs(Math.sin(theta));

      const dist = Math.min(distToVertical, distToHorizontal);

      return {
          x: target.x - Math.cos(theta) * dist,
          y: target.y - Math.sin(theta) * dist
      };
  };

  const getSmartEdgePoints = (
    source: NodeData,
    target: NodeData,
    sourceHandle?: HandleSide,
    targetHandle?: HandleSide
  ) => {
      const sDim = getNodeDimensions(source);
      const tDim = getNodeDimensions(target);
      const sCenter = { x: source.x + sDim.offsetX, y: source.y + sDim.offsetY };
      const tCenter = { x: target.x + tDim.offsetX, y: target.y + tDim.offsetY };

      const start = sourceHandle
        ? getNodeHandlePoint(source, sourceHandle)
        : getInterceptPoint(tCenter, sCenter, sDim.width, sDim.height);

      const end = targetHandle
        ? getNodeHandlePoint(target, targetHandle)
        : getInterceptPoint(start, tCenter, tDim.width, tDim.height);

      return { start, end };
  };

  // Group edges between same nodes to calculate curvature
  const edgeGroups = useMemo(() => {
    const groups: Record<string, EdgeData[]> = {};
    edges.forEach(edge => {
        const key = [edge.source, edge.target].sort().join('-');
        if (!groups[key]) groups[key] = [];
        groups[key].push(edge);
    });
    return groups;
  }, [edges]);

  // --- Handlers: File Ops ---
  const handleSaveProject = () => {
      setIsSaveProjectModalOpen(true);
  };

  const executeSaveProject = () => {
      const cleanName = (projectFileName.trim() || 'grafo-facil-projeto').replace(/\.(hlx|json)$/i, '');
      const projectData: GraphState = { nodes, edges, shapes };
      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cleanName}.hlx`;
      link.click();
      URL.revokeObjectURL(url);
      setIsSaveProjectModalOpen(false);
  };

  const handleLoadProject = (file: File) => {
      const baseName = file.name.replace(/\.(hlx|json)$/i, '');
      if (baseName) {
          setProjectFileName(baseName);
          setExportFileName(baseName);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const text = e.target?.result as string;
              const data = JSON.parse(text);
              if (data.nodes && data.edges) {
                  setNodes(data.nodes);
                  setEdges(data.edges);
                  setShapes(data.shapes || []);
                  setPan({ x: 0, y: 0});
                  setScale(1);
                  setSelectedNodeIds(new Set());
                  setSelectedShapeId(null);
                  setSelectedEdgeId(null);
              } else {
                  setClipboardToast("Arquivo de projeto inválido.");
                  setTimeout(() => setClipboardToast(null), 2600);
              }
          } catch (err) {
              console.error(err);
              setClipboardToast("Erro ao ler arquivo de projeto.");
              setTimeout(() => setClipboardToast(null), 2600);
          }
      };
      reader.readAsText(file);
  };

  // --- Handlers: Nodes ---
  const handleAddNode = (type: NodeType) => {
    const isImg = type === NodeType.IMAGE;
    const isPostIt = type === NodeType.POSTIT;
    const newNode: NodeData = {
      id: `node-${Date.now()}`,
      x: 100 - pan.x / scale + Math.random() * 50, 
      y: 100 - pan.y / scale + Math.random() * 50,
      label: isImg
        ? ''
        : isPostIt
        ? 'Observação'
        : type === NodeType.PERSON
        ? 'Pessoa'
        : type === NodeType.ORGANIZATION
        ? 'Empresa'
        : 'Item',
      type,
      width: isImg ? 240 : isPostIt ? 220 : undefined,
      height: isImg ? 180 : isPostIt ? 180 : undefined,
      noteText: isPostIt ? '' : undefined,
      noteColor: isPostIt ? '#fef08a' : undefined,
      details: []
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeIds(new Set([newNode.id]));
    setSelectedEdgeId(null);
    setSelectedShapeId(null);
    setActiveTool('CURSOR');
  };

  const completeConnection = (targetNodeId: string, targetHandle?: HandleSide) => {
    if (!connectionState?.isConnecting || !connectionState.sourceNodeId) return;
    if (connectionState.sourceNodeId !== targetNodeId) {
      const newEdge: EdgeData = {
        id: `edge-${Date.now()}`,
        source: connectionState.sourceNodeId,
        target: targetNodeId,
        sourceHandle: connectionState.sourceHandle,
        targetHandle,
        label: '',
        direction: 'uni',
        style: 'solid',
        color: '#94a3b8',
        details: []
      };
      setEdges(prev => [...prev, newEdge]);
    }
    setConnectionState(null);
  };

  const handleImageDoubleClickZoom = (e: React.MouseEvent, node: NodeData) => {
    if (cropState?.isActive) return;
    e.stopPropagation();

    const container = appContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const dim = getNodeDimensions(node);
    const padding = 48; // Margin around the screen so the image fills the viewport without cutting off
    const availW = Math.max(200, rect.width - padding * 2);
    const availH = Math.max(200, rect.height - padding * 2);

    const fitScale = Math.min(availW / Math.max(1, dim.width), availH / Math.max(1, dim.height));
    const targetScale = Math.min(Math.max(fitScale, 0.2), 6);

    const nodeCenterX = node.x + dim.width / 2;
    const nodeCenterY = node.y + dim.height / 2;
    const targetPanX = rect.width / 2 - nodeCenterX * targetScale;
    const targetPanY = rect.height / 2 - nodeCenterY * targetScale;

    // If already zoomed into this image, double-clicking again restores the previous view
    const prevZoom = zoomedNodeReturnStateRef.current;
    const isAlreadyZoomedHere =
      prevZoom &&
      prevZoom.nodeId === node.id &&
      Math.abs(scale - targetScale) < 0.05 &&
      Math.abs(pan.x - targetPanX) < 20 &&
      Math.abs(pan.y - targetPanY) < 20;

    if (isAlreadyZoomedHere && prevZoom) {
      setScale(prevZoom.scale);
      setPan(prevZoom.pan);
      zoomedNodeReturnStateRef.current = null;
      setIsPropertiesHiddenByZoom(false);
    } else {
      zoomedNodeReturnStateRef.current = {
        nodeId: node.id,
        scale,
        pan: { ...pan }
      };
      setScale(targetScale);
      setPan({ x: targetPanX, y: targetPanY });
      setIsPropertiesHiddenByZoom(true);
    }

    setDragState(null);
  };

  const handleNodeMouseDown = (e: React.PointerEvent, id: string) => {
    if (cropState?.isActive) return; // Disable node interaction during crop
    if (activeTool !== 'CURSOR') return; // Only interact if cursor tool is active

    e.stopPropagation(); 
    setIsPropertiesHiddenByZoom(false);
    
    // Connection Logic
    if (connectionState?.isConnecting) {
        completeConnection(id);
        return;
    }

    // Triple Click Selection - Selects itself and all directly connected nodes
    const now = Date.now();
    const prevClick = tripleClickTrackerRef.current;
    let clickCount = 1;

    if (prevClick.id === id && (now - prevClick.time) < 500) {
        clickCount = prevClick.count + 1;
    } else {
        clickCount = 1;
    }
    tripleClickTrackerRef.current = { id, time: now, count: clickCount };

    if (clickCount === 3) {
        const relatedNodeIds = new Set<string>();
        relatedNodeIds.add(id);
        edges.forEach(edge => {
            if (edge.source === id) {
                relatedNodeIds.add(edge.target);
            } else if (edge.target === id) {
                relatedNodeIds.add(edge.source);
            }
        });
        setSelectedNodeIds(relatedNodeIds);
        setSelectedEdgeId(null);
        setSelectedShapeId(null);

        // Drag Logic Initialization (for Group of related nodes)
        const { x, y } = screenToCanvas(e.clientX, e.clientY);
        const initialPositions: Record<string, {x: number, y: number}> = {};
        nodes.forEach(n => {
            if (relatedNodeIds.has(n.id)) {
                initialPositions[n.id] = { x: n.x, y: n.y };
            }
        });

        setDragState({
            isDragging: true,
            startX: x,
            startY: y,
            initialPositions
        });
        return;
    }

    // Selection Logic (Multi-Select)
    let newSelection = new Set(selectedNodeIds);
    if (e.shiftKey) {
        // Toggle
        if (newSelection.has(id)) newSelection.delete(id);
        else newSelection.add(id);
    } else {
        // If clicking an unselected node without shift, select ONLY that node
        // If clicking a selected node (part of a group), keep group selected
        if (!newSelection.has(id)) {
            newSelection = new Set([id]);
        }
    }
    setSelectedNodeIds(newSelection);
    setSelectedEdgeId(null);
    setSelectedShapeId(null);

    // Drag Logic Initialization (for Group)
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    
    // Snapshot positions of ALL selected nodes (including the one just clicked)
    const initialPositions: Record<string, {x: number, y: number}> = {};
    nodes.forEach(n => {
        if (newSelection.has(n.id)) {
            initialPositions[n.id] = { x: n.x, y: n.y };
        }
    });

    setDragState({
        isDragging: true,
        startX: x,
        startY: y,
        initialPositions
    });
  };

  const handleNodePointerUp = (e: React.PointerEvent, nodeId: string) => {
    if (connectionState?.isConnecting && connectionState.sourceNodeId && connectionState.sourceNodeId !== nodeId) {
      e.stopPropagation();
      completeConnection(nodeId);
    }
  };

  // --- Handlers: Connections (4 sides: top, bottom, left, right) ---
  const handleHandlePointerDown = (e: React.PointerEvent, nodeId: string, side: HandleSide) => {
    if (cropState?.isActive) return;
    if (activeTool !== 'CURSOR') return;
    e.preventDefault();
    e.stopPropagation();

    // If already connecting from another node, clicking a handle finishes the connection at this handle
    if (connectionState?.isConnecting && connectionState.sourceNodeId) {
      completeConnection(nodeId, side);
      return;
    }

    setConnectionState({
        isConnecting: true,
        sourceNodeId: nodeId,
        sourceHandle: side,
        mousePos: screenToCanvas(e.clientX, e.clientY)
    });
  };

  const handleHandlePointerUp = (e: React.PointerEvent, nodeId: string, side: HandleSide) => {
    if (connectionState?.isConnecting && connectionState.sourceNodeId && connectionState.sourceNodeId !== nodeId) {
      e.stopPropagation();
      completeConnection(nodeId, side);
    }
  };

  // --- Handlers: Shapes ---
  const handleShapeMouseDown = (e: React.PointerEvent, shapeId: string) => {
      if (cropState?.isActive) return;
      if (activeTool !== 'CURSOR') return;
      
      e.stopPropagation();
      setSelectedShapeId(shapeId);
      setSelectedNodeIds(new Set());
      setSelectedEdgeId(null);
      
      // Allow moving shape (simple implementation for single shape drag)
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      const shape = shapes.find(s => s.id === shapeId);
      if (shape) {
          setDragState({
              isDragging: true,
              startX: x,
              startY: y,
              initialPositions: { [shapeId]: { x: shape.x, y: shape.y } }
          });
      }
  };


  // --- Handlers: Canvas & Crop & Selection Box ---
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    // 1. Crop Logic
    if (cropState?.isActive) {
        if (cropState.isComplete) return;
        setCropState({
            ...cropState,
            isDrawing: true,
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY
        });
        return;
    }

    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('#helix-chat-panel, #properties-panel, .export-exclude')) {
        return;
    }

    const { x: canvasX, y: canvasY } = screenToCanvas(e.clientX, e.clientY);

    // 2. Shape Drawing Logic
    if (activeTool !== 'CURSOR') {
        setDrawingShape({
            type: activeTool,
            startX: canvasX,
            startY: canvasY,
            currentX: canvasX,
            currentY: canvasY
        });
        // Clear selections when drawing
        setSelectedNodeIds(new Set());
        setSelectedEdgeId(null);
        setSelectedShapeId(null);
        return;
    }

    // 3. Connection Logic
    if (connectionState?.isConnecting) {
        setConnectionState(null);
        return;
    }
    
    // 4. Selection Box Logic
    // If clicking empty canvas space (outer viewport container, transformed canvas container, or svg layer)
    if (
        e.target === e.currentTarget ||
        e.target === canvasRef.current ||
        (e.target as Element).tagName === 'svg'
    ) {
        if (!e.shiftKey) {
            setSelectedNodeIds(new Set()); // Clear selection if not holding shift
            setSelectedEdgeId(null);
            setSelectedShapeId(null);
        }
        setSelectionBox({
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY,
            isVisible: true
        });
    }
  };

  const startNodeResize = (e: React.PointerEvent, node: NodeData) => {
    if (cropState?.isActive) return;
    e.stopPropagation();
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const w = node.width || (node.type === NodeType.POSTIT ? 220 : 240);
    const h = node.height || 180;
    setSelectedNodeIds(new Set([node.id]));
    setSelectedEdgeId(null);
    setSelectedShapeId(null);
    setResizeNodeState({
      nodeId: node.id,
      startX: x,
      startY: y,
      initialWidth: w,
      initialHeight: h,
      aspectRatio: h / w
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 1. Crop Logic
    if (cropState?.isActive && cropState.isDrawing) {
        setCropState({ ...cropState, currentX: e.clientX, currentY: e.clientY });
        return;
    }

    const { x: canvasX, y: canvasY } = screenToCanvas(e.clientX, e.clientY);
    lastMouseCanvasPosRef.current = { x: canvasX, y: canvasY };

    // 1.5. Resize Image / Post-it Node Logic
    if (resizeNodeState) {
      const dx = canvasX - resizeNodeState.startX;
      const dy = canvasY - resizeNodeState.startY;
      const targetNode = nodes.find(n => n.id === resizeNodeState.nodeId);
      const isPostIt = targetNode?.type === NodeType.POSTIT;
      const newWidth = Math.max(80, Math.min(1200, Math.round(resizeNodeState.initialWidth + dx)));
      const newHeight = (isPostIt || e.shiftKey)
        ? Math.max(isPostIt ? 100 : 24, Math.min(1200, Math.round(resizeNodeState.initialHeight + dy)))
        : Math.max(20, Math.round(newWidth * resizeNodeState.aspectRatio));

      setNodes(prev => prev.map(n => n.id === resizeNodeState.nodeId ? {
        ...n,
        width: newWidth,
        height: newHeight
      } : n));
      return;
    }

    // 2. Shape Drawing Logic
    if (drawingShape) {
        setDrawingShape({
            ...drawingShape,
            currentX: canvasX,
            currentY: canvasY
        });
        return;
    }

    // 3. Connection Logic
    if (connectionState?.isConnecting) {
        setConnectionState(prev => (prev && prev.isConnecting ? { ...prev, mousePos: { x: canvasX, y: canvasY } } : prev));
    }

    // 4. Group Drag Logic (Nodes OR Shape)
    if (dragState?.isDragging) {
        const dx = canvasX - dragState.startX;
        const dy = canvasY - dragState.startY;

        if (selectedShapeId) {
            // Dragging a Shape
             setShapes(prev => prev.map(s => {
                 if (s.id === selectedShapeId && dragState.initialPositions[s.id]) {
                     return {
                         ...s,
                         x: dragState.initialPositions[s.id].x + dx,
                         y: dragState.initialPositions[s.id].y + dy
                     };
                 }
                 return s;
             }));
        } else {
            // Dragging Nodes
            setNodes(prevNodes => prevNodes.map(n => {
                if (dragState.initialPositions[n.id]) {
                    return {
                        ...n,
                        x: dragState.initialPositions[n.id].x + dx,
                        y: dragState.initialPositions[n.id].y + dy
                    };
                }
                return n;
            }));
        }
    }

    // 5. Selection Box Logic
    if (selectionBox?.isVisible) {
        setSelectionBox({ ...selectionBox, currentX: e.clientX, currentY: e.clientY });

        // Calculate Box in Canvas Coordinates
        const start = screenToCanvas(selectionBox.startX, selectionBox.startY);
        const current = screenToCanvas(e.clientX, e.clientY);
        
        const x1 = Math.min(start.x, current.x);
        const x2 = Math.max(start.x, current.x);
        const y1 = Math.min(start.y, current.y);
        const y2 = Math.max(start.y, current.y);

        // Check intersection with all nodes
        const newSelected = new Set(e.shiftKey ? selectedNodeIds : []); // Keep existing if shift
        
        nodes.forEach(node => {
            const dim = getNodeDimensions(node);
            const isFlatTop = node.type === NodeType.IMAGE || node.type === NodeType.POSTIT;
            // Node bounding box (including the -top-16 portrait frame on standard nodes)
            const nX1 = node.x;
            const nX2 = node.x + dim.width;
            const nY1 = isFlatTop ? node.y : node.y - 64;
            const nY2 = node.y + dim.height;

            // Check overlap
            const isOverlapping = !(nX2 < x1 || nX1 > x2 || nY2 < y1 || nY1 > y2);
            
            if (isOverlapping) {
                newSelected.add(node.id);
            }
        });

        setSelectedNodeIds(newSelected);
    }
  };

  const handlePointerUp = async () => {
    if (resizeNodeState) {
      setResizeNodeState(null);
      return;
    }

    // Crop
    if (cropState?.isActive && cropState.isDrawing) {
         const width = Math.abs(cropState.currentX - cropState.startX);
         if (width > 10) {
             setCropState({ ...cropState, isDrawing: false, isComplete: true });
         } else {
             setCropState({ ...cropState, isDrawing: false });
         }
         return;
    }

    // Shape Drawing Finalize
    if (drawingShape) {
        const width = drawingShape.currentX - drawingShape.startX;
        const height = drawingShape.currentY - drawingShape.startY;
        
        // Prevent accidental clicks creating tiny shapes
        if (Math.abs(width) > 5 || Math.abs(height) > 5) {
            const newShape: ShapeData = {
                id: `shape-${Date.now()}`,
                type: drawingShape.type,
                x: drawingShape.startX,
                y: drawingShape.startY,
                width: width,
                height: height,
                color: 'rgba(148, 163, 184, 0.2)' // Default grey transparent
            };
            setShapes([...shapes, newShape]);
            setSelectedShapeId(newShape.id);
        }
        
        setDrawingShape(null);
        setActiveTool('CURSOR'); // Switch back to cursor after drawing
        return;
    }

    // End Drag
    setDragState(null);

    // End Selection Box
    setSelectionBox(null);
  };

  const executeDownload = async () => {
    if (!cropState || !cropState.isComplete || !pendingDownloadFormat) return;

    const element = appContainerRef.current;
    if (!element) return;

    const x = Math.min(cropState.startX, cropState.currentX);
    const y = Math.min(cropState.startY, cropState.currentY);
    const width = Math.abs(cropState.currentX - cropState.startX);
    const height = Math.abs(cropState.currentY - cropState.startY);

    try {
        const isPng = pendingDownloadFormat === 'png';
        
        const options = {
            backgroundColor: isPng ? null : '#f8fafc',
            width: width,
            height: height,
            style: {
                transform: `translate(-${x}px, -${y}px)`,
                transformOrigin: 'top left',
                width: `${element.offsetWidth}px`,
                height: `${element.offsetHeight}px`,
                background: isPng ? 'rgba(0,0,0,0)' : '#f8fafc',
                backgroundColor: isPng ? 'rgba(0,0,0,0)' : '#f8fafc',
            },
            filter: (node: HTMLElement) => {
                const classList = node.classList;
                if (classList && classList.contains('export-exclude')) return false;
                if (isPng && classList && classList.contains('app-background-grid')) return false;
                return true;
            }
        };
        
        let dataUrl = '';
        if (pendingDownloadFormat === 'png') dataUrl = await toPng(element, options);
        else if (pendingDownloadFormat === 'jpeg') dataUrl = await toJpeg(element, options);
        else if (pendingDownloadFormat === 'svg') dataUrl = await toSvg(element, options);

        const cleanExportName = (exportFileName.trim() || 'grafo-export').replace(/\.(png|jpe?g|svg)$/i, '');
        const link = document.createElement('a');
        link.download = `${cleanExportName}.${pendingDownloadFormat}`;
        link.href = dataUrl;
        link.click();

    } catch (err) {
        console.error("Download failed", err);
    }
    
    setCropState(null);
    setPendingDownloadFormat(null);
  };

  const redoCrop = () => {
      if (cropState) {
        setCropState({
            ...cropState,
            isComplete: false,
            isDrawing: false,
            startX: 0, startY: 0, currentX: 0, currentY: 0
        });
      }
  }

  const cancelCrop = () => {
      setCropState(null);
      setPendingDownloadFormat(null);
  }

  const startDownloadSequence = (format: 'png' | 'jpeg' | 'svg') => {
      setPendingDownloadFormat(format);
      if (!exportFileName.trim()) {
          setExportFileName(projectFileName || 'grafo-export');
      }
      setCropState({
          isActive: true,
          isDrawing: false,
          isComplete: false,
          startX: 0,
          startY: 0,
          currentX: 0,
          currentY: 0
      });
      setSelectedNodeIds(new Set());
      setSelectedEdgeId(null);
      setSelectedShapeId(null);
  };

  // --- Data Updates from Properties Panel ---
  const updateNode = (id: string, data: Partial<NodeData>) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, ...data } : n));
  };

  const updateEdge = (id: string, data: Partial<EdgeData>) => {
    setEdges(edges.map(e => e.id === id ? { ...e, ...data } : e));
  };

  const updateShape = (id: string, data: Partial<ShapeData>) => {
      setShapes(shapes.map(s => s.id === id ? { ...s, ...data } : s));
  };

  // --- Agentic AI Tool Execution ---
  const handleApplyToolCalls = (calls: any[]) => {
    setNodes(prevNodes => {
      let currentNodes = [...prevNodes];
      
      setEdges(prevEdges => {
        let currentEdges = [...prevEdges];

        // Robust helper to map a target identifier (either direct ID or label) to an active Node ID
        const findNodeId = (idOrLabel: string) => {
          if (!idOrLabel) return "";
          // 1. Direct ID match
          const directMatch = currentNodes.find(n => n.id === idOrLabel);
          if (directMatch) return directMatch.id;

          // 2. Exact case-insensitive Label match
          const labelMatch = currentNodes.find(n => n.label.toLowerCase() === idOrLabel.toLowerCase());
          if (labelMatch) return labelMatch.id;

          // 3. Fallback: Create node on the fly to fulfill relations
          const newId = `node-ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const newNode: NodeData = {
            id: newId,
            label: idOrLabel,
            type: NodeType.GENERIC,
            x: 150 + Math.random() * 400,
            y: 150 + Math.random() * 400,
            details: []
          };
          currentNodes.push(newNode);
          return newId;
        };

        calls.forEach(call => {
          const { name, args } = call;
          if (!args) return;

          switch (name) {
            case 'setGraphState': {
              if (args.nodes) {
                currentNodes = args.nodes.map((n: any) => {
                  const nType = Object.values(NodeType).includes(n.type) ? n.type : NodeType.GENERIC;
                  return {
                    id: n.id || `node-ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    label: n.label || 'Item',
                    type: nType,
                    noteText: n.noteText,
                    noteColor: n.noteColor || (nType === NodeType.POSTIT ? '#fef08a' : undefined),
                    width: n.width || (nType === NodeType.POSTIT ? 220 : undefined),
                    height: n.height || (nType === NodeType.POSTIT ? 180 : undefined),
                    x: n.x !== undefined ? n.x : 100 + Math.random() * 600,
                    y: n.y !== undefined ? n.y : 100 + Math.random() * 500,
                    details: (n.details || []).map((d: any, i: number) => ({
                      id: d.id || `detail-${i}-${Date.now()}`,
                      icon: d.icon || 'file',
                      value: d.value || ''
                    }))
                  };
                });
              }
              if (args.edges) {
                currentEdges = args.edges.map((e: any, index: number) => ({
                  id: e.id || `edge-${index}-${Date.now()}`,
                  source: e.source,
                  target: e.target,
                  label: e.label || "",
                  color: e.color || "#94a3b8",
                  direction: e.direction || "uni",
                  style: e.style || "solid",
                  details: []
                }));
              }
              break;
            }

            case 'addNode': {
              const newId = `node-ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              const nType = Object.values(NodeType).includes(args.type) ? args.type : NodeType.GENERIC;
              const newNode: NodeData = {
                id: newId,
                label: args.label || (nType === NodeType.POSTIT ? "Observação" : "Novo Nó"),
                type: nType,
                noteText: args.noteText,
                noteColor: args.noteColor || (nType === NodeType.POSTIT ? '#fef08a' : undefined),
                width: args.width || (nType === NodeType.POSTIT ? 220 : undefined),
                height: args.height || (nType === NodeType.POSTIT ? 180 : undefined),
                x: args.x !== undefined ? args.x : 150 + Math.random() * 400,
                y: args.y !== undefined ? args.y : 150 + Math.random() * 400,
                details: (args.details || []).map((d: any, i: number) => ({
                  id: `detail-${i}-${Date.now()}`,
                  icon: d.icon || 'file',
                  value: d.value || ''
                }))
              };
              currentNodes.push(newNode);
              break;
            }

            case 'updateNode': {
              const targetId = findNodeId(args.id);
              if (targetId) {
                currentNodes = currentNodes.map(n => {
                  if (n.id === targetId) {
                    return {
                      ...n,
                      label: args.label !== undefined ? args.label : n.label,
                      type: args.type !== undefined && Object.values(NodeType).includes(args.type) ? args.type : n.type,
                      noteText: args.noteText !== undefined ? args.noteText : n.noteText,
                      noteColor: args.noteColor !== undefined ? args.noteColor : n.noteColor,
                      x: args.x !== undefined ? args.x : n.x,
                      y: args.y !== undefined ? args.y : n.y,
                      details: args.details !== undefined 
                        ? args.details.map((d: any, i: number) => ({
                            id: `detail-${i}-${Date.now()}`,
                            icon: d.icon || 'file',
                            value: d.value || ''
                          }))
                        : n.details
                    };
                  }
                  return n;
                });
              }
              break;
            }

            case 'deleteNode': {
              const targetId = findNodeId(args.id);
              if (targetId) {
                currentNodes = currentNodes.filter(n => n.id !== targetId);
                currentEdges = currentEdges.filter(e => e.source !== targetId && e.target !== targetId);
              }
              break;
            }

            case 'addEdge': {
              const sourceId = findNodeId(args.source);
              const targetId = findNodeId(args.target);
              if (sourceId && targetId) {
                const edgeExists = currentEdges.some(e => e.source === sourceId && e.target === targetId);
                if (!edgeExists) {
                  currentEdges.push({
                    id: `edge-ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    source: sourceId,
                    target: targetId,
                    label: args.label || '',
                    direction: args.direction || 'uni',
                    style: args.style || 'solid',
                    color: args.color || '#94a3b8',
                    details: []
                  });
                }
              }
              break;
            }

            case 'deleteEdge': {
              currentEdges = currentEdges.filter(e => e.id !== args.id);
              break;
            }

            case 'clearGraph': {
              currentNodes = [];
              currentEdges = [];
              break;
            }

            case 'autoLayout': {
              const layoutType = args.type || 'grid';
              currentNodes = getLayoutPositions(currentNodes, currentEdges, layoutType);
              break;
            }

            default:
              console.warn(`Ação desconhecida: ${name}`);
          }
        });

        return currentEdges;
      });

      return currentNodes;
    });
  };

  // --- Rendering Helpers ---
  const getIconComponent = (iconName: string, size: number, className: string = "") => {
      switch (iconName) {
          case 'user': return <User size={size} className={className} />;
          case 'building': return <Building size={size} className={className} />;
          case 'car': return <Car size={size} className={className} />;
          case 'home': return <Home size={size} className={className} />;
          case 'money': return <DollarSign size={size} className={className} />;
          case 'file': return <File size={size} className={className} />;
          case 'alert': return <AlertTriangle size={size} className={className} />;
          case 'phone': return <Phone size={size} className={className} />;
          case 'globe': return <Globe size={size} className={className} />;
          case 'search': return <Search size={size} className={className} />;
          case 'lock': return <Lock size={size} className={className} />;
          case 'shield': return <Shield size={size} className={className} />;
          default: return <Square size={size} className={className} />;
      }
  }

  const getNodeIcon = (node: NodeData, size: number = 24, className: string = "") => {
    if (node.mainIcon) {
        return getIconComponent(node.mainIcon, size, className);
    }
    switch (node.type) {
      case NodeType.PERSON: return <User size={size} className={className} />;
      case NodeType.ORGANIZATION: return <Building size={size} className={className} />;
      case NodeType.LOCATION: return <MapPin size={size} className={className} />;
      case NodeType.EVENT: return <Calendar size={size} className={className} />;
      case NodeType.IMAGE: return <ImageIcon size={size} className={className} />;
      case NodeType.POSTIT: return <StickyNote size={size} className={className} />;
      default: return <Square size={size} className={className} />;
    }
  };

  const getDetailIcon = (iconName: string) => {
    const size = 12;
    switch(iconName) {
        case 'id': return <FileText size={size} />;
        case 'calendar': return <Calendar size={size} />;
        case 'briefcase': return <Briefcase size={size} />;
        case 'map': return <MapPin size={size} />;
        case 'credit': return <CreditCard size={size} />;
        case 'flag': return <Flag size={size} />;
        case 'phone': return <Phone size={size} />;
        case 'mail': return <Mail size={size} />;
        case 'home': return <Home size={size} />;
        case 'money': return <DollarSign size={size} />;
        case 'car': return <Car size={size} />;
        case 'alert': return <AlertTriangle size={size} />;
        case 'globe': return <Globe size={size} />;
        case 'file': return <File size={size} />;
        case 'bank': return <Landmark size={size} />;
        case 'clock': return <Clock size={size} />;
        case 'key': return <Key size={size} />;
        case 'lock': return <Lock size={size} />;
        case 'shield': return <Shield size={size} />;
        case 'trophy': return <Trophy size={size} />;
        case 'heart': return <Heart size={size} />;
        case 'star': return <Star size={size} />;
        case 'zap': return <Zap size={size} />;
        case 'cart': return <ShoppingCart size={size} />;
        case 'camera': return <Camera size={size} />;
        case 'video': return <Video size={size} />;
        case 'music': return <Music size={size} />;
        case 'search': return <Search size={size} />;
        case 'link': return <Link size={size} />;
        case 'hash': return <Hash size={size} />;
        default: return <Square size={size} />;
    }
  };

  const getNodeColor = (type: NodeType) => {
     switch (type) {
      case NodeType.PERSON: return "border-blue-500 bg-white";
      case NodeType.ORGANIZATION: return "border-purple-500 bg-white";
      case NodeType.LOCATION: return "border-green-500 bg-white";
      case NodeType.EVENT: return "border-orange-500 bg-white";
      case NodeType.IMAGE: return "border-pink-500 bg-white";
      case NodeType.POSTIT: return "border-yellow-400 bg-yellow-100";
      default: return "border-slate-400 bg-white";
    }
  };

  const renderShape = (shape: ShapeData) => {
      const isSelected = selectedShapeId === shape.id;
      const stroke = isSelected ? '#3b82f6' : 'none';
      const strokeWidth = isSelected ? 2 : 0;
      
      // Calculate true bounding box (SVG rects need positive w/h)
      let x = shape.x;
      let y = shape.y;
      let w = shape.width;
      let h = shape.height;
      
      // Normalize negative dimensions (from drawing backwards)
      if (w < 0) { x += w; w = Math.abs(w); }
      if (h < 0) { y += h; h = Math.abs(h); }

      if (shape.type === 'rectangle') {
          return (
              <rect
                key={shape.id}
                x={x} y={y} width={w} height={h}
                fill={shape.color}
                stroke={stroke}
                strokeWidth={strokeWidth}
                rx={8}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onPointerDown={(e) => handleShapeMouseDown(e, shape.id)}
              />
          );
      } else if (shape.type === 'circle') {
          // Interpret bounding box as ellipse
          const cx = x + w / 2;
          const cy = y + h / 2;
          const rx = w / 2;
          const ry = h / 2;
          return (
              <ellipse 
                key={shape.id}
                cx={cx} cy={cy} rx={rx} ry={ry}
                fill={shape.color}
                stroke={stroke}
                strokeWidth={strokeWidth}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onPointerDown={(e) => handleShapeMouseDown(e, shape.id)}
              />
          );
      } else if (shape.type === 'line') {
          return (
              <g key={shape.id}>
                {/* Thick transparent stroke for easier grabbing */}
                <line 
                    x1={shape.x} y1={shape.y} 
                    x2={shape.x + shape.width} y2={shape.y + shape.height}
                    stroke="transparent"
                    strokeWidth="20"
                    onPointerDown={(e) => handleShapeMouseDown(e, shape.id)}
                    className="cursor-pointer"
                />
                <line 
                    x1={shape.x} y1={shape.y} 
                    x2={shape.x + shape.width} y2={shape.y + shape.height}
                    stroke={shape.color === 'rgba(148, 163, 184, 0.2)' ? '#94a3b8' : shape.color.replace('0.2)', '1)')} 
                    strokeWidth={isSelected ? 4 : 2}
                    strokeDasharray="5,5"
                    pointerEvents="none"
                />
              </g>
          )
      }
      return null;
  }
  
  const renderTempShape = () => {
      if (!drawingShape) return null;
      let x = drawingShape.startX;
      let y = drawingShape.startY;
      let w = drawingShape.currentX - drawingShape.startX;
      let h = drawingShape.currentY - drawingShape.startY;
      
      const type = drawingShape.type;

       // Normalize
      if (type !== 'line') {
         if (w < 0) { x += w; w = Math.abs(w); }
         if (h < 0) { y += h; h = Math.abs(h); }
      }

      if (type === 'rectangle') {
          return <rect x={x} y={y} width={w} height={h} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" rx={8} />;
      } else if (type === 'circle') {
          const cx = x + w / 2;
          const cy = y + h / 2;
          const rx = w / 2;
          const ry = h / 2;
           return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" />;
      } else if (type === 'line') {
          return <line x1={drawingShape.startX} y1={drawingShape.startY} x2={drawingShape.currentX} y2={drawingShape.currentY} stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 2" />;
      }
      return null;
  }

  // Properties Panel - Logic to show ONLY if 1 node is selected
  const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
  const selectedNodeData = (!isPropertiesHiddenByZoom && singleSelectedNodeId) ? nodes.find(n => n.id === singleSelectedNodeId) || null : null;
  const selectedEdgeData = edges.find(e => e.id === selectedEdgeId) || null;
  const selectedShapeData = shapes.find(s => s.id === selectedShapeId) || null;

  // Render Crop Overlay
  const renderCropOverlay = () => {
    if (!cropState?.isActive) return null;
    const { startX, startY, currentX, currentY, isDrawing, isComplete } = cropState;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    return (
        <div 
            className="fixed inset-0 bg-black/20 cursor-crosshair z-[100] export-exclude"
            onPointerDown={handleCanvasPointerDown}
        >
            {!isComplete && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow font-semibold text-slate-700 pointer-events-none">
                    {isDrawing ? 'Solte para finalizar seleção' : `Selecione a área para salvar (${pendingDownloadFormat?.toUpperCase()})`}
                </div>
            )}
            {(isDrawing || isComplete) && width > 0 && height > 0 && (
                <div 
                    className="absolute border-2 border-red-500 bg-red-500/10 crop-overlay shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                    style={{ left, top, width, height }}
                />
            )}
        </div>
    )
  }

  // Render Selection Box (Marquee)
  const renderSelectionBox = () => {
      if (!selectionBox?.isVisible) return null;
      
      const left = Math.min(selectionBox.startX, selectionBox.currentX);
      const top = Math.min(selectionBox.startY, selectionBox.currentY);
      const width = Math.abs(selectionBox.currentX - selectionBox.startX);
      const height = Math.abs(selectionBox.currentY - selectionBox.startY);
      
      return (
          <div 
            className="fixed border border-blue-500 bg-blue-500/20 pointer-events-none z-[60]"
            style={{ left, top, width, height }}
          />
      );
  }

  const renderConfirmationModal = () => {
    if (!cropState?.isActive || !cropState.isComplete) return null;
    return (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[102] export-exclude">
            <div className="bg-white rounded-xl shadow-2xl p-4 border border-slate-200 flex flex-col gap-3 min-w-[340px] animate-in fade-in zoom-in duration-200">
                <h3 className="font-semibold text-slate-800 text-center">Salvar Imagem Exportada</h3>
                <div>
                    <label className="block text-[11px] font-medium text-slate-500 uppercase mb-1">
                        Nome do Arquivo
                    </label>
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 bg-white">
                        <input
                            type="text"
                            autoFocus
                            value={exportFileName}
                            onChange={(e) => setExportFileName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    executeDownload();
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelCrop();
                                }
                            }}
                            placeholder="grafo-export"
                            className="flex-1 px-3 py-1.5 text-sm text-slate-800 outline-none"
                        />
                        <span className="px-2.5 py-1.5 bg-slate-100 text-slate-500 text-xs font-mono border-l border-slate-200">
                            .{pendingDownloadFormat}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2 justify-center pt-1">
                    <button onClick={cancelCrop} className="px-3.5 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 flex items-center gap-1.5 text-sm font-medium">
                        <XIcon size={16} /> Cancelar
                    </button>
                    <button onClick={redoCrop} className="px-3.5 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 flex items-center gap-1.5 text-sm font-medium">
                        <RotateCcw size={16} /> Refazer
                    </button>
                    <button onClick={executeDownload} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-sm font-medium">
                        <Check size={16} /> Baixar
                    </button>
                </div>
            </div>
        </div>
    );
  };

  const renderSaveProjectModal = () => {
    if (!isSaveProjectModalOpen) return null;
    return (
        <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center z-[105] export-exclude"
            onPointerDown={() => setIsSaveProjectModalOpen(false)}
        >
            <div
                className="bg-white rounded-xl shadow-2xl p-5 border border-slate-200 flex flex-col gap-4 w-96 max-w-[calc(100vw-2rem)] animate-in fade-in zoom-in duration-150"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 text-base">Salvar Projeto</h3>
                    <button
                        onClick={() => setIsSaveProjectModalOpen(false)}
                        className="text-slate-400 hover:text-slate-600"
                    >
                        <XIcon size={18} />
                    </button>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase mb-1.5">
                        Nome do Arquivo
                    </label>
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 bg-white">
                        <input
                            type="text"
                            autoFocus
                            value={projectFileName}
                            onChange={(e) => setProjectFileName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    executeSaveProject();
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setIsSaveProjectModalOpen(false);
                                }
                            }}
                            placeholder="grafo-facil-projeto"
                            className="flex-1 px-3 py-2 text-sm text-slate-800 outline-none"
                        />
                        <span className="px-3 py-2 bg-slate-100 text-slate-500 text-xs font-mono border-l border-slate-200">
                            .hlx
                        </span>
                    </div>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                    <button
                        onClick={() => setIsSaveProjectModalOpen(false)}
                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={executeSaveProject}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-sm font-medium shadow-sm"
                    >
                        <Check size={16} /> Salvar Arquivo
                    </button>
                </div>
            </div>
        </div>
    );
  };

  const handleApplyLayout = (layoutType: string) => {
    setNodes(prevNodes => getLayoutPositions(prevNodes, edges, layoutType));
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    if ((e.target as HTMLElement).closest('#helix-chat-panel')) return;
    const hasImages = Array.from(e.dataTransfer.items || []).some(item => item.type.startsWith('image/'));
    if (hasImages) {
      e.preventDefault();
      if (!isDraggingFileOverCanvas) setIsDraggingFileOverCanvas(true);
    }
  };

  const handleCanvasDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setIsDraggingFileOverCanvas(false);
    }
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    setIsDraggingFileOverCanvas(false);
    if ((e.target as HTMLElement).closest('#helix-chat-panel')) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const hasImages = Array.from(files).some(f => f.type.startsWith('image/'));
      if (hasImages) {
        e.preventDefault();
        const dropPos = screenToCanvas(e.clientX, e.clientY);
        handleAddImageFiles(files, dropPos);
      }
    }
  };

  return (
    <div 
        ref={appContainerRef}
        className={`w-full h-screen bg-slate-50 overflow-hidden relative select-none ${activeTool !== 'CURSOR' ? 'cursor-crosshair' : ''}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
    >
      {renderCropOverlay()}
      {renderConfirmationModal()}
      {renderSaveProjectModal()}
      {renderSelectionBox()}

      {isDraggingFileOverCanvas && (
        <div className="fixed inset-4 border-2 border-dashed border-pink-500 bg-pink-500/5 rounded-2xl pointer-events-none z-[80] flex items-center justify-center">
          <div className="bg-white/95 backdrop-blur px-5 py-3 rounded-xl shadow-lg border border-pink-200 flex items-center gap-2 text-pink-600 font-medium text-sm">
            <ImageIcon size={18} />
            Solte para inserir a imagem como entidade no Canvas
          </div>
        </div>
      )}

      <div 
        className="absolute inset-0 pointer-events-none opacity-10 app-background-grid"
        style={{
            backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
            backgroundSize: `${20 * scale}px ${20 * scale}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
      />

      <div
        className={cropState?.isActive ? 'opacity-0 pointer-events-none' : 'opacity-100 transition-opacity duration-200'}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Toolbar 
            onAddNode={handleAddNode} 
            onAddImageFiles={handleAddImageFiles}
            onClear={() => { setNodes([]); setEdges([]); setShapes([]); }} 
            onZoomIn={() => setScale(s => Math.min(s + 0.1, 6))}
            onZoomOut={() => setScale(s => Math.max(s - 0.1, 0.2))}
            onDownload={startDownloadSequence}
            onSaveProject={handleSaveProject}
            onLoadProject={handleLoadProject}
            scale={scale}
            activeTool={activeTool}
            onSetTool={setActiveTool}
            onAutoLayout={handleApplyLayout}
        />
      </div>

      <div
        className={cropState?.isActive ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <PropertiesPanel 
            selectedNode={selectedNodeData}
            selectedEdge={selectedEdgeData}
            selectedShape={selectedShapeData}
            onClose={() => { setSelectedNodeIds(new Set()); setSelectedEdgeId(null); setSelectedShapeId(null); }}
            onUpdateNode={updateNode}
            onUpdateEdge={updateEdge}
            onUpdateShape={updateShape}
            onDeleteNode={(id) => {
                setNodes(nodes.filter(n => n.id !== id));
                setEdges(edges.filter(edge => edge.source !== id && edge.target !== id));
                setSelectedNodeIds(new Set());
            }}
            onDeleteEdge={(id) => {
                setEdges(edges.filter(e => e.id !== id));
                setSelectedEdgeId(null);
            }}
            onDeleteShape={(id) => {
                setShapes(shapes.filter(s => s.id !== id));
                setSelectedShapeId(null);
            }}
        />
      </div>

      {/* Canvas Container */}
      <div 
        ref={canvasRef}
        className="w-full h-full origin-top-left"
        style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        }}
      >
        
        {/* Layer 0: Shapes (Background) & Edges */}
        <svg className="absolute top-0 left-0 overflow-visible w-full h-full pointer-events-none">
            {/* Shapes Group */}
            <g className="pointer-events-auto">
                {shapes.map(renderShape)}
                {renderTempShape()}
            </g>

            <defs>
                {edges.map(edge => {
                    const color = edge.color || '#94a3b8';
                    return (
                        <React.Fragment key={edge.id}>
                            <marker id={`arrow-end-${edge.id}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill={color} />
                            </marker>
                            <marker id={`arrow-start-${edge.id}`} markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                <polygon points="10 0, 0 3.5, 10 7" fill={color} />
                            </marker>
                        </React.Fragment>
                    )
                })}
                <marker id="arrowhead-draft" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                </marker>
            </defs>
            
            {edges.map(edge => {
                const source = nodes.find(n => n.id === edge.source);
                const target = nodes.find(n => n.id === edge.target);
                if (!source || !target) return null;

                const isSelected = selectedEdgeId === edge.id;
                const color = edge.color || '#94a3b8';
                const direction = edge.direction || 'uni';
                const style = edge.style || 'solid';
                const edgeDetails = edge.details || [];
                const customOffset = edge.curvatureOffset || 0;
                const hasCustomCurve = customOffset !== 0;

                const pairKey = [edge.source, edge.target].sort().join('-');
                const siblings = edgeGroups[pairKey] || [];
                const edgeIndex = siblings.indexOf(edge);
                const isMultiEdge = siblings.length > 1;
                const isCanonicalOrder = edge.source < edge.target;
                
                const startNode = isCanonicalOrder ? source : target;
                const endNode = isCanonicalOrder ? target : source;
                const startDim = getNodeDimensions(startNode);
                const endDim = getNodeDimensions(endNode);
                
                const sCenter = { x: startNode.x + startDim.offsetX, y: startNode.y + startDim.offsetY };
                const eCenter = { x: endNode.x + endDim.offsetX, y: endNode.y + endDim.offsetY };

                let dPath = '';
                let labelX = 0;
                let labelY = 0;
                const { start: realStart, end: realEnd } = getSmartEdgePoints(
                  source,
                  target,
                  edge.sourceHandle,
                  edge.targetHandle
                );

                if (source.id === target.id) {
                    const srcDim = getNodeDimensions(source);
                    const cX = source.x + srcDim.offsetX;
                    const cY = source.y + srcDim.offsetY;
                    const loopH = 100 + customOffset;
                    const loopW = 50 + (customOffset / 2);
                    const pStart = { x: cX - 20, y: cY - srcDim.offsetY };
                    const pEnd = { x: cX + 20, y: cY - srcDim.offsetY };
                    const cp1 = { x: cX - loopW, y: cY - loopH - srcDim.offsetY };
                    const cp2 = { x: cX + loopW, y: cY - loopH - srcDim.offsetY };
                    dPath = `M ${pStart.x} ${pStart.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${pEnd.x} ${pEnd.y}`;
                    labelX = cX;
                    labelY = cY - loopH - 40;
                } else if (!isMultiEdge && !hasCustomCurve) {
                    dPath = `M ${realStart.x} ${realStart.y} L ${realEnd.x} ${realEnd.y}`;
                    labelX = (realStart.x + realEnd.x) / 2;
                    labelY = (realStart.y + realEnd.y) / 2;
                } else {
                    const CURVE_SPACING = 70;
                    const count = siblings.length;
                    let centeredIndex = 0;
                    if (isMultiEdge) {
                        centeredIndex = edgeIndex - (count - 1) / 2;
                    }
                    const offset = (centeredIndex * CURVE_SPACING) + customOffset;
                    const dx = eCenter.x - sCenter.x;
                    const dy = eCenter.y - sCenter.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const uX = -dy / len;
                    const uY = dx / len;
                    const midX = (sCenter.x + eCenter.x) / 2;
                    const midY = (sCenter.y + eCenter.y) / 2;
                    const controlX = midX + uX * offset;
                    const controlY = midY + uY * offset;
                    dPath = `M ${realStart.x} ${realStart.y} Q ${controlX} ${controlY} ${realEnd.x} ${realEnd.y}`;
                    labelX = 0.25 * realStart.x + 0.5 * controlX + 0.25 * realEnd.x;
                    labelY = 0.25 * realStart.y + 0.5 * controlY + 0.25 * realEnd.y;
                }

                let markerEnd = '';
                let markerStart = '';
                if (direction === 'uni') markerEnd = `url(#arrow-end-${edge.id})`;
                if (direction === 'bi') {
                    markerEnd = `url(#arrow-end-${edge.id})`;
                    markerStart = `url(#arrow-start-${edge.id})`;
                }

                const hasDetails = edgeDetails.length > 0;
                const boxHeight = hasDetails ? 24 + (edgeDetails.length * 16) : 24;
                const boxWidth = 140;

                return (
                    <g key={edge.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeIds(new Set()); setSelectedShapeId(null); }}>
                        <path 
                            d={dPath}
                            fill="none"
                            stroke={isSelected ? "#3b82f6" : color}
                            strokeWidth={isSelected ? 3 : 2}
                            strokeDasharray={style === 'dashed' ? "5,5" : "none"}
                            markerEnd={markerEnd}
                            markerStart={markerStart}
                            className="transition-all"
                        />
                        <path 
                             d={dPath}
                             fill="none"
                             stroke="transparent"
                             strokeWidth="15"
                        />
                        {(edge.label || hasDetails) && (
                            <foreignObject 
                                x={labelX - (boxWidth/2)} 
                                y={labelY - (boxHeight/2)} 
                                width={boxWidth} 
                                height={boxHeight}
                                className="overflow-visible"
                            >
                                <div className={`flex flex-col items-center rounded border shadow-sm backdrop-blur-sm transition-all ${isSelected ? 'bg-blue-50/90 border-blue-300 z-20' : 'bg-white/90 border-slate-200 z-10'}`}>
                                    {edge.label && (
                                        <div className={`text-[10px] font-medium px-2 py-0.5 w-full text-center truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                            {edge.label}
                                        </div>
                                    )}
                                    {hasDetails && (
                                        <div className="w-full border-t border-slate-200/50 flex flex-col px-1 py-0.5 gap-0.5">
                                            {edgeDetails.map(d => (
                                                <div key={d.id} className="flex items-center gap-1 text-[9px] text-slate-600">
                                                    <span className="text-slate-400">{getDetailIcon(d.icon)}</span>
                                                    <span className="truncate">{d.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </foreignObject>
                        )}
                    </g>
                );
            })}

            {connectionState?.isConnecting && connectionState.mousePos && (() => {
                const source = nodes.find(n => n.id === connectionState.sourceNodeId);
                if (!source) return null;
                const sDim = getNodeDimensions(source);
                const sCenter = { x: source.x + sDim.offsetX, y: source.y + sDim.offsetY };
                const start = connectionState.sourceHandle
                  ? getNodeHandlePoint(source, connectionState.sourceHandle)
                  : getInterceptPoint(connectionState.mousePos, sCenter, sDim.width, sDim.height);
                return (
                     <line 
                        x1={start.x} y1={start.y}
                        x2={connectionState.mousePos.x} y2={connectionState.mousePos.y}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                        markerEnd="url(#arrowhead-draft)"
                    />
                );
            })()}
        </svg>

        {/* Nodes Layer (HTML) - Renders on top of shapes */}
        {nodes.map(node => {
            const isSelected = selectedNodeIds.has(node.id);
            const baseColorClass = getNodeColor(node.type);
            const details = node.details || [];
            
            const auraStyle = node.highlightColor ? {
                boxShadow: `0 0 0 4px white, 0 0 ${node.highlightSize || 20}px 4px ${node.highlightColor}`
            } : {};

            const handleVisibilityClass = connectionState?.isConnecting
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100';

            const renderFourSideHandles = (isImageNode: boolean) => {
              const sides: Array<{ side: HandleSide; posClass: string; label: string }> = [
                {
                  side: 'top',
                  posClass: isImageNode
                    ? '-top-3 left-1/2 -translate-x-1/2'
                    : '-top-[74px] left-1/2 -translate-x-1/2',
                  label: 'Conectar por cima'
                },
                {
                  side: 'bottom',
                  posClass: '-bottom-3 left-1/2 -translate-x-1/2',
                  label: 'Conectar por baixo'
                },
                {
                  side: 'left',
                  posClass: '-left-3 top-1/2 -translate-y-1/2',
                  label: 'Conectar pela esquerda'
                },
                {
                  side: 'right',
                  posClass: '-right-3 top-1/2 -translate-y-1/2',
                  label: 'Conectar pela direita'
                }
              ];

              return sides.map(({ side, posClass, label }) => {
                const isActiveSource =
                  connectionState?.isConnecting &&
                  connectionState.sourceNodeId === node.id &&
                  connectionState.sourceHandle === side;

                return (
                  <div
                    key={side}
                    className={`absolute ${posClass} transform w-6 h-6 bg-transparent flex items-center justify-center cursor-crosshair transition-opacity z-30 ${
                      isActiveSource ? 'opacity-100' : handleVisibilityClass
                    }`}
                    onPointerDown={(e) => handleHandlePointerDown(e, node.id, side)}
                    onPointerUp={(e) => handleHandlePointerUp(e, node.id, side)}
                    title={label}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm transition-transform ${
                        isActiveSource
                          ? 'bg-indigo-600 scale-125 ring-2 ring-blue-300'
                          : 'bg-blue-500 hover:scale-125 hover:bg-blue-600'
                      }`}
                    />
                  </div>
                );
              });
            };

            // Obsidian Canvas Style Image Entity
            if (node.type === NodeType.IMAGE) {
              const cardWidth = node.width || 240;
              const imgHeight = node.height || 180;
              const hasFooter = Boolean(node.label) || details.length > 0;

              return (
                <div
                  key={node.id}
                  className={`absolute rounded-xl border-2 bg-white shadow-md flex flex-col transition-shadow group ${
                    isSelected
                      ? 'border-pink-500 ring-2 ring-offset-2 ring-blue-400 shadow-xl z-20'
                      : 'border-slate-200 hover:border-pink-400 hover:shadow-lg z-10'
                  }`}
                  style={{
                    width: `${cardWidth}px`,
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    ...auraStyle
                  }}
                  onPointerDown={(e) => handleNodeMouseDown(e, node.id)}
                  onPointerUp={(e) => handleNodePointerUp(e, node.id)}
                  onDoubleClick={(e) => handleImageDoubleClickZoom(e, node)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  title="Clique duplo para ajustar zoom da imagem na tela"
                >
                  <div
                    className={`w-full overflow-hidden bg-white flex items-center justify-center ${
                      hasFooter ? 'rounded-t-[10px]' : 'rounded-[10px]'
                    }`}
                    style={{ height: `${imgHeight}px` }}
                  >
                    {node.customImage ? (
                      <img
                        src={node.customImage}
                        alt={node.label || 'Imagem no Canvas'}
                        draggable={false}
                        onLoad={(e) => {
                          // Automatically fix aspect ratio if an image's height was previously clamped
                          const imgEl = e.currentTarget;
                          if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                            const expectedH = Math.max(20, Math.round(cardWidth * (imgEl.naturalHeight / imgEl.naturalWidth)));
                            if (Math.abs(expectedH - imgHeight) > 4 && !resizeNodeState) {
                              updateNode(node.id, { height: expectedH });
                            }
                          }
                        }}
                        className="w-full h-full object-contain select-none pointer-events-none"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400 gap-1 p-4 text-center bg-slate-100 w-full h-full">
                        <ImageIcon size={36} />
                        <span className="text-[11px]">Selecione uma imagem no painel lateral ou cole com Ctrl+V</span>
                      </div>
                    )}
                  </div>

                  {hasFooter && (
                    <div className="p-2 flex flex-col items-center w-full bg-white rounded-b-[10px] border-t border-slate-100">
                      {node.label && (
                        <div className="text-xs font-semibold text-slate-800 text-center leading-tight w-full px-1 break-words">
                          {node.label}
                        </div>
                      )}
                      {details.length > 0 && (
                        <div className={`w-full ${node.label ? 'mt-1.5 pt-1.5 border-t border-dashed border-slate-200' : ''} space-y-0.5`}>
                          {details.map(d => (
                            <div key={d.id} className="flex items-center gap-1.5 text-[10px] text-slate-600 bg-slate-50/70 rounded px-1.5 py-0.5">
                              <span className="text-slate-400 shrink-0">{getDetailIcon(d.icon)}</span>
                              <span className="truncate flex-1">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4 Connection Handles (Top, Bottom, Left, Right) */}
                  {renderFourSideHandles(true)}

                  {/* Bottom-Right Resize Handle (Obsidian Canvas style) */}
                  <div
                    className={`absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-white border-2 border-pink-500 shadow flex items-center justify-center cursor-nwse-resize z-30 transition-opacity ${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onPointerDown={(e) => startNodeResize(e, node)}
                    title="Arraste para redimensionar (Shift para proporção livre)"
                  >
                    <div className="w-1.5 h-1.5 bg-pink-500 rounded-full" />
                  </div>
                </div>
              );
            }

            // Post-it (Observation) Entity
            if (node.type === NodeType.POSTIT) {
              const cardWidth = node.width || 220;
              const cardHeight = node.height || 180;
              const postItBg = node.noteColor || '#fef08a';
              const isEditingText = editingPostItId === node.id && isSelected;

              return (
                <div
                  key={node.id}
                  className={`absolute rounded-lg border shadow-md flex flex-col transition-shadow group ${
                    isEditingText ? 'cursor-text' : 'cursor-grab active:cursor-grabbing'
                  } ${
                    isSelected
                      ? 'border-yellow-500 ring-2 ring-offset-2 ring-blue-400 shadow-xl z-20'
                      : 'border-black/15 hover:border-yellow-500/80 hover:shadow-lg z-10'
                  }`}
                  style={{
                    width: `${cardWidth}px`,
                    minHeight: `${cardHeight}px`,
                    backgroundColor: postItBg,
                    transform: `translate(${node.x}px, ${node.y}px)`,
                    ...auraStyle
                  }}
                  onPointerDown={(e) => handleNodeMouseDown(e, node.id)}
                  onPointerUp={(e) => handleNodePointerUp(e, node.id)}
                  onDoubleClick={(e) => {
                    if (cropState?.isActive || activeTool !== 'CURSOR') return;
                    e.stopPropagation();
                    setSelectedNodeIds(new Set([node.id]));
                    setSelectedEdgeId(null);
                    setSelectedShapeId(null);
                    setDragState(null);
                    setEditingPostItId(node.id);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                >
                  {/* Top Adhesive Strip / Header */}
                  <div className="px-3 py-2 border-b border-black/10 bg-black/[0.04] rounded-t-lg flex items-center gap-1.5 select-none">
                    <StickyNote size={14} className="text-slate-700/80 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 truncate flex-1">
                      {node.label || 'Observação'}
                    </span>
                  </div>

                  {/* Observation Body (Double-click to edit, single click/drag to move) */}
                  <div className="p-2.5 flex-1 flex flex-col">
                    {isEditingText ? (
                      <textarea
                        autoFocus
                        value={node.noteText || ''}
                        placeholder="Escreva uma observação..."
                        onChange={(e) => updateNode(node.id, { noteText: e.target.value })}
                        onBlur={() => setEditingPostItId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.currentTarget.blur();
                            setEditingPostItId(null);
                          }
                        }}
                        onPointerDown={(e) => {
                          if (connectionState?.isConnecting) {
                            return;
                          }
                          e.stopPropagation();
                        }}
                        className="w-full flex-1 bg-white/40 rounded p-1 -m-1 text-xs text-slate-800 placeholder:text-slate-500/70 resize-none outline-none ring-1 ring-yellow-500/50 leading-relaxed font-medium cursor-text"
                        style={{ minHeight: `${Math.max(70, cardHeight - 65)}px` }}
                      />
                    ) : (
                      <div
                        className={`w-full flex-1 text-xs leading-relaxed font-medium whitespace-pre-wrap break-words select-none ${
                          node.noteText ? 'text-slate-800' : 'text-slate-500/70 italic'
                        }`}
                        style={{ minHeight: `${Math.max(70, cardHeight - 65)}px` }}
                        title="Clique e arraste para mover • Clique duplo para editar o texto"
                      >
                        {node.noteText || 'Clique duplo para escrever uma observação...'}
                      </div>
                    )}

                    {details.length > 0 && (
                      <div className="w-full mt-2 pt-1.5 border-t border-dashed border-black/15 space-y-0.5 select-none">
                        {details.map(d => (
                          <div key={d.id} className="flex items-center gap-1.5 text-[10px] text-slate-700 bg-white/50 rounded px-1.5 py-0.5">
                            <span className="text-slate-600 shrink-0">{getDetailIcon(d.icon)}</span>
                            <span className="truncate flex-1">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 4 Connection Handles (Top, Bottom, Left, Right) */}
                  {renderFourSideHandles(true)}

                  {/* Bottom-Right Resize Handle */}
                  <div
                    className={`absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-white border-2 border-yellow-500 shadow flex items-center justify-center cursor-nwse-resize z-30 transition-opacity ${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onPointerDown={(e) => startNodeResize(e, node)}
                    title="Arraste para redimensionar o Post-it"
                  >
                    <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                  </div>
                </div>
              );
            }

            return (
                <div
                    key={node.id}
                    className={`absolute w-40 min-h-[80px] rounded-xl border-2 shadow-sm flex flex-col transition-all group ${baseColorClass} ${isSelected ? 'ring-2 ring-offset-2 ring-blue-400 shadow-xl z-20' : 'hover:shadow-md z-10'}`}
                    style={{ 
                        transform: `translate(${node.x}px, ${node.y}px)`,
                        ...auraStyle
                    }}
                    onPointerDown={(e) => handleNodeMouseDown(e, node.id)}
                    onPointerUp={(e) => handleNodePointerUp(e, node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                >
                    <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 z-10">
                        <div className={`w-24 h-32 rounded-lg border-4 bg-white flex items-center justify-center shadow-md overflow-hidden ${baseColorClass}`}>
                            {node.customImage ? (
                                <img src={node.customImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="text-slate-500">
                                    {getNodeIcon(node, 48)}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-16 pb-2 px-2 flex flex-col items-center w-full mt-1">
                        <div className="text-sm font-semibold text-slate-800 text-center leading-tight mb-1 w-full px-1 break-words">
                            {node.label}
                        </div>
                        {details.length > 0 && (
                            <div className="w-full mt-1 pt-1 border-t border-dashed border-slate-200 space-y-0.5">
                                {details.map(d => (
                                    <div key={d.id} className="flex items-center gap-1.5 text-[10px] text-slate-600 bg-slate-50/50 rounded px-1">
                                        <span className="text-slate-400 shrink-0">{getDetailIcon(d.icon)}</span>
                                        <span className="truncate flex-1">{d.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 4 Connection Handles (Top, Bottom, Left, Right) */}
                    {renderFourSideHandles(false)}
                </div>
            );
        })}
      </div>
      
       {clipboardToast && (
         <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] bg-slate-900/95 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-xl border border-slate-700 flex items-center gap-2 pointer-events-none animate-fade-in export-exclude">
           <Check size={14} className="text-emerald-400 shrink-0" />
           <span>{clipboardToast}</span>
         </div>
       )}

       <div className={cropState?.isActive ? 'hidden' : "absolute bottom-4 left-4 pointer-events-none"}>
          <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-2 shadow-sm text-xs text-slate-500">
            {selectedNodeIds.size > 1 ? (
                <span><strong>{selectedNodeIds.size}</strong> entidades selecionadas. Arraste para mover.</span>
            ) : selectedNodeData?.customImage ? (
                <span><strong>Ctrl+C</strong>: Copiar imagem para área de transferência • <strong>Ctrl+V</strong>: Colar Imagem</span>
            ) : selectedShapeId ? (
                <span>Forma selecionada. Arraste para mover.</span>
            ) : (
                <span><strong>Scroll</strong>: Sobe/Desce • <strong>Shift+Scroll</strong>: Esq/Dir • <strong>Ctrl+Scroll</strong>: Zoom • <strong>Ctrl+V</strong>: Colar Imagem</span>
            )}
          </div>
       </div>

       {/* Floating AI Panel Toggle Button */}
       <div
         className={cropState?.isActive ? 'hidden' : "absolute bottom-4 right-4 z-50 export-exclude"}
         onPointerDown={(e) => e.stopPropagation()}
       >
          <button
            onClick={() => setIsAIPanelOpen(!isAIPanelOpen)}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:via-indigo-700 hover:to-blue-700 text-white font-medium px-4 py-2.5 rounded-full shadow-lg hover:shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all text-sm group"
          >
            <Sparkles size={16} className={isAIPanelOpen ? "rotate-12" : "animate-pulse"} />
            <span>Hélix AI Chat</span>
          </button>
       </div>

       {/* Agentic AI Assistant Panel */}
       <div onPointerDown={(e) => e.stopPropagation()}>
         <AIPanel 
            isOpen={isAIPanelOpen}
            onClose={() => setIsAIPanelOpen(false)}
            currentGraph={{ nodes, edges, shapes }}
            onApplyToolCalls={handleApplyToolCalls}
            onClearGraph={() => { setNodes([]); setEdges([]); setShapes([]); }}
         />
       </div>
    </div>
  );
};

export default App;
