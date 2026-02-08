import type { ReactNode } from "react";
import { useTheme } from "../../theme";

type Props = {
  children: ReactNode;
  content: ReactNode;
};

export function Tooltip({ children, content }: Props) {
  const { t } = useTheme();
  return (
    <div className="group/tip relative">
      {children}
      <div className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 z-50">
        <div
          className={`rounded-lg px-3 py-2 shadow-xl text-[11px] leading-relaxed whitespace-nowrap border ${t(
            "bg-slate-900 border-slate-700",
            "bg-white border-slate-200",
          )}`}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
