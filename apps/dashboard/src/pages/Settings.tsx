import { useEffect, useState } from "react";
import { Brain, Cpu } from "lucide-react";
import { ConnectionCard, type ConnectionStatus } from "../components/ConnectionCard";
import { ClientConnectionRow } from "../components/ClientConnectionRow";
import { useClientsStore } from "../state/clients-store";
import { getOllamaStatus, type OllamaStatus } from "../lib/ollama";
import { readOAuthClient, type GoogleInstalledClient } from "../lib/oauth";

function OllamaCard() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOllamaStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cardStatus: ConnectionStatus =
    status === null
      ? "not_connected"
      : status.kind === "connected"
        ? "connected"
        : status.kind === "model_missing"
          ? "needs_reauth"
          : "not_connected";

  const description =
    status === null
      ? "Probing http://localhost:11434…"
      : status.kind === "connected"
        ? `Connected · ${status.model} (Ollama ${status.version})`
        : status.kind === "model_missing"
          ? `Ollama ${status.version} reachable, but llama3.3:70b is not pulled`
          : `Not reachable: ${status.reason}`;

  return (
    <ConnectionCard
      name="Ollama (local)"
      description={description}
      Icon={Cpu}
      status={cardStatus}
      scopeNote="Auto-detected on http://localhost:11434"
    />
  );
}

export function Settings() {
  const clients = useClientsStore((s) => s.clients);
  const [oauthClient, setOauthClient] = useState<GoogleInstalledClient | null>(null);
  const [oauthClientError, setOauthClientError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readOAuthClient()
      .then((c) => {
        if (!cancelled) setOauthClient(c);
      })
      .catch((err) => {
        if (!cancelled)
          setOauthClientError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Operator-level configuration. Per-client OAuth grants below.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Operator-level connections
          </h2>
          <p className="text-xs text-slate-600">Shared across all clients</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            name="Anthropic API"
            description="Claude Sonnet 4.6 fallback for ambiguous cases"
            Icon={Brain}
            status="not_connected"
            scopeNote="Master key, shared across clients."
            actionHint="— wired in a follow-up"
          />
          <OllamaCard />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Per-client OAuth grants
          </h2>
          <p className="text-xs text-slate-600">One Google account per client per provider</p>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Each client connects their own Google account so TRAK can read their Search Console
          + Analytics data on their behalf.
        </p>

        {oauthClientError && !oauthClient && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
            <p className="font-medium">Operator OAuth credentials not found.</p>
            <p className="mt-1 text-amber-300/80">
              Place the GCP-downloaded <code className="text-amber-200">client_secret_*.json</code> as{" "}
              <code className="text-amber-200">google_oauth_client.json</code> in the app data dir,
              then restart the dashboard.
            </p>
            <p className="mt-1 font-mono text-[10px] text-amber-300/60">{oauthClientError}</p>
          </div>
        )}

        <div className="space-y-4">
          {clients.map((c) => (
            <ClientConnectionRow
              key={c.id}
              client={c}
              oauthClient={oauthClient}
              oauthClientError={oauthClientError}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
