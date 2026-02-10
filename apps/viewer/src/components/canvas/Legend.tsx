import { Panel } from "@xyflow/react";
import { useTheme } from "../../theme";

const placeItems = [
  { shape: "circle", color: "bg-slate-500", label: "State" },
  { shape: "circle", color: "bg-emerald-500", label: "Terminal" },
  { shape: "circle", color: "bg-amber-500", label: "Human gate" },
  { shape: "circle", color: "bg-violet-500", label: "Resource" },
];

const transitionItems = [
  { color: "bg-slate-400", label: "Automatic" },
  { color: "bg-amber-400", label: "Manual" },
  { color: "bg-blue-400", label: "Timer" },
  { color: "bg-violet-400", label: "Script" },
  { color: "bg-emerald-400", label: "HTTP" },
  { color: "bg-rose-400", label: "AI" },
];

export function Legend() {
  const { t } = useTheme();

  return (
    <Panel position="bottom-left">
      <div
        className={`rounded-lg px-3 py-2 flex flex-col gap-1.5 border ${t(
          "bg-slate-900/90 border-slate-700",
          "bg-white/90 border-slate-200",
        )}`}
      >
        {placeItems.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 text-[10px] ${t("text-slate-400", "text-slate-500")}`}
          >
            <span className={`shrink-0 ${item.color} w-2.5 h-2.5 rounded-full`} />
            {item.label}
          </div>
        ))}
        <div className={`border-t my-0.5 ${t("border-slate-700", "border-slate-200")}`} />
        {transitionItems.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 text-[10px] ${t("text-slate-400", "text-slate-500")}`}
          >
            <span className={`shrink-0 ${item.color} w-3 h-2 rounded-sm`} />
            {item.label}
          </div>
        ))}
      </div>
    </Panel>
  );
}
