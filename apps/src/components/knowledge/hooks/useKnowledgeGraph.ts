import { useState, useEffect, useCallback } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  useReactFlow,
} from "@xyflow/react";
import { API_BASE, apiFetch } from "../../../lib/api";
import { resolveNodeCollision } from "../collision";

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  type: string;
  active: boolean;
  positionX: number;
  positionY: number;
  nodeColor: string;
  icon: string;
  createdAt: string;
}

export interface KnowledgeEdgeData {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

interface UseKnowledgeGraphOptions {
  isLight: boolean;
}

export function useKnowledgeGraph({ isLight }: UseKnowledgeGraphOptions) {
  const { setCenter, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ─── Fetch Data ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [resDocs, resEdges] = await Promise.all([
        apiFetch(`${API_BASE}/knowledge`),
        apiFetch(`${API_BASE}/knowledge/edges`),
      ]);

      const dataDocs = await resDocs.json();
      const dataEdges = await resEdges.json();

      const docs = (dataDocs.data || []).filter(
        (doc: KnowledgeDoc) =>
          doc.id !== "arunaki-rulebook" && doc.type !== "rules"
      );

      // Guarantee main-ai-node is always present in the graph
      if (!docs.some((d: KnowledgeDoc) => d.id === "main-ai-node")) {
        docs.unshift({
          id: "main-ai-node",
          title: "Agent Core",
          content: "Central AI agent node",
          type: "agent",
          active: true,
          positionX: 300,
          positionY: 200,
          nodeColor: "#8B5CF6",
          icon: "sparkles",
          createdAt: new Date(0).toISOString(),
        } as KnowledgeDoc);
      }

      const visibleNodeIds = new Set(docs.map((d: KnowledgeDoc) => d.id));
      const dbEdges = (dataEdges.data || []).filter(
        (e: KnowledgeEdgeData) =>
          visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId)
      );

      // Build nodes
      const initialNodes: Node[] = docs.map((doc: KnowledgeDoc) => ({
        id: doc.id,
        type: "knowledge",
        position: { x: doc.positionX || 0, y: doc.positionY || 0 },
        data: {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          type: doc.type,
          active: doc.active,
          nodeColor: doc.nodeColor,
          icon: doc.icon,
          isMain: doc.id === "main-ai-node",
          onSelect: () => setSelectedNodeId(doc.id),
        },
        draggable: doc.id !== "main-ai-node",
      }));

      // Build edges with sleek floating auto-facing curves
      const initialEdges: Edge[] = dbEdges.map((e: KnowledgeEdgeData) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        label: e.label,
        type: "floating",
        style: {
          stroke: isLight ? "#64748B" : "#94A3B8",
          strokeWidth: 2.75,
        },
      }));

      setNodes(initialNodes);
      setEdges(initialEdges);

      // Smoothly center camera exactly on main AI node
      setTimeout(() => {
        const mainNode = initialNodes.find((n) => n.id === "main-ai-node");
        if (mainNode) {
          setCenter(mainNode.position.x + 48, mainNode.position.y + 48, {
            zoom: 0.85,
            duration: 400,
          });
        } else {
          fitView({ padding: 0.9, maxZoom: 0.85, duration: 400 });
        }
      }, 50);
    } catch (e) {
      console.error("[useKnowledgeGraph] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges, isLight, setCenter, fitView]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleFolderChange = () => {
      fetchData();
    };
    window.addEventListener("arunaki-folder-change", handleFolderChange);
    return () =>
      window.removeEventListener("arunaki-folder-change", handleFolderChange);
  }, [fetchData]);

  // ─── Flow Handlers ─────────────────────────────────────────────────────

  // Validation: Knowledge nodes can ONLY connect to Agent Core node ('main-ai-node')
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (connection.source === connection.target) return false;
    const isSourceMain = connection.source === "main-ai-node";
    const isTargetMain = connection.target === "main-ai-node";
    return isSourceMain || isTargetMain;
  }, []);

  const onConnect = useCallback(
    async (params: Connection) => {
      if (!isValidConnection(params)) return;

      try {
        const res = await apiFetch(`${API_BASE}/knowledge/edges`, {
          method: "POST",
          body: JSON.stringify({
            sourceId: params.source,
            targetId: params.target,
          }),
        });

        if (res.ok) {
          const { data } = await res.json();
          const newEdge: Edge = {
            id: data.id,
            source: data.sourceId,
            target: data.targetId,
            sourceHandle: params.sourceHandle,
            targetHandle: params.targetHandle,
            type: "floating",
            style: {
              stroke: isLight ? "#64748B" : "#94A3B8",
              strokeWidth: 2.75,
            },
          };
          setEdges((eds) => addEdge(newEdge, eds));
        }
      } catch (e) {
        console.error("[useKnowledgeGraph] Connect edge error:", e);
      }
    },
    [setEdges, isLight, isValidConnection]
  );

  const onEdgesDelete = useCallback(async (edgesToDelete: Edge[]) => {
    for (const edge of edgesToDelete) {
      try {
        await apiFetch(`${API_BASE}/knowledge/edges/${edge.id}`, {
          method: "DELETE",
        });
      } catch (e) {
        console.error("[useKnowledgeGraph] Delete edge error:", e);
      }
    }
  }, []);

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      onEdgesDelete([edge]);
    },
    [setEdges, onEdgesDelete]
  );

  const onNodeDragStop = useCallback(
    async (_: any, node: Node) => {
      const resolved = resolveNodeCollision(node, nodes);
      const finalX = Math.round(resolved.x);
      const finalY = Math.round(resolved.y);

      if (finalX !== node.position.x || finalY !== node.position.y) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? { ...n, position: { x: finalX, y: finalY } }
              : n
          )
        );
      }

      if (node.id === "main-ai-node") return;
      try {
        await apiFetch(`${API_BASE}/knowledge/${node.id}/position`, {
          method: "PATCH",
          body: JSON.stringify({
            positionX: finalX,
            positionY: finalY,
          }),
        });
      } catch (e) {
        console.error("[useKnowledgeGraph] Update position error:", e);
      }
    },
    [nodes, setNodes]
  );

  // ─── Node Actions ──────────────────────────────────────────────────────

  const handleAddNode = useCallback(
    async (type: string, x: number, y: number) => {
      let title = "New Knowledge";
      let nodeColor = "#3B82F6";
      let icon = "file-text";

      if (type === "catalog") {
        title = "Product Catalog";
        nodeColor = "#3B82F6";
        icon = "database";
      } else if (type === "rules") {
        title = "Rules / SOP";
        nodeColor = "#64748B";
        icon = "shield-check";
      } else if (type === "template") {
        title = "Report Template";
        nodeColor = "#8B5CF6";
        icon = "type";
      }

      try {
        const res = await apiFetch(`${API_BASE}/knowledge`, {
          method: "POST",
          body: JSON.stringify({
            title,
            content: "Enter knowledge content here...",
            type,
            positionX: x + Math.random() * 50,
            positionY: y + Math.random() * 50,
            nodeColor,
            icon,
          }),
        });

        if (res.ok) {
          const { data } = await res.json();

          // Auto connect to main AI node
          const edgeRes = await apiFetch(`${API_BASE}/knowledge/edges`, {
            method: "POST",
            body: JSON.stringify({
              sourceId: data.id,
              targetId: "main-ai-node",
            }),
          });

          let newEdge: Edge | null = null;
          if (edgeRes.ok) {
            const edgeData = (await edgeRes.json()).data;
            newEdge = {
              id: edgeData.id,
              source: edgeData.sourceId,
              target: edgeData.targetId,
              type: "floating",
              style: {
                stroke: isLight ? "#64748B" : "#94A3B8",
                strokeWidth: 2.75,
              },
            };
          }

          const newNode: Node = {
            id: data.id,
            type: "knowledge",
            position: { x: data.positionX, y: data.positionY },
            data: {
              id: data.id,
              title: data.title,
              content: data.content,
              type: data.type,
              active: data.active,
              nodeColor: data.nodeColor,
              icon: data.icon,
              onSelect: setSelectedNodeId,
            },
          };

          setNodes((nds) => [...nds, newNode]);
          if (newEdge) setEdges((eds) => addEdge(newEdge, eds));
        }
      } catch (e) {
        console.error("[useKnowledgeGraph] Add node error:", e);
      }
    },
    [setNodes, setEdges, isLight]
  );

  const handleUpdateNode = useCallback(
    (id: string, updatedData: any) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                ...updatedData,
                title: updatedData.title ?? node.data.title,
                content: updatedData.content ?? node.data.content,
                type: updatedData.type ?? node.data.type,
                active:
                  updatedData.active !== undefined
                    ? updatedData.active
                    : node.data.active,
                city:
                  updatedData.city !== undefined
                    ? updatedData.city
                    : node.data.city,
                urls:
                  updatedData.urls !== undefined
                    ? updatedData.urls
                    : node.data.urls,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== id));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== id && edge.target !== id)
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    loading,
    selectedNodeId,
    setSelectedNodeId,
    isValidConnection,
    onConnect,
    onEdgesDelete,
    onEdgeContextMenu,
    onNodeDragStop,
    handleAddNode,
    handleUpdateNode,
    handleDeleteNode,
  };
}
