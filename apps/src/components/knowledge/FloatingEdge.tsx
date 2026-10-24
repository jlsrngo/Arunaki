import { BaseEdge, getBezierPath, useInternalNode, Position, EdgeProps, InternalNode } from '@xyflow/react';

// Returns the intersection point of the line between target and source with the node border
function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const { width = 150, height = 80 } = intersectionNode.measured || {};
  const { width: targetWidth = 150, height: targetHeight = 80 } = targetNode.measured || {};
  
  const targetPosition = targetNode.internals?.positionAbsolute || targetNode.position;
  const position = intersectionNode.internals?.positionAbsolute || intersectionNode.position;

  const w = width / 2;
  const h = height / 2;

  const x2 = position.x + w;
  const y2 = position.y + h;
  const x1 = targetPosition.x + targetWidth / 2;
  const y1 = targetPosition.y + targetHeight / 2;

  const xx1 = (x1 - x2) / (2 * (w || 1)) - (y1 - y2) / (2 * (h || 1));
  const yy1 = (x1 - x2) / (2 * (w || 1)) + (y1 - y2) / (2 * (h || 1));
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;

  return { x, y };
}

// Returns the position (top, right, bottom, left) of the connection point
function getEdgePosition(node: InternalNode, intersectionPoint: { x: number; y: number }): Position {
  const n = node.internals?.positionAbsolute || node.position;
  const { width = 150, height = 80 } = node.measured || {};
  const nx = Math.round(n.x);
  const ny = Math.round(n.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= nx + 2) return Position.Left;
  if (px >= nx + width - 2) return Position.Right;
  if (py <= ny + 2) return Position.Top;
  if (py >= ny + height - 2) return Position.Bottom;

  return Position.Top;
}

export function FloatingEdge({ id, source, target, markerEnd, style }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const sourceIntersection = getNodeIntersection(sourceNode, targetNode);
  const targetIntersection = getNodeIntersection(targetNode, sourceNode);

  const sourcePos = getEdgePosition(sourceNode, sourceIntersection);
  const targetPos = getEdgePosition(targetNode, targetIntersection);

  const [edgePath] = getBezierPath({
    sourceX: sourceIntersection.x,
    sourceY: sourceIntersection.y,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: targetIntersection.x,
    targetY: targetIntersection.y,
  });

  return (
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
  );
}
