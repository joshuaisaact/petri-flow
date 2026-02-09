import { useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PlaceNode } from "../components/canvas/PlaceNode";
import { TransitionNode } from "../components/canvas/TransitionNode";
import { useTheme } from "../theme";
import { NameDialog } from "./Dialog";
import type { PlaceNodeData } from "../layout/dagre";

const nodeTypes: NodeTypes = {
  place: PlaceNode,
  transition: TransitionNode,
};

type ContextMenuState = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
} | null;

type PendingAdd = {
  type: "place" | "transition";
  flowX: number;
  flowY: number;
};

type Props = {
  nodes: Node[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onConnect: (source: string, target: string) => void;
  onNodeDrag: (id: string, pos: { x: number; y: number }) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode: (id: string) => void;
  onAddPlace: (name: string, at: { x: number; y: number }) => void;
  onAddTransition: (name: string, at: { x: number; y: number }) => void;
  onUndo: () => void;
};

function ContextMenu({
  x,
  y,
  onAddPlace,
  onAddTransition,
  onClose,
}: {
  x: number;
  y: number;
  onAddPlace: () => void;
  onAddTransition: () => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        className={`fixed z-50 rounded-lg border shadow-xl py-1 min-w-[160px] ${t(
          "bg-slate-900 border-slate-700",
          "bg-white border-slate-200",
        )}`}
        style={{ left: x, top: y }}
      >
        <button
          onClick={onAddPlace}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${t(
            "text-slate-300 hover:bg-slate-800",
            "text-slate-700 hover:bg-slate-100",
          )}`}
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500 mr-2 align-middle" />
          Add Place
        </button>
        <button
          onClick={onAddTransition}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${t(
            "text-slate-300 hover:bg-slate-800",
            "text-slate-700 hover:bg-slate-100",
          )}`}
        >
          <span className={`inline-block w-3 h-2 rounded-sm mr-2 align-middle ${t("bg-white", "bg-slate-800")}`} />
          Add Transition
        </button>
      </div>
    </>
  );
}

function EmptyState() {
  const { t } = useTheme();
  return (
    <Panel position="top-center">
      <div className={`mt-32 text-center px-6 py-4 rounded-lg border ${t(
        "bg-slate-900/80 border-slate-700 text-slate-400",
        "bg-white/80 border-slate-200 text-slate-500",
      )}`}>
        <p className="text-sm font-medium mb-1">Empty canvas</p>
        <p className="text-xs">Right-click or double-click to add places and transitions</p>
      </div>
    </Panel>
  );
}

