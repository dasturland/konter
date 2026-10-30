import { describe, it, expect } from 'vitest';
import {
  WAYPOINTS, findBrokenEdges, findPath, getNode, isConnected, isEdgeWalkable, nearestWaypoint,
  pathLength, reachableFrom,
} from './waypoints.js';
import { MAP, SITES } from './map.js';

describe('waypoint graph', () => {
  it('is fully connected', () => {
    expect(isConnected(WAYPOINTS)).toBe(true);
    expect(reachableFrom(WAYPOINTS, 0).size).toBe(WAYPOINTS.nodes.length);
  });

  it('has only walkable edges', () => {
    expect(findBrokenEdges(MAP, WAYPOINTS)).toEqual([]);
  });

  it('has unique node ids', () => {
    expect(new Set(WAYPOINTS.nodes.map((n) => n.id)).size).toBe(WAYPOINTS.nodes.length);
  });

  it('connects every spawn with both sites and the other base via A*', () => {
    const spawns = [...MAP.spawns.CT, ...MAP.spawns.T];
    const targets = SITES.map((s) => nearestWaypoint(WAYPOINTS, s.center[0], s.center[1]));
    for (const s of spawns) {
      const from = nearestWaypoint(WAYPOINTS, s.x, s.z, s.y);
      for (const to of targets) {
        const path = findPath(WAYPOINTS, from, to);
        expect(path).not.toBe(null);
        expect(path[0]).toBe(from);
        expect(path[path.length - 1]).toBe(to);
      }
      const enemy = s.team === 'CT' ? MAP.spawns.T[0] : MAP.spawns.CT[0];
      expect(findPath(WAYPOINTS, from, nearestWaypoint(WAYPOINTS, enemy.x, enemy.z))).not.toBe(null);
    }
  });

  it('maps site centers to nodes close to them', () => {
    for (const s of SITES) {
      const n = WAYPOINTS.nodes[nearestWaypoint(WAYPOINTS, s.center[0], s.center[1])];
      expect(Math.hypot(n.x - s.center[0], n.z - s.center[1])).toBeLessThan(3);
    }
  });

  it('reaches both upper levels (stairs and ramp)', () => {
    const start = nearestWaypoint(WAYPOINTS, 0, -72);
    for (const id of ['ABAL', 'BBAL', 'PCW', 'PCE']) {
      const node = getNode(WAYPOINTS, id);
      const path = findPath(WAYPOINTS, start, WAYPOINTS.index.get(id));
      expect(path).not.toBe(null);
      expect(node.y).toBe(4);
    }
  });

  it('finds paths of sensible length', () => {
    const a = nearestWaypoint(WAYPOINTS, 0, -72);
    const b = nearestWaypoint(WAYPOINTS, 0, 72);
    const path = findPath(WAYPOINTS, a, b);
    const len = pathLength(WAYPOINTS, path);
    expect(len).toBeGreaterThanOrEqual(144);
    expect(len).toBeLessThan(220);
    expect(findPath(WAYPOINTS, a, a)).toEqual([a]);
  });

  it('returns null for unreachable nodes', () => {
    const graph = {
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 5, y: 0, z: 0 }],
      adjacency: [[], []],
      index: new Map([['a', 0], ['b', 1]]),
    };
    expect(findPath(graph, 0, 1)).toBe(null);
    expect(isConnected(graph)).toBe(false);
  });

  it('rejects edges through walls', () => {
    const a = getNode(WAYPOINTS, 'T0');
    const b = getNode(WAYPOINTS, 'M3');
    const wallEdge = isEdgeWalkable(MAP, { x: -30, y: 0, z: -70 }, { x: -30, y: 0, z: -50 });
    expect(wallEdge).toBe(false);
    expect(isEdgeWalkable(MAP, a, getNode(WAYPOINTS, 'TGM'))).toBe(true);
    expect(b).not.toBe(null);
  });
});
