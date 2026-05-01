import { Search, BarChart3, Brain, Cpu } from "lucide-react";
import { ConnectionCard } from "../components/ConnectionCard";

export function Settings() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Operator-level configuration. Per-client settings live on each client&rsquo;s detail page.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Operator-level connections
          </h2>
          <p className="text-xs text-slate-600">Shared across all clients</p>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          API keys you own (not the client&rsquo;s). One key serves every client unless overridden per-client.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            name="Anthropic API"
            description="Claude Sonnet 4.6 fallback for ambiguous cases"
            Icon={Brain}
            status="not_connected"
            scopeNote="Master key, shared across clients."
          />
          <ConnectionCard
            name="Ollama (local)"
            description="Llama 3.3 70B + future LoRA adapters"
            Icon={Cpu}
            status="not_connected"
            scopeNote="Auto-detected on http://localhost:11434"
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Per-client connections
          </h2>
          <p className="text-xs text-slate-600">Authorized per client</p>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          OAuth flows that authorize TRAK to read each client&rsquo;s Google services. Each client connects their own.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            name="Google Search Console"
            description="Daily query/page/position pulls"
            Icon={Search}
            status="not_connected"
            scopeNote="Read-only · per-client OAuth"
          />
          <ConnectionCard
            name="Google Analytics 4"
            description="Conversions + landing-page engagement"
            Icon={BarChart3}
            status="not_connected"
            scopeNote="Read-only · per-client OAuth"
          />
        </div>

        <p className="mt-4 text-xs text-slate-600">
          Add Ahrefs, DataForSEO, PageSpeed Insights in Phase 3 v1.5.
        </p>
      </section>
    </div>
  );
}
