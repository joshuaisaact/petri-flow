import { Panel } from "@xyflow/react";
import { useTheme } from "../../theme";

const items = [
  { shape: "circle", color: "bg-slate-500", label: "State" },
  { shape: "circle", color: "bg-emerald-500", label: "Terminal" },
  { shape: "circle", color: "bg-amber-500", label: "Human gate" },
  { shape: "circle", color: "bg-violet-500", label: "Resource" },
  { shape: "rect", color: "bg-white", label: "Action" },
];

const itemsLight = [
  { shape: "circle", color: "bg-slate-500", label: "State" },
  { shape: "circle", color: "bg-emerald-500", label: "Terminal" },
  { shape: "circle", color: "bg-amber-500", label: "Human gate" },
  { shape: "circle", color: "bg-violet-500", label: "Resource" },
  { shape: "rect", color: "bg-slate-800", label: "Action" },
];

export function Legend() {
  const { isDark, t } = useTheme();
  const legendItems = isDark ? items : itemsLight;

  return (
    <Panel position="bottom-left">
      <div
        className={`rounded-lg px-3 py-2 flex flex-col gap-1.5 border ${t(
          "bg-slate-900/90 border-slate-700",
          "bg-white/90 border-slate-200",
        )}`}
      >
        {legendItems.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 text-[10px] ${t("text-slate-400", "text-slate-500")}`}
          >
            <span
              className={`shrink-0 ${item.color} ${
                item.shape === "circle" ? "w-2.5 h-2.5 rounded-full" : "w-3 h-2 rounded-sm"
              }`}
            />
            {item.label}
          </div>
        ))}
      </div>
    </Panel>
  );
}
