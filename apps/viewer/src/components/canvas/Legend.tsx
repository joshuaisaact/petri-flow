import { useRef, useMemo } from "react";
import { Panel, useReactFlow, useNodes } from "@xyflow/react";
import { useTheme } from "../../theme";
import type { PlaceNodeData, TransitionNodeData } from "../../layout/dagre";

type LegendItem = {
  shape: "circle" | "rect";
  color: string;
  label: string;
  match: (node: { type?: string; data: Record<string, unknown> }) => boolean;
};

const placeItems: LegendItem[] = [
  { shape: "circle", color: "bg-slate-500", label: "State", match: (n) => n.type === "place" && (n.data as PlaceNodeData).category === "default" },
  { shape: "circle", color: "bg-emerald-500", label: "Terminal", match: (n) => n.type === "place" && (n.data as PlaceNodeData).category === "terminal" },
  { shape: "circle", color: "bg-amber-500", label: "Human gate", match: (n) => n.type === "place" && (n.data as PlaceNodeData).category === "human" },
  { shape: "circle", color: "bg-violet-500", label: "Resource", match: (n) => n.type === "place" && (n.data as PlaceNodeData).category === "resource" },
];

const transitionItems: LegendItem[] = [
  { shape: "rect", color: "bg-slate-400", label: "Automatic", match: (n) => n.type === "transition" && (n.data as TransitionNodeData).transitionType === "automatic" },
  { shape: "rect", color: "bg-amber-400", label: "Manual", match: (n) => n.type === "transition" && (n.data as TransitionNodeData).transitionType === "manual" },
  { shape: "rect", color: "bg-blue-400", label: "Timer", match: (n) => n.type === "transition" && (n.data as TransitionNodeData).transitionType === "timer" },
  { shape: "rect", color: "bg-violet-400", label: "Script", match: (n) => n.type === "transition" && (n.data as TransitionNodeData).transitionType === "script" },
  { shape: "rect", color: "bg-emerald-400", label: "HTTP", match: (n) => n.type === "transition" && (n.data as TransitionNodeData).transitionType === "http" },
  { shape: "rect", color: "bg-rose-400", label: "AI", match: (n) => n.type === "transition" && (n.data as TransitionNodeData).transitionType === "ai" },
];

export function Legend() {
  const { t } = useTheme();
  const { getNodes, fitView } = useReactFlow();
  const nodes = useNodes();
  const cycleIndex = useRef<Record<string, number>>({});

  const visiblePlaces = useMemo(() => placeItems.filter((item) => nodes.some(item.match)), [nodes]);
  const visibleTransitions = useMemo(() => transitionItems.filter((item) => nodes.some(item.match)), [nodes]);

  function handleClick(item: LegendItem) {
    const matching = getNodes().filter(item.match);
    if (matching.length === 0) return;

    const key = item.label;
    const idx = (cycleIndex.current[key] ?? -1) + 1;
    const next = idx % matching.length;
    cycleIndex.current[key] = next;

    fitView({ nodes: [{ id: matching[next]!.id }], duration: 300, padding: 1.5 });
  }

  function renderItem(item: LegendItem) {
    return (
      <div
        key={item.label}
        onClick={() => handleClick(item)}
        className={`flex items-center gap-2 text-[10px] cursor-pointer hover:opacity-80 ${t("text-slate-400", "text-slate-500")}`}
      >
        <span
          className={`shrink-0 ${item.color} ${
            item.shape === "circle" ? "w-2.5 h-2.5 rounded-full" : "w-3 h-2 rounded-[2px]"
          }`}
        />
        {item.label}
      </div>
    );
  }

  return (
    <Panel position="bottom-left">
      <div
        className={`rounded-lg px-3 py-2 flex flex-col gap-1.5 border ${t(
          "bg-slate-900/90 border-slate-700",
          "bg-white/90 border-slate-200",
        )}`}
      >
        {visiblePlaces.map(renderItem)}
        {visiblePlaces.length > 0 && visibleTransitions.length > 0 && (
          <div className={`border-t my-0.5 ${t("border-slate-700", "border-slate-200")}`} />
        )}
        {visibleTransitions.map(renderItem)}
      </div>
    </Panel>
  );
}
