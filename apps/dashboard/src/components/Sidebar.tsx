import { LayoutGrid, Plus, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";

interface Props {
  onOpenOverview: () => void;
  onOpenAddClient: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ onOpenOverview, onOpenAddClient, onOpenSettings }: Props) {
  const { pathname } = useLocation();
  const onOverview = pathname === "/";
  const onSettings = pathname === "/settings";

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      {/* Brand mark */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-sky-500" />
        <span className="text-base font-semibold tracking-tight text-white">
          Trak<span className="text-cyan-400">.</span>
        </span>
      </div>

      {/* Primary nav */}
      <nav className="px-3 pb-2 pt-2">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Workspace
        </p>
        <NavRow
          Icon={LayoutGrid}
          label="All clients"
          active={onOverview}
          onClick={onOpenOverview}
        />
      </nav>

      {/* Actions */}
      <div className="px-3 pb-2 pt-4">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Actions
        </p>
        <NavRow Icon={Plus} label="Add client" onClick={onOpenAddClient} accent />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer: Settings + operator */}
      <div className="border-t border-slate-800 px-3 py-3">
        <NavRow
          Icon={Settings}
          label="Settings"
          active={onSettings}
          onClick={onOpenSettings}
        />
        <div className="mt-2 px-3 py-2">
          <p className="text-xs text-slate-500">Operator</p>
          <p className="truncate text-sm text-slate-300">Steve</p>
        </div>
      </div>
    </aside>
  );
}

function NavRow({
  Icon,
  label,
  onClick,
  active,
  accent,
}: {
  Icon: typeof LayoutGrid;
  label: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
}) {
  const baseClass =
    "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors";
  let cls: string;
  if (active) {
    cls = baseClass + " bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/20";
  } else if (accent) {
    cls =
      baseClass +
      " border border-dashed border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800/40 hover:text-white";
  } else {
    cls = baseClass + " text-slate-300 hover:bg-slate-800/60 hover:text-white";
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon
        size={16}
        className={active ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
