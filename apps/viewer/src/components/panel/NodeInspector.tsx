import { useTheme } from "../../theme";
import { displayName } from "../../utils/displayName";
import type { PlaceNodeData, TransitionNodeData } from "../../layout/dagre";

const TRANSITION_BADGE_COLORS: Record<string, string> = {
  automatic: "bg-slate-500/20 text-slate-400",
  manual: "bg-amber-500/20 text-amber-400",
  timer: "bg-blue-500/20 text-blue-400",
  script: "bg-violet-500/20 text-violet-400",
  http: "bg-emerald-500/20 text-emerald-400",
  ai: "bg-rose-500/20 text-rose-400",
};

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  default: "bg-slate-500/20 text-slate-400",
  terminal: "bg-emerald-500/20 text-emerald-400",
  human: "bg-amber-500/20 text-amber-400",
  resource: "bg-violet-500/20 text-violet-400",
};

export type SelectedNode = {
  id: string;
  type: "place" | "transition";
  data: PlaceNodeData | TransitionNodeData;
};

function ConfigDisplay({ config }: { config: Record<string, unknown> }) {
  const { t } = useTheme();
  const entries = Object.entries(config);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const isLongText = typeof value === "string" && (value.length > 40 || value.includes("\n"));
        return (
          <div key={key}>
            <span className={`text-xs uppercase tracking-wider ${t("text-slate-500", "text-slate-400")}`}>
              {key}
            </span>
            {isLongText ? (
              <pre className={`text-xs mt-0.5 p-1.5 rounded whitespace-pre-wrap break-all font-mono ${t(
                "bg-slate-800/50 text-slate-300",
                "bg-slate-100 text-slate-700",
              )}`}>
                {String(value)}
              </pre>
            ) : (
              <div className={`text-xs ${t("text-slate-300", "text-slate-700")}`}>
                {typeof value === "number" ? value.toLocaleString() : String(value)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransitionInspector({ data }: { data: TransitionNodeData }) {
  const { t } = useTheme();
  const badgeColor = TRANSITION_BADGE_COLORS[data.transitionType] ?? TRANSITION_BADGE_COLORS.automatic;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`font-medium text-sm ${t("text-white", "text-slate-900")}`}>{data.label}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
          {displayName(data.transitionType)}
        </span>
      </div>
      <div className={`text-xs ${t("text-slate-400", "text-slate-500")}`}>
        {data.inputs.join(", ")} &rarr; {data.outputs.join(", ")}
      </div>
      {data.config != null && typeof data.config === "object" && Object.keys(data.config).length > 0 && (
        <ConfigDisplay config={data.config} />
      )}
      {data.guardCode && (
        <div>
          <span className={`text-xs uppercase tracking-wider ${t("text-slate-500", "text-slate-400")}`}>Guard</span>
          <code className={`block text-xs mt-0.5 p-1.5 rounded font-mono ${t(
            "bg-amber-500/10 text-amber-300",
            "bg-amber-50 text-amber-700",
          )}`}>
            {data.guardCode}
          </code>
        </div>
      )}
      {data.executeCode && (
        <div>
          <span className={`text-xs uppercase tracking-wider ${t("text-slate-500", "text-slate-400")}`}>Execute</span>
          <code className={`block text-xs mt-0.5 p-1.5 rounded font-mono whitespace-pre-wrap break-all ${t(
            "bg-blue-500/10 text-blue-300",
            "bg-blue-50 text-blue-700",
          )}`}>
            {data.executeCode}
          </code>
        </div>
      )}
      {data.timeout && (
        <div className={`text-xs ${t("text-slate-400", "text-slate-500")}`}>
          Timeout: {data.timeout.ms}ms &rarr; {data.timeout.place}
        </div>
      )}
    </div>
  );
}

function PlaceInspector({ data }: { data: PlaceNodeData }) {
  const { t } = useTheme();
  const badgeColor = CATEGORY_BADGE_COLORS[data.category] ?? CATEGORY_BADGE_COLORS.default;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`font-medium text-sm ${t("text-white", "text-slate-900")}`}>{data.label}</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
          {displayName(data.category)}
        </span>
      </div>
      <div className={`text-xs ${t("text-slate-400", "text-slate-500")}`}>
        Tokens: <span className={`font-medium ${t("text-white", "text-slate-900")}`}>{data.tokens}</span>
      </div>
    </div>
  );
}

export function NodeInspectorOverlay({
  selectedNode,
  onClose,
  onExecute,
}: {
  selectedNode: SelectedNode;
  onClose: () => void;
  onExecute?: (transitionName: string) => void;
}) {
  const { t } = useTheme();
  const isTransition = selectedNode.type === "transition";
  const transitionData = isTransition ? (selectedNode.data as TransitionNodeData) : null;
  const canExecute = isTransition && transitionData!.enabled && onExecute;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 ${t("bg-black/40", "bg-black/20")}`}
        onClick={onClose}
      />
      {/* Card */}
      <div className={`relative w-80 max-h-[80%] overflow-y-auto rounded-xl border shadow-2xl p-4 ${t(
        "bg-slate-900 border-slate-700 shadow-black/50",
        "bg-white border-slate-200 shadow-slate-400/20",
      )}`}>
        <button
          onClick={onClose}
          className={`absolute top-3 right-3 text-sm leading-none px-1.5 py-0.5 rounded transition-colors cursor-pointer ${t(
            "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
            "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
          )}`}
        >
          &times;
        </button>
        {isTransition ? (
          <TransitionInspector data={transitionData!} />
        ) : (
          <PlaceInspector data={selectedNode.data as PlaceNodeData} />
        )}
        {canExecute && (
          <button
            onClick={() => { onExecute(transitionData!.label); onClose(); }}
            className="mt-3 w-full text-xs font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer bg-emerald-600 text-white hover:bg-emerald-500"
          >
            Execute
          </button>
        )}
        {isTransition && !transitionData!.enabled && (
          <p className={`mt-2 text-xs italic ${t("text-slate-600", "text-slate-400")}`}>
            Not currently enabled
          </p>
        )}
      </div>
    </div>
  );
}
