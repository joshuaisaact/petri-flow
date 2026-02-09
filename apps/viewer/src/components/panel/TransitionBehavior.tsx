import type { WorkflowDefinition } from "@petriflow/engine/types";
import { useTheme } from "../../theme";

type Props = {
  definition: WorkflowDefinition<string, any>;
};

type Badge = { label: string; color: string };

export function TransitionBehavior({ definition }: Props) {
  const { t } = useTheme();

  const entries: { name: string; badges: Badge[] }[] = [];
  for (const tr of definition.net.transitions) {
    const badges: Badge[] = [];
    if (tr.guard) badges.push({ label: "guard", color: "text-amber-400 bg-amber-500/20" });
    if (definition.executors.has(tr.name)) badges.push({ label: "execute", color: "text-blue-400 bg-blue-500/20" });
    if (tr.timeout) badges.push({ label: `timeout ${tr.timeout.ms}ms`, color: "text-red-400 bg-red-500/20" });
    if (badges.length > 0) entries.push({ name: tr.name, badges });
  }

  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${t("text-slate-400", "text-slate-500")}`}>
        Behavior
      </h3>
      <div className="space-y-1.5">
        {entries.map(({ name, badges }) => (
          <div key={name} className="flex items-center gap-1.5 text-sm">
            <span className={`font-mono truncate ${t("text-slate-200", "text-slate-700")}`}>{name}</span>
            {badges.map((b) => (
              <span
                key={b.label}
                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${b.color}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
