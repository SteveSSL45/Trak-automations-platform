import { Circle, type LucideIcon } from "lucide-react";

export type ConnectionStatus = "connected" | "needs_reauth" | "broken" | "not_connected";

interface Props {
  name: string;
  description: string;
  Icon: LucideIcon;
  status: ConnectionStatus;
  scopeNote?: string;
  onAction?: () => void;
  /** Override the action button label. If omitted, defaults based on status. */
  actionLabel?: string;
  /** Trailing hint after the button. Defaults to a "wire up later" placeholder. */
  actionHint?: string;
}

const STATUS_META: Record<ConnectionStatus, { label: string; color: string; ring: string }> = {
  connected:     { label: "Connected",     color: "text-emerald-400",  ring: "ring-emerald-500/30" },
  needs_reauth:  { label: "Needs reauth",  color: "text-amber-400",    ring: "ring-amber-500/30"   },
  broken:        { label: "Broken",        color: "text-rose-400",     ring: "ring-rose-500/30"    },
  not_connected: { label: "Not connected", color: "text-slate-500",    ring: "ring-slate-700"      },
};

export function ConnectionCard({
  name,
  description,
  Icon,
  status,
  scopeNote,
  onAction,
  actionLabel,
  actionHint,
}: Props) {
  const meta = STATUS_META[status];
  const defaultLabel =
    status === "connected"
      ? "Reconnect"
      : status === "needs_reauth"
        ? "Reauthorize"
        : status === "broken"
          ? "Reconnect"
          : "Connect";
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900/40 p-5 ring-1 ${meta.ring}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">{name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            {scopeNote && (
              <p className="mt-1.5 text-xs text-slate-600">{scopeNote}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Circle className={`h-2 w-2 fill-current ${meta.color}`} />
          <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onAction}
          disabled={!onAction}
          className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel ?? defaultLabel}
        </button>
        {actionHint && <span className="text-xs text-slate-600">{actionHint}</span>}
      </div>
    </div>
  );
}
