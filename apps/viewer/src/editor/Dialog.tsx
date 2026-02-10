import { useEffect, useRef, useState } from "react";
import { useTheme } from "../theme";

type Props = {
  open: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function NameDialog({
  open,
  title,
  placeholder = "Name",
  initialValue = "",
  confirmLabel = "Create",
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTheme();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      // Wait for next frame so the dialog is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialValue]);

  if (!open) return null;

  function submit() {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        className={`relative rounded-lg border shadow-xl p-5 w-80 ${t(
          "bg-slate-900 border-slate-700",
          "bg-white border-slate-200",
        )}`}
      >
        <h3 className={`text-sm font-semibold mb-3 ${t("text-white", "text-slate-900")}`}>
          {title}
        </h3>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder={placeholder}
          className={`w-full text-sm px-3 py-2 rounded-md border outline-none mb-4 ${t(
            "bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500",
            "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500",
          )}`}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${t(
              "border-slate-700 text-slate-400 hover:bg-slate-800",
              "border-slate-300 text-slate-500 hover:bg-slate-100",
            )}`}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              value.trim()
                ? "bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                : t("bg-slate-700 text-slate-500", "bg-slate-200 text-slate-400")
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
