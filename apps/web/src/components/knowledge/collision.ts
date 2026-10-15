import { Node } from "@xyflow/react";

/**
 * Anti-Collision Algorithm:
 * Prevents knowledge nodes from overlapping or stacking directly on top of each other.
 * Pushes dragged nodes along the axis of least penetration when proximity violates clearance margins.
 */
export function resolveNodeCollision(
  draggedNode: Node,
  allNodes: Node[]
): { x: number; y: number } {
  let { x, y } = draggedNode.position;
  const isDraggedMain = draggedNode.id === "main-ai-node";
  const w1 = isDraggedMain ? 220 : 140;
  const h1 = isDraggedMain ? 75 : 110;
  const padding = 30; // Minimum clearance margin between node borders

  for (const other of allNodes) {
    if (other.id === draggedNode.id) continue;
    const isOtherMain = other.id === "main-ai-node";
    const w2 = isOtherMain ? 220 : 140;
    const h2 = isOtherMain ? 75 : 110;

    const minDistanceX = (w1 + w2) / 2 + padding;
    const minDistanceY = (h1 + h2) / 2 + padding;

    const center1X = x + w1 / 2;
    const center1Y = y + h1 / 2;
    const center2X = other.position.x + w2 / 2;
    const center2Y = other.position.y + h2 / 2;

    const dx = center1X - center2X;
    const dy = center1Y - center2Y;

    if (Math.abs(dx) < minDistanceX && Math.abs(dy) < minDistanceY) {
      // Collision detected! Push along the axis of least penetration
      const overlapX = minDistanceX - Math.abs(dx);
      const overlapY = minDistanceY - Math.abs(dy);

      if (overlapX < overlapY) {
        x += dx >= 0 ? overlapX : -overlapX;
      } else {
        y += dy >= 0 ? overlapY : -overlapY;
      }
    }
  }

  return { x, y };
}
