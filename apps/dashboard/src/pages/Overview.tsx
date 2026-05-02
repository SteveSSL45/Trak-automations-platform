import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building,
  Cpu,
  Hammer,
  Trees,
  Plus,
  ArrowRight,
  Activity,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { type Client } from "../lib/clients";
import { useClientsStore } from "../state/clients-store";
import {
  type Dossier,
  type DecisionFile,
  readDossier,
  readDecisions,
  todayIsoYesterday,
} from "../lib/dossier";

const ICON_MAP: Record<string, LucideIcon> = {
  Trees,
  Hammer,
  Cpu,
  Building,
};

interface Props {
  onOpenAddClient: () => void;
}

export function Overview({ onOpenAddClient }: Props) {
  const clients = useClientsStore((s) => s.clients);
  const loaded = useClientsStore((s) => s.loaded);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-sm text-slate-500">All clients</p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Overview
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenAddClient}
          className="flex items-center gap-2 rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400"
        >
          <Plus size={14} />
          Add client
        </button>
      </header>

      {!loaded ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : clients.length === 0 ? (
        <EmptyState onOpenAddClient={onOpenAddClient} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {clients.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onOpenAddClient }: { onOpenAddClient: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-12 text-center">
      <Building className="mx-auto mb-4 h-10 w-10 text-slate-700" />
      <h3 className="text-sm font-semibold text-white">No clients yet</h3>
      <p className="mt-1 text-xs text-slate-500">
        Add your first client to start ingesting GSC + GA4 data.
      </p>
      <button
        type="button"
        onClick={onOpenAddClient}
        className="mt-4 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400"
      >
        Add client
      </button>
    </div>
  );
}

interface CardSnapshot {
  loading: boolean;
  weekClicks: number | null;
  weekSessions: number | null;
  decided: number;
  total: number;
  hasGscData: boolean;
  hasGa4Data: boolean;
}

function ClientCard({ client }: { client: Client }) {
  const navigate = useNavigate();
  const Icon = ICON_MAP[client.icon_name] ?? Building;
  const date = useMemo(todayIsoYesterday, []);
  const [snapshot, setSnapshot] = useState<CardSnapshot>({
    loading: true,
    weekClicks: null,
    weekSessions: null,
    decided: 0,
    total: 0,
    hasGscData: false,
    hasGa4Data: false,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([readDossier(client.id, date), readDecisions(client.id, date)]).then(
      ([d, dec]: [Dossier | null, DecisionFile | null]) => {
        if (cancelled) return;
        const weekClicks = d?.gsc_weekly?.totals_7d?.clicks ?? null;
        const weekSessions = d?.ga4_daily?.totals?.sessions ?? null;
        const decided = dec?.decisions.length ?? 0;
        setSnapshot({
          loading: false,
          weekClicks,
          weekSessions,
          decided,
          total: 0, // we don't know total without loading the action plan; leave 0
          hasGscData: !!d?.gsc_daily,
          hasGa4Data: !!d?.ga4_daily,
        });
      }
    ).catch(() => {
      if (!cancelled) setSnapshot((s) => ({ ...s, loading: false }));
    });
    return () => {
      cancelled = true;
    };
  }, [client.id, date]);

  const gscPill = client.gsc_site ? "configured" : "needs_setup";
  const ga4Pill = client.ga4_property_id ? "configured" : "needs_setup";

  return (
    <button
      type="button"
      onClick={() => navigate(`/clients/${client.id}`)}
      className="group flex flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-left transition-colors hover:border-cyan-500/40 hover:bg-slate-900/70"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-800 text-slate-400 group-hover:text-cyan-300">
            <Icon size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{client.name}</h3>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Globe size={10} />
              {client.domain}
            </p>
          </div>
        </div>
        <ArrowRight size={14} className="mt-1 text-slate-700 transition-colors group-hover:text-cyan-400" />
      </div>

      <p className="mb-4 line-clamp-2 text-xs text-slate-500">{client.industry}</p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Pill label="GSC" status={gscPill} />
        <Pill label="GA4" status={ga4Pill} />
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-slate-800 pt-3">
        <Stat label="Clicks 7d" value={formatStat(snapshot.weekClicks, snapshot.loading)} />
        <Stat label="Sessions" value={formatStat(snapshot.weekSessions, snapshot.loading)} />
        <Stat label="Decided" value={snapshot.loading ? "…" : `${snapshot.decided}`} />
      </div>
    </button>
  );
}

function Pill({ label, status }: { label: string; status: "configured" | "needs_setup" }) {
  const cls =
    status === "configured"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
      : "border-slate-700 bg-slate-800/60 text-slate-500";
  return (
    <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      <Activity size={9} />
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-600">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function formatStat(value: number | null, loading: boolean): string {
  if (loading) return "…";
  if (value === null) return "—";
  return value.toLocaleString();
}
