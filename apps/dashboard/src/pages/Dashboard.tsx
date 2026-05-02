import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  TrendingDown,
  TrendingUp,
  Target,
  Activity,
  CheckCircle2,
  XCircle,
  Pencil,
  Save,
  Sparkles,
} from "lucide-react";
import { getClientById } from "../lib/clients";
import {
  type ActionPlan,
  type ActionPlanDeliverable,
  type Decision,
  type DecisionAction,
  type Dossier,
  readActionPlan,
  readDecisions,
  readDossier,
  todayIsoYesterday,
  writeDecisions,
} from "../lib/dossier";
import { buildMockActionPlan } from "../lib/mock-action-plan";

interface Props {
  activeClientId: string | null;
}

interface RowState {
  action: DecisionAction | null;
  edited: string;
  reason: string;
  editing: boolean;
}

export function Dashboard({ activeClientId }: Props) {
  const [date, setDate] = useState(todayIsoYesterday);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClientId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveResult(null);

    Promise.all([
      readDossier(activeClientId, date),
      readActionPlan(activeClientId, date),
      readDecisions(activeClientId, date),
    ])
      .then(([d, plan, decisions]) => {
        if (cancelled) return;
        setDossier(d);
        const resolvedPlan = plan ?? buildMockActionPlan(activeClientId, date);
        setActionPlan(resolvedPlan);

        // Seed rows from saved decisions if any
        const seed: Record<string, RowState> = {};
        for (const deliv of resolvedPlan.deliverables) {
          const prior = decisions?.decisions.find((dec) => dec.deliverable_id === deliv.id);
          seed[deliv.id] = {
            action: prior?.action ?? null,
            edited: prior?.edited_to ?? deliv.proposed,
            reason: prior?.reason ?? "",
            editing: false,
          };
        }
        setRows(seed);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeClientId, date]);

  if (!activeClientId) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Inbox className="mx-auto mb-4 h-12 w-12 text-slate-700" />
          <h2 className="text-lg font-semibold text-white">Select a client</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick a client from the sidebar to see today&rsquo;s dossier, swarm-proposed deliverables, and approval queue.
          </p>
        </div>
      </div>
    );
  }

  const client = getClientById(activeClientId);
  if (!client) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-sm text-slate-500">Unknown client: {activeClientId}</p>
      </div>
    );
  }

  const decisionCount = Object.values(rows).filter((r) => r.action !== null).length;
  const totalCount = actionPlan?.deliverables.length ?? 0;
  const isMock = actionPlan?.source === "mock";

  async function handleSave() {
    if (!activeClientId || !actionPlan) return;
    const decisions: Decision[] = actionPlan.deliverables
      .filter((d) => rows[d.id]?.action !== null && rows[d.id]?.action !== undefined)
      .map((d) => {
        const r = rows[d.id];
        return {
          deliverable_id: d.id,
          action: r.action as DecisionAction,
          edited_to: r.action === "edit" ? r.edited : null,
          reason: r.action === "reject" && r.reason.trim() ? r.reason.trim() : null,
        };
      });
    try {
      const path = await writeDecisions(activeClientId, date, decisions);
      setSaveResult(`Saved ${decisions.length} decision${decisions.length === 1 ? "" : "s"} → ${path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-sm text-slate-500">{client.industry}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">{client.name}</h1>
          <a
            href={`https://${client.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-cyan-400 hover:underline"
          >
            {client.domain} ↗
          </a>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label className="text-xs uppercase tracking-wider text-slate-500">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {loading && <p className="mb-6 text-sm text-slate-500">Loading…</p>}

      {/* Dossier */}
      <DossierSection dossier={dossier} />

      {/* Action plan */}
      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Proposed actions
          </h2>
          {actionPlan && (
            <p className="text-xs text-slate-600">
              {decisionCount} / {totalCount} decided
              {isMock && " · using mock data (swarm not running yet)"}
            </p>
          )}
        </div>
        {isMock && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-300">
            <Sparkles size={14} className="mt-0.5 shrink-0" />
            <span>
              Showing mock deliverables. When the LoRA adapters are trained, this section will source from{" "}
              <code className="text-cyan-200">clients/{activeClientId}/swarm_runs/{date}/08_executor.json</code>.
            </span>
          </div>
        )}
        {actionPlan?.deliverables.map((d) => (
          <DeliverableRow
            key={d.id}
            deliverable={d}
            state={rows[d.id]}
            onChange={(next) => setRows((s) => ({ ...s, [d.id]: next }))}
          />
        ))}
      </section>

      {actionPlan && actionPlan.deliverables.length > 0 && (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-sm">
            <p className="text-white">
              {decisionCount === 0
                ? "No decisions yet"
                : `${decisionCount} decision${decisionCount === 1 ? "" : "s"} pending save`}
            </p>
            {saveResult && <p className="mt-1 text-xs text-emerald-400">{saveResult}</p>}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={decisionCount === 0}
            className="flex items-center gap-2 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            Save decisions
          </button>
        </div>
      )}
    </div>
  );
}

