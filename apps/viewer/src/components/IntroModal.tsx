import { useEffect } from "react";
import { useTheme } from "../theme";
import type { ViewerNetIntro } from "../types";

type Props = {
  intro: ViewerNetIntro;
  name: string;
  onClose: () => void;
};

export function IntroModal({ intro, name, onClose }: Props) {
  const { t } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative rounded-lg border shadow-xl p-6 max-w-md w-full mx-4 ${t(
          "bg-slate-900 border-slate-700",
          "bg-white border-slate-200",
        )}`}
      >
        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${t("text-indigo-400", "text-indigo-600")}`}>
          {name}
        </p>
        <h2 className={`text-base font-semibold mb-3 ${t("text-white", "text-slate-900")}`}>
          {intro.title}
        </h2>
        <ul className="space-y-2 mb-4">
          {intro.bullets.map((bullet, i) => (
            <li key={i} className={`text-sm flex gap-2 ${t("text-slate-300", "text-slate-600")}`}>
              <span className={`mt-0.5 shrink-0 ${t("text-slate-500", "text-slate-400")}`}>&bull;</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        {intro.tip && (
          <div
            className={`text-xs rounded-md px-3 py-2 mb-4 ${t(
              "bg-indigo-950/50 text-indigo-300 border border-indigo-800/50",
              "bg-indigo-50 text-indigo-700 border border-indigo-200",
            )}`}
          >
            <span className="font-medium">Tip:</span> {intro.tip}
          </div>
        )}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-xs px-4 py-1.5 rounded-md font-medium transition-colors cursor-pointer bg-indigo-600 text-white hover:bg-indigo-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
