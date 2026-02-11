import { useMemo, useState } from "react";
import { usePetriNet, type PetriNetMode } from "./hooks/usePetriNet";
import { useAnalysis } from "./hooks/useAnalysis";
import { useAutoPlay } from "./hooks/useAutoPlay";
import { layoutNet, type TokenDisplay } from "./layout/dagre";
import { PetriNetCanvas } from "./components/canvas/PetriNetCanvas";
import { AnalysisPanel } from "./components/panel/AnalysisPanel";
import { NodeInspectorOverlay } from "./components/panel/NodeInspector";
import { PlaybackControls } from "./components/controls/PlaybackControls";
import { useTheme } from "./theme";
import type { ViewerNet } from "./types";

type Props = {
  viewerNet: ViewerNet;
};

export function Viewer({ viewerNet }: Props) {
  const [mode, setMode] = useState<PetriNetMode>("simulate");
  const { marking, enabled, isTerminal, history, lastFired, firing, context, fireTransition, reset } =
    usePetriNet(viewerNet, mode);
  const { result, properties } = useAnalysis(viewerNet);
  const { playing, setPlaying, speed, setSpeed } = useAutoPlay(
    enabled,
    isTerminal,
    fireTransition,
    firing,
  );
  const [tokenDisplay, setTokenDisplay] = useState<TokenDisplay>("numbers");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { t } = useTheme();

  const hasDefinition = !!viewerNet.definition;

  function switchMode(newMode: PetriNetMode) {
    if (newMode === mode) return;
    setPlaying(false);
    setMode(newMode);
    reset();
  }

  // Layout computed once per net — positions never change
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutNet(
      viewerNet.net,
      viewerNet.net.initialMarking,
      viewerNet.placeMetadata,
      viewerNet.definition?.net.transitions,
      viewerNet.definition?.executors,
    ),
    [viewerNet],
  );

  const selectedNode = selectedNodeId
    ? (() => {
        const node = initialNodes.find((n) => n.id === selectedNodeId);
        if (!node) return undefined;
        if (node.type === "place") {
          return {
            id: node.id,
            type: "place" as const,
            data: { ...(node.data as any), tokens: marking[node.id] ?? 0 },
          };
        }
        if (node.type === "transition") {
          const name = node.id.slice(2);
          return {
            id: node.id,
            type: "transition" as const,
            data: { ...(node.data as any), enabled: enabled.some((t) => t.name === name) },
          };
        }
        return undefined;
      })()
    : undefined;

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 flex flex-col">
        <div className={`flex items-center gap-2 px-4 py-2 ${t("bg-slate-900/50", "bg-slate-100/80")}`}>
          <PlaybackControls
            playing={playing}
            onTogglePlay={() => setPlaying(!playing)}
            onReset={() => {
              setPlaying(false);
              reset();
            }}
            speed={speed}
            onSpeedChange={setSpeed}
            isTerminal={isTerminal}
          />
          <div className={`w-px h-4 mx-1 ${t("bg-slate-700", "bg-slate-300")}`} />
          <div
            className={`flex items-center rounded-md border text-[11px] ${t(
              "bg-slate-800 border-slate-700",
              "bg-white border-slate-300",
            )}`}
          >
            <button
              onClick={() => setTokenDisplay("numbers")}
              title="Show token counts as numbers"
              className={`px-2 py-1 rounded-l-md transition-colors cursor-pointer ${
                tokenDisplay === "numbers"
                  ? t("bg-slate-600 text-white", "bg-slate-200 text-slate-900")
                  : t("text-slate-400 hover:text-slate-300", "text-slate-400 hover:text-slate-600")
              }`}
            >
              123
            </button>
            <button
              onClick={() => setTokenDisplay("dots")}
              title="Show token counts as dots"
              className={`px-2 py-1 rounded-r-md transition-colors cursor-pointer ${
                tokenDisplay === "dots"
                  ? t("bg-slate-600 text-white", "bg-slate-200 text-slate-900")
                  : t("text-slate-400 hover:text-slate-300", "text-slate-400 hover:text-slate-600")
              }`}
            >
              &bull;&bull;&bull;
            </button>
          </div>
          {hasDefinition && (
            <>
              <div className={`w-px h-4 mx-1 ${t("bg-slate-700", "bg-slate-300")}`} />
              <div
                className={`flex items-center rounded-md border text-[11px] ${t(
                  "bg-slate-800 border-slate-700",
                  "bg-white border-slate-300",
                )}`}
              >
                <button
                  onClick={() => switchMode("simulate")}
                  title="Simulate: instant token movement, no side effects"
                  className={`px-2 py-1 rounded-l-md transition-colors cursor-pointer ${
                    mode === "simulate"
                      ? t("bg-slate-600 text-white", "bg-slate-200 text-slate-900")
                      : t("text-slate-400 hover:text-slate-300", "text-slate-400 hover:text-slate-600")
                  }`}
                >
                  Simulate
                </button>
                <button
                  onClick={() => switchMode("execute")}
                  title="Execute: run actual executors (HTTP calls, timers)"
                  className={`px-2 py-1 rounded-r-md transition-colors cursor-pointer ${
                    mode === "execute"
                      ? t("bg-blue-600 text-white", "bg-blue-100 text-blue-900")
                      : t("text-slate-400 hover:text-slate-300", "text-slate-400 hover:text-slate-600")
                  }`}
                >
                  Execute
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 relative">
          <PetriNetCanvas
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            marking={marking}
            enabled={enabled}
            onFire={fireTransition}
            tokenDisplay={tokenDisplay}
            lastFired={lastFired}
            isTerminal={isTerminal}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            firing={firing}
          />
          {selectedNode && (
            <NodeInspectorOverlay
              selectedNode={selectedNode}
              onClose={() => setSelectedNodeId(null)}
              onExecute={fireTransition}
            />
          )}
        </div>
      </div>
      <AnalysisPanel
        viewerNet={viewerNet}
        marking={marking}
        history={history}
        isTerminal={isTerminal}
        result={result}
        properties={properties}
        context={mode === "execute" ? context : undefined}
      />
    </div>
  );
}
