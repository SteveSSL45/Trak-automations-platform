import { Inbox } from "lucide-react";
import { getClientById } from "../lib/clients";

interface Props {
  activeClientId: string | null;
}

export function Dashboard({ activeClientId }: Props) {
  if (!activeClientId) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Inbox className="mx-auto mb-4 h-12 w-12 text-slate-700" />
          <h2 className="text-lg font-semibold text-white">Select a client</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick a client from the sidebar to see today&rsquo;s action plan, deliverables, and ingestion status.
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
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

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-12 text-center">
        <p className="text-sm text-slate-500">
          Phase 1 placeholder — daily action plan UI lands in Phase 5.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Phase 2 wires Ollama. Phase 3 connects GSC + GA4. Phase 4 ingests data. Phase 5 produces real plans.
        </p>
      </div>
    </div>
  );
}
