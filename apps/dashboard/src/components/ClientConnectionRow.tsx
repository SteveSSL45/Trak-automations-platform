import { useEffect, useState } from "react";
import { Search, BarChart3 } from "lucide-react";
import type { Client } from "../lib/clients";
import { ConnectionCard, type ConnectionStatus } from "./ConnectionCard";
import {
  type GoogleInstalledClient,
  type Provider,
  oauthConnect,
  oauthProbe,
  recordKey,
} from "../lib/oauth";
import { getToken } from "../state/stronghold-session";

interface Props {
  client: Client;
  oauthClient: GoogleInstalledClient | null;
  oauthClientError: string | null;
}

interface CardState {
  status: ConnectionStatus;
  description: string;
  busy: boolean;
}

const PROVIDERS: { key: Provider; name: string; Icon: typeof Search; description: string }[] = [
  {
    key: "gsc",
    name: "Google Search Console",
    Icon: Search,
    description: "Daily query/page/position pulls",
  },
  {
    key: "ga4",
    name: "Google Analytics 4",
    Icon: BarChart3,
    description: "Conversions + landing-page engagement",
  },
];

export function ClientConnectionRow({ client, oauthClient, oauthClientError }: Props) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">{client.industry}</p>
          <h3 className="text-sm font-semibold text-white">{client.name}</h3>
        </div>
        <p className="text-xs text-slate-600">{client.domain}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.key}
            client={client}
            provider={p.key}
            providerName={p.name}
            providerDescription={p.description}
            ProviderIcon={p.Icon}
            oauthClient={oauthClient}
            oauthClientError={oauthClientError}
          />
        ))}
      </div>
    </div>
  );
}

interface ProviderCardProps {
  client: Client;
  provider: Provider;
  providerName: string;
  providerDescription: string;
  ProviderIcon: typeof Search;
  oauthClient: GoogleInstalledClient | null;
  oauthClientError: string | null;
}

function ProviderCard({
  client,
  provider,
  providerName,
  providerDescription,
  ProviderIcon,
  oauthClient,
  oauthClientError,
}: ProviderCardProps) {
  const [state, setState] = useState<CardState>({
    status: "not_connected",
    description: providerDescription,
    busy: false,
  });

  // Probe stored token on mount + whenever oauthClient becomes available.
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!oauthClient) return;
      try {
        const blob = await getToken(recordKey(client.id, provider));
        if (!blob) {
          if (!cancelled)
            setState({ status: "not_connected", description: providerDescription, busy: false });
          return;
        }
        const result = await oauthProbe(client.id, provider, blob, oauthClient);
        if (cancelled) return;
        if (result.kind === "connected") {
          setState({
            status: "connected",
            description: `Connected as ${result.email}`,
            busy: false,
          });
        } else if (result.kind === "needs_reauth") {
          setState({ status: "needs_reauth", description: result.reason, busy: false });
        } else {
          setState({ status: "broken", description: result.reason, busy: false });
        }
      } catch (err) {
        if (!cancelled)
          setState({
            status: "broken",
            description: err instanceof Error ? err.message : String(err),
            busy: false,
          });
      }
    }
    probe();
    return () => {
      cancelled = true;
    };
  }, [client.id, provider, providerDescription, oauthClient]);

  async function handleConnect() {
    if (!oauthClient) return;
    setState((s) => ({ ...s, busy: true, description: "Opening browser…" }));
    try {
      const result = await oauthConnect(client.id, provider, oauthClient);
      setState({
        status: "connected",
        description: `Connected as ${result.email}`,
        busy: false,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        description: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  const disabled = !oauthClient || state.busy;
  const overrideLabel = state.busy ? "Working…" : undefined;

  return (
    <ConnectionCard
      name={providerName}
      description={
        oauthClient ? state.description : oauthClientError ?? "Operator OAuth credentials missing"
      }
      Icon={ProviderIcon}
      status={state.status}
      onAction={disabled ? undefined : handleConnect}
      actionLabel={overrideLabel}
      scopeNote={`record: ${recordKey(client.id, provider)}`}
    />
  );
}
