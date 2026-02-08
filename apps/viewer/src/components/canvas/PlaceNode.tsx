import { Handle, Position } from "@xyflow/react";
import { AnimatePresence, motion } from "framer-motion";
import { Tooltip } from "./Tooltip";
import { useTheme } from "../../theme";
import type { PlaceNodeData } from "../../layout/dagre";

const categoryRing: Record<string, string> = {
  default: "border-slate-500",
  terminal: "border-emerald-500",
  human: "border-amber-500",
  resource: "border-violet-500",
};

const categoryBgDark: Record<string, string> = {
  default: "bg-slate-900",
  terminal: "bg-emerald-950",
  human: "bg-amber-950",
  resource: "bg-violet-950",
};

const categoryBgLight: Record<string, string> = {
  default: "bg-white",
  terminal: "bg-emerald-50",
  human: "bg-amber-50",
  resource: "bg-violet-50",
};

const categoryTextColor: Record<string, string> = {
  default: "text-slate-700",
  terminal: "text-emerald-600",
  human: "text-amber-600",
  resource: "text-violet-600",
};

const categoryTextColorDark: Record<string, string> = {
  default: "text-slate-200",
  terminal: "text-emerald-400",
  human: "text-amber-400",
  resource: "text-violet-400",
};

const categoryDotColor: Record<string, string> = {
  default: "bg-slate-400",
  terminal: "bg-emerald-500",
  human: "bg-amber-500",
  resource: "bg-violet-500",
};

const categoryGlow: Record<string, string> = {
  terminal: "shadow-emerald-500/50",
  human: "shadow-amber-500/50",
  resource: "shadow-violet-500/50",
};

const categoryBadgeBg: Record<string, string> = {
  default: "bg-slate-700",
  terminal: "bg-emerald-900",
  human: "bg-amber-900",
  resource: "bg-violet-900",
};

const categoryBadgeBgLight: Record<string, string> = {
  default: "bg-slate-200",
  terminal: "bg-emerald-100",
  human: "bg-amber-100",
  resource: "bg-violet-100",
};

const categoryBadgeText: Record<string, string> = {
  default: "text-slate-300",
  terminal: "text-emerald-300",
  human: "text-amber-300",
  resource: "text-violet-300",
};

const categoryBadgeTextLight: Record<string, string> = {
  default: "text-slate-600",
  terminal: "text-emerald-700",
  human: "text-amber-700",
  resource: "text-violet-700",
};

function TokenNumber({ count, category, isDark }: { count: number; category: string; isDark: boolean }) {
  if (count === 0) return null;
  const colorMap = isDark ? categoryTextColorDark : categoryTextColor;
  const color = colorMap[category] ?? colorMap["default"]!;
  return <span className={`text-lg font-bold ${color}`}>{count}</span>;
}

function TokenDots({ count, category }: { count: number; category: string }) {
  if (count === 0) return null;
  const dotColor = categoryDotColor[category] ?? categoryDotColor["default"]!;
  if (count >= 5) return <TokenNumber count={count} category={category} isDark />;

  const dot = `w-2.5 h-2.5 rounded-full ${dotColor}`;

  if (count === 1) return <div className={dot} />;
  if (count === 2) {
    return (
      <div className="flex gap-1.5">
        <div className={dot} />
        <div className={dot} />
      </div>
    );
  }
  if (count === 3) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className={dot} />
        <div className="flex gap-1.5">
          <div className={dot} />
          <div className={dot} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1">
      <div className={dot} />
      <div className={dot} />
      <div className={dot} />
      <div className={dot} />
    </div>
  );
}

function PlaceTooltipContent({ data }: { data: PlaceNodeData }) {
  const { isDark, t } = useTheme();
  const badgeBgMap = isDark ? categoryBadgeBg : categoryBadgeBgLight;
  const badgeTextMap = isDark ? categoryBadgeText : categoryBadgeTextLight;
  const badgeBg = badgeBgMap[data.category] ?? badgeBgMap["default"]!;
  const badgeText = badgeTextMap[data.category] ?? badgeTextMap["default"]!;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={`font-medium ${t("text-white", "text-slate-900")}`}>{data.label}</span>
        <span className={`${badgeBg} ${badgeText} text-[9px] px-1.5 py-0.5 rounded-full`}>
          {data.category}
        </span>
      </div>
      <div className={`flex items-center gap-2 ${t("text-slate-400", "text-slate-500")}`}>
        <span>Tokens:</span>
        <span className={`font-mono font-medium ${t("text-white", "text-slate-900")}`}>
          {data.tokens}
        </span>
      </div>
    </div>
  );
}

export function PlaceNode({ data }: { data: PlaceNodeData }) {
  const { isDark, t } = useTheme();
  const ring = categoryRing[data.category] ?? categoryRing["default"]!;
  const bgMap = isDark ? categoryBgDark : categoryBgLight;
  const bg = bgMap[data.category] ?? bgMap["default"]!;
  const empty = data.tokens === 0;
  const glow =
    data.isTerminal && !empty
      ? categoryGlow[data.category] ?? ""
      : "";

  return (
    <Tooltip content={<PlaceTooltipContent data={data} />}>
      <div className="flex flex-col items-center">
        <div
          className={`flex items-center justify-center w-14 h-14 rounded-full border-2 ${bg} ${ring} ${
            empty
              ? "opacity-40"
              : glow
                ? `shadow-lg ${glow}`
                : "shadow-md"
          } transition-all`}
        >
          <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
          <Handle type="target" position={Position.Right} id="right-target" className="!opacity-0 !w-1 !h-1" />
          <Handle type="target" position={Position.Left} id="left-target" className="!opacity-0 !w-1 !h-1" />

          <AnimatePresence mode="wait">
            <motion.div
              key={data.tokens}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center justify-center"
            >
              {data.tokenDisplay === "dots" ? (
                <TokenDots count={data.tokens} category={data.category} />
              ) : (
                <TokenNumber count={data.tokens} category={data.category} isDark={isDark} />
              )}
            </motion.div>
          </AnimatePresence>

          <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
          <Handle type="source" position={Position.Right} id="right-source" className="!opacity-0 !w-1 !h-1" />
          <Handle type="source" position={Position.Left} id="left-source" className="!opacity-0 !w-1 !h-1" />
        </div>

        <span className={`text-[10px] mt-1 leading-tight text-center w-[90px] break-words hyphens-auto ${t("text-slate-400", "text-slate-500")}`}>
          {data.label}
        </span>
      </div>
    </Tooltip>
  );
}
