import { useTheme } from "../../theme";

type Props = {
  playing: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (ms: number) => void;
  isTerminal: boolean;
};

export function PlaybackControls({
  playing,
  onTogglePlay,
  onReset,
  speed,
  onSpeedChange,
  isTerminal,
}: Props) {
  const { t } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onReset}
        className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${t(
          "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700",
          "bg-white hover:bg-slate-50 text-slate-600 border-slate-300",
        )}`}
      >
        Reset
      </button>
      <button
        onClick={onTogglePlay}
        disabled={isTerminal && !playing}
        className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
          playing
            ? "bg-red-950 hover:bg-red-900 text-red-400 border-red-800"
            : "bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border-emerald-800 disabled:opacity-30 disabled:cursor-default"
        }`}
      >
        {playing ? "Stop" : "Auto-play"}
      </button>
      <div className={`w-px h-4 mx-1 ${t("bg-slate-700", "bg-slate-300")}`} />
      <label className={`flex items-center gap-2 text-xs ${t("text-slate-500", "text-slate-400")}`}>
        <input
          type="range"
          min={200}
          max={2000}
          step={100}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className={`w-20 ${t("accent-slate-500", "accent-slate-400")}`}
        />
        {speed}ms
      </label>
    </div>
  );
}