function DossierSection({ dossier }: { dossier: Dossier | null }) {
  if (!dossier) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center">
        <p className="text-sm text-slate-400">No dossier for this date.</p>
        <p className="mt-1 text-xs text-slate-600">
          Run <code className="text-slate-400">python -m ingest.dossier_builder &lt;client&gt; --date</code> to generate one.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Today&rsquo;s data
        </h2>
        <p className="text-xs text-slate-600">
          Schema {dossier.schema_version} · GSC fetched{" "}
          {dossier.data_freshness.gsc_last_fetched ?? "—"} · GA4 fetched{" "}
          {dossier.data_freshness.ga4_last_fetched ?? "—"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DossierCard
          title="GSC daily — top queries"
          Icon={Activity}
          empty={!dossier.gsc_daily?.top_queries.length}
          emptyHint="No GSC query data for this date."
        >
          {dossier.gsc_daily?.top_queries.slice(0, 8).map((q) => (
            <div key={q.query} className="flex items-baseline justify-between gap-3 py-1">
              <span className="truncate text-xs text-slate-300">{q.query}</span>
              <span className="shrink-0 font-mono text-[11px] text-slate-500">
                {q.clicks}c · {q.impressions}i · pos {q.position.toFixed(1)}
              </span>
            </div>
          ))}
        </DossierCard>

        <DossierCard
          title="GSC weekly — gainers"
          Icon={TrendingUp}
          empty={!dossier.gsc_weekly?.gainers.length}
          emptyHint="No position gainers in the last 7 days."
        >
          {dossier.gsc_weekly?.gainers.slice(0, 8).map((g) => (
            <div key={g.query} className="flex items-baseline justify-between gap-3 py-1">
              <span className="truncate text-xs text-slate-300">{g.query}</span>
              <span className="shrink-0 font-mono text-[11px] text-emerald-400">
                {g.position_delta.toFixed(1)} ({g.previous_position.toFixed(1)} → {g.current_position.toFixed(1)})
              </span>
            </div>
          ))}
        </DossierCard>

        <DossierCard
          title="GSC weekly — losers"
          Icon={TrendingDown}
          empty={!dossier.gsc_weekly?.losers.length}
          emptyHint="No position losers in the last 7 days."
        >
          {dossier.gsc_weekly?.losers.slice(0, 8).map((l) => (
            <div key={l.query} className="flex items-baseline justify-between gap-3 py-1">
              <span className="truncate text-xs text-slate-300">{l.query}</span>
              <span className="shrink-0 font-mono text-[11px] text-rose-400">
                +{l.position_delta.toFixed(1)} ({l.previous_position.toFixed(1)} → {l.current_position.toFixed(1)})
              </span>
            </div>
          ))}
        </DossierCard>

        <DossierCard
          title="Striking distance (pos 4–15)"
          Icon={Target}
          empty={!dossier.gsc_weekly?.striking_distance.length}
          emptyHint="No striking-distance opportunities yet."
        >
          {dossier.gsc_weekly?.striking_distance.slice(0, 8).map((s) => (
            <div key={s.query} className="flex items-baseline justify-between gap-3 py-1">
              <span className="truncate text-xs text-slate-300">{s.query}</span>
              <span className="shrink-0 font-mono text-[11px] text-cyan-300">
                pos {s.current_position.toFixed(1)} · {s.impressions_7d}i/wk
              </span>
            </div>
          ))}
        </DossierCard>
      </div>

      <DossierCard
        title="GA4 daily — top landing pages"
        Icon={Activity}
        empty={!dossier.ga4_daily?.top_landing_pages.length}
        emptyHint="No GA4 sessions recorded for this date."
      >
        {dossier.ga4_daily?.top_landing_pages.slice(0, 10).map((p) => (
          <div key={p.page} className="flex items-baseline justify-between gap-3 py-1">
            <span className="truncate text-xs text-slate-300">{p.page}</span>
            <span className="shrink-0 font-mono text-[11px] text-slate-500">
              {p.sessions}s · {p.users}u
            </span>
          </div>
        ))}
      </DossierCard>
    </section>
  );
}

