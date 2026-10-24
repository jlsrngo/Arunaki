import { describe, it, expect } from "vitest";
import { resolveNodeCollision } from "./collision";
import { Node } from "@xyflow/react";

describe("resolveNodeCollision", () => {
  it("does not change position when there are no collisions", () => {
    const draggedNode: Node = {
      id: "node-1",
      position: { x: 500, y: 500 },
      data: {},
    };
    const otherNode: Node = {
      id: "node-2",
      position: { x: 100, y: 100 },
      data: {},
    };

    const res = resolveNodeCollision(draggedNode, [draggedNode, otherNode]);
    expect(res).toEqual({ x: 500, y: 500 });
  });

  it("shifts position along axis of least penetration when nodes overlap", () => {
    const nodeA: Node = {
      id: "node-1",
      position: { x: 100, y: 100 },
      data: {},
    };
    const nodeB: Node = {
      id: "node-2",
      position: { x: 120, y: 100 },
      data: {},
    };

    const res = resolveNodeCollision(nodeA, [nodeA, nodeB]);
    // Node shifts to resolve collision (overlap along Y is 140 vs X 150)
    expect(res.y).toBe(240);
    expect(res.x).toBe(100);
  });

  it("shifts along X axis when X has less penetration than Y", () => {
    const nodeA: Node = {
      id: "node-1",
      position: { x: 100, y: 100 },
      data: {},
    };
    const nodeB: Node = {
      id: "node-2",
      position: { x: 250, y: 100 }, // dx = -150, overlapX = 170 - 150 = 20 (much smaller than overlapY)
      data: {},
    };

    const res = resolveNodeCollision(nodeA, [nodeA, nodeB]);
    expect(res.x).toBe(80); // pushed left by 20
    expect(res.y).toBe(100);
  });
});
