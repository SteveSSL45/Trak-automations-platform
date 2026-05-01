import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { CLIENTS, getClientById } from "../lib/clients";

interface Props {
  activeClientId: string | null;
  onSelectClient: (id: string) => void;
}

export function TopBar({ activeClientId, onSelectClient }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeClient = activeClientId ? getClientById(activeClientId) : undefined;

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6">
      {/* Left: client picker */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white hover:border-cyan-500 hover:bg-slate-800 transition-colors"
        >
          <span className="text-slate-400">Client</span>
          <span className="text-slate-700">·</span>
          <span className="font-medium">
            {activeClient ? activeClient.name : "Select…"}
          </span>
          <ChevronDown size={14} className="text-slate-500" />
        </button>

        {pickerOpen && (
          <div className="absolute left-6 top-12 z-30 w-72 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            <ul className="max-h-80 overflow-y-auto py-1">
              {CLIENTS.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectClient(c.id);
                      setPickerOpen(false);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    <span className="font-medium text-white">{c.name}</span>
                    <span className="text-xs text-slate-500">{c.domain}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Right: status pill */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
          <Sparkles size={12} className="text-cyan-400" />
          <span>Phase 1 · UI shell</span>
        </div>
      </div>
    </header>
  );
}