function DossierCard({
  title,
  Icon,
  empty,
  emptyHint,
  children,
}: {
  title: string;
  Icon: typeof Activity;
  empty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className="text-slate-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      </div>
      {empty ? <p className="text-xs text-slate-600">{emptyHint}</p> : <div>{children}</div>}
    </div>
  );
}

function DeliverableRow({
  deliverable,
  state,
  onChange,
}: {
  deliverable: ActionPlanDeliverable;
  state: RowState | undefined;
  onChange: (next: RowState) => void;
}) {
  const s = useMemo<RowState>(
    () => state ?? { action: null, edited: deliverable.proposed, reason: "", editing: false },
    [state, deliverable.proposed]
  );

  const ringClass =
    s.action === "approve"
      ? "ring-emerald-500/30"
      : s.action === "edit"
        ? "ring-amber-500/30"
        : s.action === "reject"
          ? "ring-rose-500/30"
          : "ring-slate-700";

  return (
    <div
      className={`mb-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 ring-1 ${ringClass}`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {deliverable.kind.replace("_", " ")}
          </span>
          <span className="ml-2 text-xs text-slate-500">{deliverable.target_page}</span>
        </div>
        <span className="text-[10px] text-slate-600">id: {deliverable.id}</span>
      </div>

      {deliverable.current && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Current</p>
          <p className="text-xs text-slate-400">{deliverable.current}</p>
        </div>
      )}

      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Proposed</p>
        {s.editing ? (
          <textarea
            value={s.edited}
            onChange={(e) => onChange({ ...s, edited: e.target.value })}
            rows={3}
            className="w-full rounded-md border border-amber-500/40 bg-slate-950 p-2 text-sm text-amber-100 focus:border-amber-400 focus:outline-none"
          />
        ) : (
          <p className="text-sm text-white">{s.action === "edit" ? s.edited : deliverable.proposed}</p>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500">
        <span className="text-slate-600">Why:</span> {deliverable.rationale}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          active={s.action === "approve"}
          onClick={() => onChange({ ...s, action: "approve", editing: false })}
          color="emerald"
          Icon={CheckCircle2}
        >
          Approve
        </ActionButton>
        <ActionButton
          active={s.action === "edit"}
          onClick={() =>
            onChange({
              ...s,
              action: "edit",
              editing: true,
              edited: s.edited || deliverable.proposed,
            })
          }
          color="amber"
          Icon={Pencil}
        >
          {s.editing ? "Editing…" : "Edit"}
        </ActionButton>
        <ActionButton
          active={s.action === "reject"}
          onClick={() => onChange({ ...s, action: "reject", editing: false })}
          color="rose"
          Icon={XCircle}
        >
          Reject
        </ActionButton>
        {s.action === "reject" && (
          <input
            type="text"
            value={s.reason}
            onChange={(e) => onChange({ ...s, reason: e.target.value })}
            placeholder="Reason (optional)"
            className="ml-auto flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        )}
        {s.editing && (
          <button
            type="button"
            onClick={() => onChange({ ...s, editing: false })}
            className="ml-auto rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            Done editing
          </button>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  active,
  onClick,
  color,
  Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: "emerald" | "amber" | "rose";
  Icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  const palette = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  }[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? `border ${palette}`
          : "border border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800")
      }
    >
      <Icon size={12} />
      {children}
    </button>
  );
}
