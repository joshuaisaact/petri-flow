import { useEffect, useState } from "react";
import type { SerializedDefinition } from "@petriflow/engine";
import { useTheme } from "../theme";
import { displayName } from "../utils/displayName";

const TRANSITION_TYPES = ["automatic", "manual", "timer", "script", "http", "ai"] as const;

type Props = {
  definition: SerializedDefinition;
  selectedId: string | null;
  onRemovePlace: (name: string) => void;
  onRemoveTransition: (name: string) => void;
  onSetTokens: (place: string, count: number) => void;
  onToggleTerminal: (place: string) => void;
  onSetGuard: (transition: string, guard: string | null) => void;
  onSetTimeout: (transition: string, timeout: { place: string; ms: number } | undefined) => void;
  onSetType: (transition: string, type: string) => void;
  onSetConfig: (transition: string, config: Record<string, unknown> | undefined) => void;
  onRenamePlace: (oldName: string, newName: string) => void;
  onRenameTransition: (oldName: string, newName: string) => void;
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${t("text-slate-400", "text-slate-500")}`}>
        {label}
      </h3>
      {children}
    </div>
  );
}

function PlaceProperties({
  place,
  definition,
  onRemove,
  onSetTokens,
  onToggleTerminal,
  onRename,
}: {
  place: string;
  definition: SerializedDefinition;
  onRemove: () => void;
  onSetTokens: (count: number) => void;
  onToggleTerminal: () => void;
  onRename: (newName: string) => void;
}) {
  const { t } = useTheme();
  const tokens = definition.initialMarking[place] ?? 0;
  const isTerminal = definition.terminalPlaces.includes(place);
  const [editName, setEditName] = useState(place);

  function commitRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== place) onRename(trimmed);
    else setEditName(place);
  }

  return (
    <div className="space-y-3">
      <Section label="Place">
        <div className="space-y-2">
          <label className={`flex items-center gap-2 text-sm ${t("text-slate-300", "text-slate-600")}`}>
            Name
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => e.key === "Enter" && commitRename()}
              className={`flex-1 text-xs px-2 py-1 rounded-md border outline-none ${t(
                "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
                "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
              )}`}
            />
          </label>
          <label className={`flex items-center gap-2 text-sm ${t("text-slate-300", "text-slate-600")}`}>
            Tokens
            <input
              type="number"
              min={0}
              value={tokens}
              onChange={(e) => onSetTokens(parseInt(e.target.value) || 0)}
              className={`w-20 text-xs px-2 py-1 rounded-md border outline-none ${t(
                "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
                "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
              )}`}
            />
          </label>
          <label className={`flex items-center gap-2 text-sm cursor-pointer ${t("text-slate-300", "text-slate-600")}`}>
            <input
              type="checkbox"
              checked={isTerminal}
              onChange={onToggleTerminal}
              className="rounded"
            />
            Terminal place
          </label>
          <button
            onClick={onRemove}
            className={`text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${t(
              "border-red-800 text-red-400 hover:bg-red-950",
              "border-red-200 text-red-600 hover:bg-red-50",
            )}`}
          >
            Delete place
          </button>
        </div>
      </Section>
    </div>
  );
}

type ConfigFormProps = {
  config: Record<string, unknown>;
  onCommit: (config: Record<string, unknown>) => void;
};

function HttpConfig({ config, onCommit }: ConfigFormProps) {
  const { t } = useTheme();
  const [url, setUrl] = useState((config.url as string) ?? "");
  const [method, setMethod] = useState((config.method as string) ?? "GET");
  const [headers, setHeaders] = useState((config.headers as string) ?? "");
  const [body, setBody] = useState((config.body as string) ?? "");
  const inputCls = `w-full text-xs px-2 py-1 rounded-md border outline-none ${t(
    "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
    "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
  )}`;
  const labelCls = `text-xs ${t("text-slate-400", "text-slate-500")}`;

  function commit() {
    onCommit({ url, method, ...(headers && { headers }), ...(body && { body }) });
  }

  return (
    <div className="space-y-2">
      <label className={labelCls}>URL</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={commit} placeholder="https://api.example.com" className={inputCls} />
      <label className={labelCls}>Method</label>
      <select value={method} onChange={(e) => { setMethod(e.target.value); }} onBlur={commit} className={`${inputCls} cursor-pointer`}>
        {["GET", "POST", "PUT", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <label className={labelCls}>Headers</label>
      <textarea value={headers} onChange={(e) => setHeaders(e.target.value)} onBlur={commit} placeholder='{"Content-Type": "application/json"}' rows={2} className={`${inputCls} font-mono`} />
      <label className={labelCls}>Body</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={commit} placeholder='{"key": "value"}' rows={3} className={`${inputCls} font-mono`} />
    </div>
  );
}

function ScriptConfig({ config, onCommit }: ConfigFormProps) {
  const { t } = useTheme();
  const [code, setCode] = useState((config.code as string) ?? "");
  const inputCls = `w-full text-xs px-2 py-1 rounded-md border outline-none font-mono ${t(
    "bg-slate-800 border-slate-700 text-emerald-300 focus:border-slate-500",
    "bg-white border-slate-300 text-emerald-700 focus:border-slate-400",
  )}`;

  return (
    <div className="space-y-2">
      <label className={`text-xs ${t("text-slate-400", "text-slate-500")}`}>Code</label>
      <textarea value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => onCommit({ code })} placeholder="ctx.result = transform(ctx.input)" rows={5} className={inputCls} />
    </div>
  );
}

function AiConfig({ config, onCommit }: ConfigFormProps) {
  const { t } = useTheme();
  const [model, setModel] = useState((config.model as string) ?? "");
  const [prompt, setPrompt] = useState((config.prompt as string) ?? "");
  const [temperature, setTemperature] = useState((config.temperature as number) ?? 0.7);
  const inputCls = `w-full text-xs px-2 py-1 rounded-md border outline-none ${t(
    "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
    "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
  )}`;
  const labelCls = `text-xs ${t("text-slate-400", "text-slate-500")}`;

  function commit() {
    onCommit({ ...(model && { model }), ...(prompt && { prompt }), temperature });
  }

  return (
    <div className="space-y-2">
      <label className={labelCls}>Model</label>
      <input value={model} onChange={(e) => setModel(e.target.value)} onBlur={commit} placeholder="claude-sonnet-4-20250514" className={inputCls} />
      <label className={labelCls}>Prompt</label>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={commit} placeholder="You are a helpful assistant..." rows={4} className={`${inputCls} font-mono`} />
      <label className={labelCls}>Temperature: {temperature}</label>
      <input type="range" min={0} max={1} step={0.1} value={temperature} onChange={(e) => { setTemperature(parseFloat(e.target.value)); }} onBlur={commit} className="w-full" />
    </div>
  );
}

function TimerConfig({ config, onCommit }: ConfigFormProps) {
  const { t } = useTheme();
  const [delayMs, setDelayMs] = useState((config.delayMs as number) ?? 0);
  const inputCls = `w-full text-xs px-2 py-1 rounded-md border outline-none ${t(
    "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
    "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
  )}`;

  return (
    <div className="space-y-2">
      <label className={`text-xs ${t("text-slate-400", "text-slate-500")}`}>Delay (ms)</label>
      <input type="number" min={0} value={delayMs} onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)} onBlur={() => onCommit({ delayMs })} className={inputCls} />
    </div>
  );
}

function ManualConfig({ config, onCommit }: ConfigFormProps) {
  const { t } = useTheme();
  const [label, setLabel] = useState((config.label as string) ?? "");
  const inputCls = `w-full text-xs px-2 py-1 rounded-md border outline-none ${t(
    "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
    "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
  )}`;

  return (
    <div className="space-y-2">
      <label className={`text-xs ${t("text-slate-400", "text-slate-500")}`}>Button label</label>
      <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => onCommit({ ...(label && { label }) })} placeholder="Approve" className={inputCls} />
    </div>
  );
}

function ConfigSection({ type, config, onCommit }: { type: string; config: Record<string, unknown>; onCommit: (config: Record<string, unknown>) => void }) {
  switch (type) {
    case "http": return <HttpConfig config={config} onCommit={onCommit} />;
    case "script": return <ScriptConfig config={config} onCommit={onCommit} />;
    case "ai": return <AiConfig config={config} onCommit={onCommit} />;
    case "timer": return <TimerConfig config={config} onCommit={onCommit} />;
    case "manual": return <ManualConfig config={config} onCommit={onCommit} />;
    default: return null;
  }
}

function TransitionProperties({
  transition,
  definition,
  onRemove,
  onSetGuard,
  onSetTimeout,
  onSetType,
  onSetConfig,
  onRename,
  onAddInput,
  onRemoveInput,
  onAddOutput,
  onRemoveOutput,
}: {
  transition: SerializedDefinition["transitions"][number];
  definition: SerializedDefinition;
  onRemove: () => void;
  onSetGuard: (guard: string | null) => void;
  onSetTimeout: (timeout: { place: string; ms: number } | undefined) => void;
  onSetType: (type: string) => void;
  onSetConfig: (config: Record<string, unknown> | undefined) => void;
  onRename: (newName: string) => void;
  onAddInput: (place: string) => void;
  onRemoveInput: (place: string) => void;
  onAddOutput: (place: string) => void;
  onRemoveOutput: (place: string) => void;
}) {
  const { t } = useTheme();
  const [editName, setEditName] = useState(transition.name);
  const [guardInput, setGuardInput] = useState(transition.guard ?? "");
  const [timeoutPlace, setTimeoutPlace] = useState(transition.timeout?.place ?? "");
  const [timeoutMs, setTimeoutMs] = useState(transition.timeout?.ms ?? 0);

  function commitRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== transition.name) onRename(trimmed);
    else setEditName(transition.name);
  }

  function commitGuard() {
    const trimmed = guardInput.trim();
    onSetGuard(trimmed || null);
  }

  function commitTimeout() {
    const place = timeoutPlace.trim();
    if (place && timeoutMs > 0) {
      onSetTimeout({ place, ms: timeoutMs });
    } else {
      onSetTimeout(undefined);
    }
  }

  return (
    <div className="space-y-3">
      <Section label="Transition">
        <div className="space-y-2">
          <label className={`flex items-center gap-2 text-sm ${t("text-slate-300", "text-slate-600")}`}>
            Type
            <select
              value={transition.type ?? "automatic"}
              onChange={(e) => onSetType(e.target.value)}
              className={`flex-1 text-xs px-2 py-1 rounded-md border outline-none cursor-pointer ${t(
                "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
                "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
              )}`}
            >
              {TRANSITION_TYPES.map((tt) => (
                <option key={tt} value={tt}>{displayName(tt)}</option>
              ))}
            </select>
          </label>
          <label className={`flex items-center gap-2 text-sm ${t("text-slate-300", "text-slate-600")}`}>
            Name
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => e.key === "Enter" && commitRename()}
              className={`flex-1 text-xs px-2 py-1 rounded-md border outline-none ${t(
                "bg-slate-800 border-slate-700 text-white focus:border-slate-500",
                "bg-white border-slate-300 text-slate-900 focus:border-slate-400",
              )}`}
            />
          </label>
          <div>
            <span className={`text-xs ${t("text-slate-500", "text-slate-400")}`}>Inputs</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {transition.inputs.map((p) => (
                <span
                  key={p}
                  className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${t(
                    "bg-slate-800 text-slate-300",
                    "bg-slate-200 text-slate-700",
                  )}`}
                >
                  {p}
                  <button
                    onClick={() => onRemoveInput(p)}
                    className={`leading-none cursor-pointer ${t(
                      "text-slate-500 hover:text-slate-300",
                      "text-slate-400 hover:text-slate-600",
                    )}`}
                  >&times;</button>
                </span>
              ))}
            </div>
            {(() => {
              const available = definition.places.filter((p) => !transition.inputs.includes(p));
              if (available.length === 0) return null;
              return (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) onAddInput(e.target.value); }}
                  className={`mt-1 w-full text-xs px-2 py-1 rounded-md border outline-none cursor-pointer ${t(
                    "bg-slate-800 border-slate-700 text-slate-400 focus:border-slate-500",
                    "bg-white border-slate-300 text-slate-500 focus:border-slate-400",
                  )}`}
                >
                  <option value="">Add input place...</option>
                  {available.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              );
            })()}
          </div>
          <div>
            <span className={`text-xs ${t("text-slate-500", "text-slate-400")}`}>Outputs</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {transition.outputs.map((p) => (
                <span
                  key={p}
                  className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${t(
                    "bg-slate-800 text-slate-300",
                    "bg-slate-200 text-slate-700",
                  )}`}
                >
                  {p}
                  <button
                    onClick={() => onRemoveOutput(p)}
                    className={`leading-none cursor-pointer ${t(
                      "text-slate-500 hover:text-slate-300",
                      "text-slate-400 hover:text-slate-600",
                    )}`}
                  >&times;</button>
                </span>
              ))}
            </div>
            {(() => {
              const available = definition.places.filter((p) => !transition.outputs.includes(p));
              if (available.length === 0) return null;
              return (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) onAddOutput(e.target.value); }}
                  className={`mt-1 w-full text-xs px-2 py-1 rounded-md border outline-none cursor-pointer ${t(
                    "bg-slate-800 border-slate-700 text-slate-400 focus:border-slate-500",
                    "bg-white border-slate-300 text-slate-500 focus:border-slate-400",
                  )}`}
                >
                  <option value="">Add output place...</option>
                  {available.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              );
            })()}
          </div>
        </div>
      </Section>
      <Section label="Guard">
        <div className="space-y-1">
          <input
            value={guardInput}
            onChange={(e) => setGuardInput(e.target.value)}
            onBlur={commitGuard}
            onKeyDown={(e) => e.key === "Enter" && commitGuard()}
            placeholder="filtrex expression"
            className={`w-full text-xs px-2 py-1 rounded-md border outline-none font-mono ${t(
              "bg-slate-800 border-slate-700 text-amber-300 placeholder:text-slate-600 focus:border-slate-500",
              "bg-white border-slate-300 text-amber-700 placeholder:text-slate-400 focus:border-slate-400",
            )}`}
          />
          <p className={`text-[11px] ${t("text-slate-600", "text-slate-400")}`}>
            e.g. score &gt; 80 and budget &gt; 0
          </p>
        </div>
      </Section>
      <Section label="Timeout">
        <div className="flex items-center gap-2">
          <input
            value={timeoutPlace}
            onChange={(e) => setTimeoutPlace(e.target.value)}
            onBlur={commitTimeout}
            placeholder="place"
            className={`flex-1 text-xs px-2 py-1 rounded-md border outline-none ${t(
              "bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500",
              "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-slate-400",
            )}`}
          />
          <input
            type="number"
            min={0}
            value={timeoutMs || ""}
            onChange={(e) => setTimeoutMs(parseInt(e.target.value) || 0)}
            onBlur={commitTimeout}
            placeholder="ms"
            className={`w-20 text-xs px-2 py-1 rounded-md border outline-none ${t(
              "bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500",
              "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-slate-400",
            )}`}
          />
        </div>
      </Section>
      {transition.type !== "automatic" && (
        <Section label="Config">
          <ConfigSection
            key={transition.type}
            type={transition.type ?? "automatic"}
            config={(transition.config as Record<string, unknown>) ?? {}}
            onCommit={(config) => onSetConfig(Object.keys(config).length > 0 ? config : undefined)}
          />
        </Section>
      )}
      <button
        onClick={onRemove}
        className={`text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${t(
          "border-red-800 text-red-400 hover:bg-red-950",
          "border-red-200 text-red-600 hover:bg-red-50",
        )}`}
      >
        Delete transition
      </button>
    </div>
  );
}

type TransitionModalProps = {
  open: boolean;
  transition: SerializedDefinition["transitions"][number];
  definition: SerializedDefinition;
  onClose: () => void;
  onRemove: () => void;
  onSetGuard: (guard: string | null) => void;
  onSetTimeout: (timeout: { place: string; ms: number } | undefined) => void;
  onSetType: (type: string) => void;
  onSetConfig: (config: Record<string, unknown> | undefined) => void;
  onRename: (newName: string) => void;
  onAddInput: (place: string) => void;
  onRemoveInput: (place: string) => void;
  onAddOutput: (place: string) => void;
  onRemoveOutput: (place: string) => void;
};

export function TransitionModal({
  open,
  transition,
  definition,
  onClose,
  onRemove,
  onSetGuard,
  onSetTimeout,
  onSetType,
  onSetConfig,
  onRename,
  onAddInput,
  onRemoveInput,
  onAddOutput,
  onRemoveOutput,
}: TransitionModalProps) {
  const { t } = useTheme();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative rounded-lg border shadow-xl p-5 w-96 max-h-[80%] overflow-y-auto ${t(
          "bg-slate-900 border-slate-700",
          "bg-white border-slate-200",
        )}`}
      >
        <button
          onClick={onClose}
          className={`absolute top-3 right-3 text-sm leading-none px-1.5 py-0.5 rounded transition-colors cursor-pointer ${t(
            "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
            "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
          )}`}
        >
          &times;
        </button>
        <TransitionProperties
          key={transition.name}
          transition={transition}
          definition={definition}
          onRemove={() => { onRemove(); onClose(); }}
          onSetGuard={onSetGuard}
          onSetTimeout={onSetTimeout}
          onSetType={onSetType}
          onSetConfig={onSetConfig}
          onRename={onRename}
          onAddInput={onAddInput}
          onRemoveInput={onRemoveInput}
          onAddOutput={onAddOutput}
          onRemoveOutput={onRemoveOutput}
        />
      </div>
    </div>
  );
}

export function PropertyPanel({
  definition,
  selectedId,
  onRemovePlace,
  onSetTokens,
  onToggleTerminal,
  onRenamePlace,
}: Pick<Props, "definition" | "selectedId" | "onRemovePlace" | "onSetTokens" | "onToggleTerminal" | "onRenamePlace">) {
  const { t } = useTheme();

  const isTransition = selectedId?.startsWith("t:");
  const isPlace = selectedId && !isTransition;

  return (
    <div className="p-4 flex flex-col gap-4">
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${t("text-slate-400", "text-slate-500")}`}>
        Properties
      </h2>
      {(!selectedId || isTransition) && (
        <p className={`text-xs ${t("text-slate-600", "text-slate-400")}`}>
          Select a place to edit its properties.
        </p>
      )}
      {isPlace && (
        <PlaceProperties
          key={selectedId}
          place={selectedId}
          definition={definition}
          onRemove={() => onRemovePlace(selectedId)}
          onSetTokens={(count) => onSetTokens(selectedId, count)}
          onToggleTerminal={() => onToggleTerminal(selectedId)}
          onRename={(newName) => onRenamePlace(selectedId, newName)}
        />
      )}
    </div>
  );
}
