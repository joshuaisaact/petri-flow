import { useTheme } from "../../theme";
import { Disclosure } from "../Disclosure";

type Props = {
  context: Record<string, unknown>;
};

export function WorkflowContext({ context }: Props) {
  const { t } = useTheme();
  const entries = Object.entries(context);

  return (
    <Disclosure label="Context" subtitle="What is known">
      {entries.length === 0 ? (
        <p className={`text-sm ${t("text-slate-500", "text-slate-400")}`}>No context</p>
      ) : (
        <div className="space-y-1 text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <span className={`font-mono font-medium ${t("text-slate-300", "text-slate-600")}`}>
                {key}
              </span>
              {value === null ? (
                <span className={`font-mono ${t("text-slate-500", "text-slate-400")}`}>null</span>
              ) : typeof value === "object" ? (
                <pre className={`font-mono text-[11px] leading-tight whitespace-pre-wrap break-all max-h-32 overflow-y-auto ${t("text-slate-400", "text-slate-500")}`}>
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                <span className={`font-mono ${t("text-slate-400", "text-slate-500")}`}>
                  {String(value)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Disclosure>
  );
}
