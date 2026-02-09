import { useTheme } from "../theme";

type Props = {
  name: string;
  onNameChange: (name: string) => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
};

export function EditorToolbar({
  name,
  onNameChange,
  onAutoLayout,
  onUndo,
  canUndo,
  onSave,
  saving,
  saveError,
}: Props) {
  const { t } = useTheme();

  return (
    <div className={`flex items-center gap-3 px-4 py-2 ${t("bg-slate-900/50", "bg-slate-100/80")}`}>
      <label className={`flex items-center gap-1.5 text-xs ${t("text-slate-400", "text-slate-500")}`}>
        Name
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className={`w-36 text-xs px-2 py-1 rounded-md border outline-none font-medium ${t(
            "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
            "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
          )}`}
        />
      </label>
      <div className={`w-px h-4 ${t("bg-slate-700", "bg-slate-300")}`} />
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
          canUndo
            ? t("border-slate-700 text-slate-300 hover:bg-slate-800", "border-slate-300 text-slate-600 hover:bg-slate-100")
            : t("border-slate-800 text-slate-600", "border-slate-200 text-slate-400")
        }`}
      >
        Undo
      </button>
      <button
        onClick={onAutoLayout}
        className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${t(
          "border-slate-700 text-slate-300 hover:bg-slate-800",
          "border-slate-300 text-slate-600 hover:bg-slate-100",
        )}`}
      >
        Auto Layout
      </button>
      <div className="flex-1" />
      {saveError && (
        <span className="text-xs text-red-400 max-w-xs truncate">{saveError}</span>
      )}
      <button
        onClick={onSave}
        disabled={saving}
        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
          saving
            ? t("bg-slate-700 text-slate-500", "bg-slate-200 text-slate-400")
            : t(
                "bg-emerald-600 text-white hover:bg-emerald-500",
                "bg-emerald-600 text-white hover:bg-emerald-500",
              )
        }`}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
