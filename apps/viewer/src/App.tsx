import { useState } from "react";
import { nets } from "./nets";
import { NetSelector } from "./components/controls/NetSelector";
import { Viewer } from "./Viewer";
import { ThemeProvider, useTheme } from "./theme";

function AppInner() {
  const [selectedName, setSelectedName] = useState(nets[0]!.name);
  const viewerNet = nets.find((n) => n.name === selectedName) ?? nets[0]!;
  const { isDark, toggle, t } = useTheme();

  return (
    <div className={`flex flex-col h-full ${t("bg-slate-950", "bg-slate-50")}`}>
      <header
        className={`flex items-center gap-4 px-4 py-2 border-b ${t(
          "bg-slate-950 border-slate-800",
          "bg-white border-slate-200",
        )}`}
      >
        <h1 className={`text-sm font-bold tracking-tight ${t("text-white", "text-slate-900")}`}>
          PetriFlow
        </h1>
        <div className={`w-px h-4 ${t("bg-slate-700", "bg-slate-300")}`} />
        <NetSelector
          nets={nets}
          selected={selectedName}
          onSelect={setSelectedName}
        />
        <div className="flex-1" />
        <button
          onClick={toggle}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${t(
            "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-300",
            "bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-700",
          )}`}
        >
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          {isDark ? "Light" : "Dark"}
        </button>
      </header>
      <Viewer key={viewerNet.name} viewerNet={viewerNet} />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
