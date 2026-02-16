import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  type NodeTypes,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PlaceNode } from "./PlaceNode";
import { TransitionNode } from "./TransitionNode";
import { Legend } from "./Legend";
import { useTheme } from "../../theme";
import type { Marking, Transition } from "petri-ts";
import type { PlaceNodeData, TransitionNodeData, TokenDisplay } from "../../layout/dagre";

const nodeTypes: NodeTypes = {
  place: PlaceNode,
  transition: TransitionNode,
};

type Props = {
  initialNodes: Node[];
  initialEdges: Edge[];
  marking: Marking<string>;
  enabled: Transition<string>[];
  onFire: (name: string) => void;
  tokenDisplay: TokenDisplay;
  lastFired: string | null;
  isTerminal: boolean;
  selectedNodeId?: string | null;
  onSelectNode?: (id: string | null) => void;
  firing?: string | null;
};

export function PetriNetCanvas({
  initialNodes,
  initialEdges,
  marking,
  enabled,
  onFire: _onFire,
  tokenDisplay,
  lastFired,
  isTerminal,
  selectedNodeId,
  onSelectNode,
  firing,
}: Props) {
  const { isDark } = useTheme();
  const enabledSet = new Set(enabled.map((t) => t.name));

  const selectionStyle = {
    filter: isDark
      ? "drop-shadow(0 0 6px rgba(99, 102, 241, 0.7))"
      : "drop-shadow(0 0 6px rgba(99, 102, 241, 0.5))",
  };

  const nodes = initialNodes.map((node) => {
    const isSelected = selectedNodeId === node.id;
    if (node.type === "place") {
      const place = node.id;
      return {
        ...node,
        style: isSelected ? selectionStyle : undefined,
        data: {
          ...(node.data as PlaceNodeData),
          tokens: marking[place] ?? 0,
          tokenDisplay,
          isTerminal,
        },
      };
    }
    if (node.type === "transition") {
      const name = node.id.slice(2);
      return {
        ...node,
        style: isSelected ? selectionStyle : undefined,
        data: {
          ...(node.data as TransitionNodeData),
          enabled: enabledSet.has(name),
          justFired: lastFired === name,
          firing: firing === name,
        },
      };
    }
    return node;
  });

  const edges = initialEdges.map((edge) => {
    const targetIsTransition = edge.target.startsWith("t:");
    const sourceIsTransition = edge.source.startsWith("t:");
    const transitionName = targetIsTransition
      ? edge.target.slice(2)
      : sourceIsTransition
        ? edge.source.slice(2)
        : null;
    const isEnabled = transitionName ? enabledSet.has(transitionName) : false;
    const isFeedback = !!edge.sourceHandle;

    const strokeColor = isFeedback
      ? "#a78bfa"
      : isEnabled
        ? isDark ? "#94a3b8" : "#475569"
        : isDark ? "#334155" : "#cbd5e1";

    return {
      ...edge,
      animated: targetIsTransition && isEnabled,
      style: {
        stroke: strokeColor,
        strokeWidth: isEnabled ? 2 : 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: strokeColor,
      },
    };
  });

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    if (onSelectNode) {
      onSelectNode(selectedNodeId === node.id ? null : node.id);
    }
  }

  function handlePaneClick() {
    if (onSelectNode) {
      onSelectNode(null);
    }
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
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
      <Controls showInteractive={false} className={isDark ? "" : "light-controls"} style={{ left: 110 }} />
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
      <Legend />
    </ReactFlow>
  );
}
