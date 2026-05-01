import { Trees, Hammer, Cpu, Settings, type LucideIcon } from "lucide-react";
import { CLIENTS } from "../lib/clients";

const ICONS: Record<string, LucideIcon> = {
  Trees,
  Hammer,
  Cpu,
};

interface Props {
  activeClientId: string | null;
  onSelectClient: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ activeClientId, onSelectClient, onOpenSettings }: Props) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      {/* Brand mark */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-sky-500" />
        <span className="text-base font-semibold tracking-tight text-white">
          Trak<span className="text-cyan-400">.</span>
        </span>
      </div>

      {/* Section: Clients */}
      <div className="px-3 pb-2 pt-2">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Clients
        </p>
        <ul className="space-y-1">
          {CLIENTS.map((client) => {
            const Icon = ICONS[client.iconName] ?? Cpu;
            const active = client.id === activeClientId;
            return (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => onSelectClient(client.id)}
                  className={
                    "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors " +
                    (active
                      ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/20"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white")
                  }
                >
                  <Icon
                    size={16}
                    className={active ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}
                  />
                  <span className="truncate">{client.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer: Settings + operator */}
      <div className="border-t border-slate-800 px-3 py-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
        <div className="mt-2 px-3 py-2">
          <p className="text-xs text-slate-500">Operator</p>
          <p className="truncate text-sm text-slate-300">Steve</p>
        </div>
      </div>
    </aside>
  );
}
