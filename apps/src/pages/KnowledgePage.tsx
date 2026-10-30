import { useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  ReactFlowProvider,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { KnowledgeNode } from "../components/knowledge/KnowledgeNode";
import { KnowledgeNodePanel } from "../components/knowledge/KnowledgeNodePanel";
import { KnowledgeToolbar } from "../components/knowledge/KnowledgeToolbar";
import { KnowledgeUploadModal } from "../components/knowledge/KnowledgeUploadModal";
import { FloatingEdge } from "../components/knowledge/FloatingEdge";
import { useTheme } from "../lib/theme";
import { useKnowledgeGraph } from "../components/knowledge/hooks/useKnowledgeGraph";

const nodeTypes = {
  knowledge: KnowledgeNode,
};

const edgeTypes = {
  floating: FloatingEdge,
  bezier: FloatingEdge,
  default: FloatingEdge,
};

function FlowEditor() {
  const { isLight } = useTheme();

  const [uploadOpen, setUploadOpen] = useState(false);

  const {
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
  } = useKnowledgeGraph({ isLight });

  return (
    <div className="flex-1 h-full relative bg-[var(--bg-app)] text-[var(--text-primary)]">
      {loading ? (
        <div className="w-full h-full flex items-center justify-center bg-[var(--bg-app)]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-[var(--border-strong)] border-t-[var(--text-primary)] rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-muted)] font-medium">
              Loading Knowledge Graph...
            </p>
          </div>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          isValidConnection={isValidConnection}
          colorMode={isLight ? "light" : "dark"}
          proOptions={{ hideAttribution: true }}
          fitView
          fitViewOptions={{ padding: 0.9, maxZoom: 0.85, minZoom: 0.1 }}
          minZoom={0.1}
          maxZoom={2}
          panOnDrag={true}
          className="bg-[var(--bg-app)]"
          defaultEdgeOptions={{
            type: "floating",
            style: {
              stroke: isLight ? "#64748B" : "#94A3B8",
              strokeWidth: 2.75,
            },
          }}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
          }}
        >
          <Background
            color={isLight ? "#D1D5DB" : "#333338"}
            gap={20}
            size={1.2}
          />
          <Controls className="!bg-[var(--bg-panel)] border !border-[var(--border-strong)] rounded-xl overflow-hidden !bottom-8 !left-4 [&_button]:!bg-[var(--bg-panel)] [&_button]:!text-[var(--text-primary)] [&_button]:!border-b-[var(--border-color)] [&_button:hover]:!bg-[var(--bg-hover)]" />
          <MiniMap
            className="rounded-xl !bg-[var(--bg-card)] border !border-[var(--border-color)] overflow-hidden !bottom-8 !right-4 transition-colors"
            maskColor={
              isLight ? "rgba(15, 23, 42, 0.08)" : "rgba(0, 0, 0, 0.65)"
            }
            maskStrokeColor={
              isLight ? "rgba(15, 23, 42, 0.25)" : "rgba(255, 255, 255, 0.25)"
            }
            maskStrokeWidth={1.5}
            nodeBorderRadius={6}
            nodeColor={(node) => {
              if (node.id === "main-ai-node")
                return isLight ? "#0f172a" : "#ffffff";
              return isLight ? "#94a3b8" : "#71717a";
            }}
            nodeStrokeColor={isLight ? "#cbd5e1" : "#3f3f46"}
            nodeStrokeWidth={1}
          />

          <KnowledgeToolbar
            onAddNode={handleAddNode}
            onUpload={() => setUploadOpen(true)}
          />

          <KnowledgeNodePanel
            nodeId={selectedNodeId}
            onClose={() => {
              setSelectedNodeId(null);
              setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
            }}
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
          />
        </ReactFlow>
      )}

      {/* Upload Modal */}
      <KnowledgeUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSelectNode={(id) => setSelectedNodeId(id)}
        onSuccess={(newNode, newEdge) => {
          setNodes((nds) => [...nds, newNode]);
          if (newEdge) setEdges((eds) => addEdge(newEdge, eds));
        }}
      />
    </div>
  );
}

export function KnowledgePage() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}
export default KnowledgePage;
