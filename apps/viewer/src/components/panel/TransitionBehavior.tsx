import { useState } from "react";
import type { WorkflowDefinition } from "@petriflow/engine/types";
import { useTheme } from "../../theme";

type Props = {
  definition: WorkflowDefinition<string, any>;
};

type Badge = { label: string; color: string };
type Entry = { name: string; badges: Badge[]; details: Detail[] };
type Detail = { content: string; border: string };

function EntryRow({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  const { t } = useTheme();

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm cursor-pointer"
      >
        <span className={`text-[10px] select-none ${t("text-slate-600", "text-slate-400")}`}>
          {open ? "\u25BC" : "\u25B6"}
        </span>
        <span className={`font-mono truncate ${t("text-slate-200", "text-slate-700")}`}>{entry.name}</span>
        {entry.badges.map((b) => (
          <span
            key={b.label}
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${b.color}`}
          >
            {b.label}
          </span>
        ))}
      </div>
      {open && entry.details.length > 0 && (
        <div className="mt-1.5 ml-4 space-y-1.5">
          {entry.details.map((d, i) => (
            <pre
              key={i}
              className={`text-xs leading-relaxed whitespace-pre-wrap break-all pl-2.5 border-l-2 ${d.border} ${t(
                "text-slate-300 bg-slate-800/50",
                "text-slate-600 bg-slate-100",
              )} rounded-r px-2.5 py-1.5`}
            >
              {d.content}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

export function TransitionBehavior({ definition }: Props) {
  const { t } = useTheme();

  const entries: Entry[] = [];
  for (const tr of definition.net.transitions) {
    const badges: Badge[] = [];
    const details: Detail[] = [];

    if (tr.guard) {
      badges.push({ label: "guard", color: "text-amber-400 bg-amber-500/20" });
      details.push({ content: tr.guard, border: "border-amber-400" });
    }
    if (definition.executors.has(tr.name)) {
      badges.push({ label: "function", color: "text-blue-400 bg-blue-500/20" });
      details.push({ content: definition.executors.get(tr.name)!.toString(), border: "border-blue-400" });
    }
    if (tr.timeout) {
      badges.push({ label: `timeout ${tr.timeout.ms}ms`, color: "text-red-400 bg-red-500/20" });
      details.push({ content: `${tr.timeout.place} after ${tr.timeout.ms}ms`, border: "border-red-400" });
    }

    if (badges.length > 0) entries.push({ name: tr.name, badges, details });
  }

  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${t("text-slate-400", "text-slate-500")}`}>
        Behaviour
      </h3>
      <div className="space-y-1.5">
        {entries.map((entry) => (
          <EntryRow key={entry.name} entry={entry} />
        ))}
      </div>
    </div>
  );
}
