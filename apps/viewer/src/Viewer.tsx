import { useMemo, useState } from "react";
import { usePetriNet } from "./hooks/usePetriNet";
import { useAnalysis } from "./hooks/useAnalysis";
import { useAutoPlay } from "./hooks/useAutoPlay";
import { layoutNet, type TokenDisplay } from "./layout/dagre";
import { PetriNetCanvas } from "./components/canvas/PetriNetCanvas";
import { AnalysisPanel } from "./components/panel/AnalysisPanel";
import { PlaybackControls } from "./components/controls/PlaybackControls";
import { useTheme } from "./theme";
import type { ViewerNet } from "./types";

type Props = {
  viewerNet: ViewerNet;
};

export function Viewer({ viewerNet }: Props) {
  const { marking, enabled, isTerminal, history, lastFired, fireTransition, reset } =
    usePetriNet(viewerNet);
  const { result, properties } = useAnalysis(viewerNet);
  const { playing, setPlaying, speed, setSpeed } = useAutoPlay(
    enabled,
    isTerminal,
    fireTransition,
  );
  const [tokenDisplay, setTokenDisplay] = useState<TokenDisplay>("numbers");
  const { t } = useTheme();

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
              className={`px-2 py-1 rounded-l-md transition-colors ${
                tokenDisplay === "numbers"
                  ? t("bg-slate-600 text-white", "bg-slate-200 text-slate-900")
                  : t("text-slate-400 hover:text-slate-300", "text-slate-400 hover:text-slate-600")
              }`}
            >
              123
            </button>
            <button
              onClick={() => setTokenDisplay("dots")}
              className={`px-2 py-1 rounded-r-md transition-colors ${
                tokenDisplay === "dots"
                  ? t("bg-slate-600 text-white", "bg-slate-200 text-slate-900")
                  : t("text-slate-400 hover:text-slate-300", "text-slate-400 hover:text-slate-600")
              }`}
            >
              &bull;&bull;&bull;
            </button>
          </div>
        </div>
        <div className="flex-1">
          <PetriNetCanvas
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            marking={marking}
            enabled={enabled}
            onFire={fireTransition}
            tokenDisplay={tokenDisplay}
            lastFired={lastFired}
            isTerminal={isTerminal}
          />
        </div>
      </div>
      <AnalysisPanel
        viewerNet={viewerNet}
        marking={marking}
        history={history}
        isTerminal={isTerminal}
        result={result}
        properties={properties}
      />
    </div>
  );
}
