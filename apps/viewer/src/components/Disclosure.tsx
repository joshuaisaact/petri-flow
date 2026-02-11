import { useState } from "react";
import { useTheme } from "../theme";

type Props = {
  label: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function Disclosure({ label, subtitle, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useTheme();

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 w-full text-left cursor-pointer ${open ? "mb-2" : ""} ${subtitle ? "justify-between" : ""}`}
      >
        <span className={`text-xs transition-transform ${open ? "rotate-90" : ""} ${t("text-slate-500", "text-slate-400")}`}>
          &#9656;
        </span>
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${t("text-slate-400", "text-slate-500")}`}>
          {label}
        </h3>
        {subtitle && (
          <span className={`ml-auto text-xs font-normal normal-case tracking-normal ${t("text-slate-600", "text-slate-400")}`}>
            {subtitle}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}
