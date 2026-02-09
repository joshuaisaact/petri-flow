import { useTheme } from "../theme";

type Props = {
  names: string[];
  activeName: string;
  onSelect: (name: string) => void;
  onNew: () => void;
  onDelete: (name: string) => void;
};

export function WorkflowList({ names, activeName, onSelect, onNew, onDelete }: Props) {
  const { t } = useTheme();

  return (
    <div className={`w-52 border-r flex flex-col ${t("bg-slate-950 border-slate-800", "bg-slate-50 border-slate-200")}`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${t("border-slate-800", "border-slate-200")}`}>
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${t("text-slate-400", "text-slate-500")}`}>
          Workflows
        </h2>
        <button
          onClick={onNew}
          className={`text-xs px-2 py-1 rounded-md border transition-colors ${t(
            "border-slate-700 text-slate-300 hover:bg-slate-800",
            "border-slate-300 text-slate-600 hover:bg-slate-100",
          )}`}
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {names.length === 0 && (
          <p className={`text-xs px-3 py-4 ${t("text-slate-600", "text-slate-400")}`}>
            No saved workflows. Start the server or create a new one.
          </p>
        )}
        {names.map((name) => (
          <div
            key={name}
            className={`group flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer transition-colors ${
              name === activeName
                ? t("bg-slate-800 text-white", "bg-slate-200 text-slate-900")
                : t("text-slate-400 hover:text-slate-200 hover:bg-slate-900", "text-slate-600 hover:text-slate-900 hover:bg-slate-100")
            }`}
          >
            <span className="flex-1 truncate" onClick={() => onSelect(name)}>
              {name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(name);
              }}
              className={`opacity-0 group-hover:opacity-100 text-xs px-1 rounded transition-opacity ${t(
                "text-red-400 hover:bg-red-950",
                "text-red-500 hover:bg-red-50",
              )}`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