function ConnectingBanner({ fromId, onCancel }: { fromId: string; onCancel: () => void }) {
  const { t } = useTheme();
  const label = fromId.startsWith("t:") ? fromId.slice(2) : fromId;
  return (
    <Panel position="top-center">
      <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border shadow-lg ${t(
        "bg-indigo-950/90 border-indigo-800 text-indigo-300",
        "bg-indigo-50/90 border-indigo-200 text-indigo-700",
      )}`}>
        <span className="text-xs font-medium">
          Connecting from <span className="font-bold">{label}</span> — click a target node
        </span>
        <button onClick={onCancel} className="text-xs opacity-70 hover:opacity-100">
          Esc to cancel
        </button>
      </div>
    </Panel>
  );
}

/** Check if two nodes can be connected (place↔transition only) */
function canConnect(a: string, b: string): boolean {
  const aIsTrans = a.startsWith("t:");
  const bIsTrans = b.startsWith("t:");
  return aIsTrans !== bIsTrans;
}

function EditorCanvasInner({
  nodes,
  edges,
  selectedId,
  onSelect,
  onConnect,
  onNodeDrag,
  onDeleteEdge,
  onDeleteNode,
  onAddPlace,
  onAddTransition,
  onUndo,
}: Props) {
  const { isDark } = useTheme();
  const { screenToFlowPosition } = useReactFlow();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  const isEmpty = nodes.length === 0;

  // Style nodes — highlight connecting source and valid targets
  const styledNodes = nodes.map((node) => {
    const isConnectSource = connectingFrom === node.id;
    const isValidTarget = connectingFrom !== null && connectingFrom !== node.id && canConnect(connectingFrom, node.id);
    const isSelected = node.id === selectedId && !connectingFrom;

    let style: React.CSSProperties | undefined;
    if (isConnectSource) {
      style = { filter: "drop-shadow(0 0 8px rgba(99, 102, 241, 0.8))" };
    } else if (isValidTarget) {
      style = { filter: "drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))", cursor: "crosshair" };
    } else if (isSelected) {
      style = { filter: "drop-shadow(0 0 6px rgba(99, 102, 241, 0.7))" };
    }

    return {
      ...node,
      selected: isSelected,
      style,
      className: isValidTarget ? "cursor-crosshair" : undefined,
    };
  });

  const styledEdges = edges.map((edge) => {
    if (edge.style?.strokeDasharray) return edge;
    const strokeColor = isDark ? "#475569" : "#94a3b8";
    return {
      ...edge,
      style: { stroke: strokeColor, strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: strokeColor,
      },
    };
  });

  function handleConnect(connection: Connection) {
    if (connection.source && connection.target) {
      onConnect(connection.source, connection.target);
    }
  }

  function handleNodeDragStop(_: React.MouseEvent, node: Node) {
    onNodeDrag(node.id, node.position);
  }

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    if (connectingFrom) {
      // Complete connection
      if (connectingFrom !== node.id && canConnect(connectingFrom, node.id)) {
        onConnect(connectingFrom, node.id);
      }
      setConnectingFrom(null);
      return;
    }

    // Start connecting mode on single click — also select the node
    onSelect(node.id);
  }

  function handleNodeDoubleClick(_: React.MouseEvent, node: Node) {
    // Double-click to start connecting from this node
    setConnectingFrom(node.id);
  }

  function handlePaneClick() {
    if (connectingFrom) {
      setConnectingFrom(null);
      return;
    }
    onSelect(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (connectingFrom) {
        setConnectingFrom(null);
        return;
      }
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      onUndo();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !connectingFrom) {
      e.preventDefault();
      onDeleteNode(selectedId);
    }
  }

  function handleEdgeClick(_: React.MouseEvent, edge: Edge) {
    if (connectingFrom) {
      setConnectingFrom(null);
      return;
    }
    onDeleteEdge(edge.id);
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (connectingFrom) {
      setConnectingFrom(null);
      e.preventDefault();
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest(".react-flow__node")) return;

    e.preventDefault();
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setContextMenu({ x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y });
  }

  function handlePaneDoubleClick(e: React.MouseEvent) {
    if (connectingFrom) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setContextMenu({ x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y });
  }

  function startAdd(type: "place" | "transition") {
    if (!contextMenu) return;
    setPendingAdd({ type, flowX: contextMenu.flowX, flowY: contextMenu.flowY });
    setContextMenu(null);
  }

  function commitAdd(name: string) {
    if (!pendingAdd) return;
    const pos = { x: pendingAdd.flowX, y: pendingAdd.flowY };
    if (pendingAdd.type === "place") {
      onAddPlace(name, pos);
    } else {
      onAddTransition(name, pos);
    }
    setPendingAdd(null);
  }

  return (
    <div className={`editor-canvas h-full ${connectingFrom ? "connecting" : ""}`} onKeyDown={handleKeyDown} tabIndex={-1}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        onEdgeClick={handleEdgeClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handlePaneDoubleClick}
        nodesDraggable={!connectingFrom}
        nodesConnectable
        elementsSelectable={!connectingFrom}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: isDark ? "#334155" : "#cbd5e1", strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          color={isDark ? "#1e293b" : "#cbd5e1"}
          style={{ backgroundColor: isDark ? undefined : "#f8fafc" }}
        />
        <Controls showInteractive={false} className={isDark ? "" : "light-controls"} />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "transition") return isDark ? "#475569" : "#94a3b8";
            const cat = (node.data as PlaceNodeData).category;
            if (cat === "terminal") return "#10b981";
            if (cat === "human") return "#f59e0b";
            if (cat === "resource") return "#8b5cf6";
            return isDark ? "#64748b" : "#94a3b8";
          }}
          maskColor={isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)"}
          style={{ background: isDark ? "#0f172a" : "#f1f5f9" }}
          className={isDark ? "" : "light-minimap"}
        />
        {isEmpty && <EmptyState />}
        {connectingFrom && (
          <ConnectingBanner fromId={connectingFrom} onCancel={() => setConnectingFrom(null)} />
        )}
      </ReactFlow>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAddPlace={() => startAdd("place")}
          onAddTransition={() => startAdd("transition")}
          onClose={() => setContextMenu(null)}
        />
      )}

      <NameDialog
        open={pendingAdd !== null}
        title={pendingAdd?.type === "place" ? "New Place" : "New Transition"}
        placeholder={pendingAdd?.type === "place" ? "Place name" : "Transition name"}
        onConfirm={commitAdd}
        onCancel={() => setPendingAdd(null)}
      />
    </div>
  );
}

export function EditorCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
