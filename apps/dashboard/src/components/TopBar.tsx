import { ChevronLeft, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

interface Props {
  /** Optional contextual title shown in the center (e.g. active client name on detail page). */
  title?: string;
}

export function TopBar({ title }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onDetail = pathname.startsWith("/clients/");

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6">
      {/* Left: back nav (only on detail) or empty */}
      <div className="flex items-center gap-3">
        {onDetail && (
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/50 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500 hover:bg-slate-800 hover:text-white"
          >
            <ChevronLeft size={14} />
            All clients
          </button>
        )}
        {title && <span className="text-sm font-medium text-white">{title}</span>}
      </div>

      {/* Right: status pill */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
          <Sparkles size={12} className="text-cyan-400" />
          <span>Trak Automations</span>
        </div>
      </div>
    </header>
  );
}
