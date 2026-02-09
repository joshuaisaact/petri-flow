import { Handle, Position } from "@xyflow/react";
import { motion } from "framer-motion";
import { Tooltip } from "./Tooltip";
import { useTheme } from "../../theme";
import type { TransitionNodeData } from "../../layout/dagre";

function TransitionTooltipContent({ data }: { data: TransitionNodeData }) {
  const { t } = useTheme();
  return (
    <div className="flex flex-col gap-1.5 max-w-xs">
      <span className={`font-medium ${t("text-white", "text-slate-900")}`}>{data.label}</span>
      <div className="flex items-center gap-1.5">
        <span className={t("text-slate-500", "text-slate-400")}>{data.inputs.join(", ")}</span>
        <span className={t("text-slate-500", "text-slate-400")}>&rarr;</span>
        <span className={t("text-slate-500", "text-slate-400")}>{data.outputs.join(", ")}</span>
      </div>
      {(data.hasGuard || data.hasExecute || data.timeout) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {data.hasGuard && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400">
              guard
            </span>
          )}
          {data.hasExecute && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
              execute
            </span>
          )}
          {data.timeout && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">
              timeout {data.timeout.ms}ms
            </span>
          )}
        </div>
      )}
      {data.guardCode && (
        <code className={`text-[10px] leading-tight whitespace-pre-wrap break-all ${t("text-amber-300/80", "text-amber-600")}`}>
          {data.guardCode}
        </code>
      )}
      {data.executeCode && (
        <code className={`text-[10px] leading-tight whitespace-pre-wrap break-all ${t("text-blue-300/80", "text-blue-600")}`}>
          {data.executeCode}
        </code>
      )}
      <span className={data.enabled ? "text-emerald-400" : t("text-slate-500", "text-slate-400")}>
        {data.enabled ? "Click to fire" : "Not enabled"}
      </span>
    </div>
  );
}

export function TransitionNode({ data }: { data: TransitionNodeData }) {
  const { enabled, justFired } = data;
  const { t } = useTheme();

  return (
    <Tooltip content={<TransitionTooltipContent data={data} />}>
      <motion.div
        whileTap={enabled ? { scale: 0.93 } : undefined}
        animate={
          justFired
            ? {
                boxShadow: [
                  "0 0 0 0 rgba(16,185,129,0)",
                  "0 0 20px 4px rgba(16,185,129,0.6)",
                  "0 0 0 0 rgba(16,185,129,0)",
                ],
              }
            : {}
        }
        transition={justFired ? { duration: 0.5 } : undefined}
        className={`flex items-center justify-center w-[140px] h-[36px] rounded-md border text-[11px] font-semibold tracking-wide transition-colors ${
          enabled
            ? t(
                "bg-white text-slate-900 border-slate-300 cursor-pointer shadow-lg shadow-white/10",
                "bg-slate-800 text-white border-slate-600 cursor-pointer shadow-lg shadow-slate-800/20",
              )
            : t(
                "bg-slate-800/60 text-slate-600 border-slate-700/50 cursor-default",
                "bg-slate-100 text-slate-400 border-slate-200 cursor-default",
              )
        }`}
      >
        <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
        <Handle type="target" position={Position.Right} id="right-target" className="!opacity-0 !w-1 !h-1" />
        <Handle type="target" position={Position.Left} id="left-target" className="!opacity-0 !w-1 !h-1" />
        {enabled && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 shrink-0" />
        )}
        {data.label}
        {(data.hasGuard || data.hasExecute || data.timeout) && (
          <span className="flex items-center gap-0.5 ml-1.5">
            {data.hasGuard && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
            {data.hasExecute && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
            {data.timeout && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
          </span>
        )}
        <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Right} id="right-source" className="!opacity-0 !w-1 !h-1" />
        <Handle type="source" position={Position.Left} id="left-source" className="!opacity-0 !w-1 !h-1" />
      </motion.div>
    </Tooltip>
  );
}
