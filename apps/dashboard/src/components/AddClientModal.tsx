import { useEffect, useState } from "react";
import { Building, Cpu, Hammer, Trees, X } from "lucide-react";
import { type ClientCreate, type ClientIconName, slugifyId } from "../lib/clients";
import { useClientsStore } from "../state/clients-store";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ICON_OPTIONS: { name: ClientIconName; Icon: typeof Building; label: string }[] = [
  { name: "Building", Icon: Building, label: "Building" },
  { name: "Trees", Icon: Trees, label: "Trees" },
  { name: "Hammer", Icon: Hammer, label: "Hammer" },
  { name: "Cpu", Icon: Cpu, label: "Cpu" },
];

export function AddClientModal({ open, onClose }: Props) {
  const add = useClientsStore((s) => s.add);
  const existingClients = useClientsStore((s) => s.clients);

  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [iconName, setIconName] = useState<ClientIconName>("Building");
  const [gscSite, setGscSite] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive id from name unless the operator has typed in the id field
  useEffect(() => {
    if (!idTouched) setId(slugifyId(name));
  }, [name, idTouched]);

  // Reset state when reopened
  useEffect(() => {
    if (open) {
      setName("");
      setId("");
      setIdTouched(false);
      setDomain("");
      setIndustry("");
      setIconName("Building");
      setGscSite("");
      setGa4PropertyId("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const idTaken = existingClients.some((c) => c.id === id);
  const canSubmit = name.trim() && id.trim() && domain.trim() && !idTaken && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const payload: ClientCreate = {
      id: id.trim(),
      name: name.trim(),
      domain: domain.trim(),
      industry: industry.trim() || "—",
      icon_name: iconName,
      gsc_site: gscSite.trim() || null,
      ga4_property_id: ga4PropertyId.trim() || null,
    };
    try {
      await add(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-white"
        >
          <X size={18} />
        </button>

        <h2 className="mb-1 text-lg font-semibold text-white">Add a client</h2>
        <p className="mb-5 text-xs text-slate-500">
          You can leave the GSC + GA4 fields blank now — connect them via Settings → Per-client OAuth grants once the client is added.
        </p>

        <div className="space-y-4">
          <Field label="Client name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Lawn Care"
              autoFocus
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </Field>

          <Field
            label="Client id (slug)"
            hint="Used in file paths. Auto-derived from the name; you can edit before saving."
            required
            errorText={idTaken ? "This id is already in use." : undefined}
          >
            <input
              type="text"
              value={id}
              onChange={(e) => {
                setIdTouched(true);
                setId(e.target.value);
              }}
              placeholder="acme-lawn-care"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </Field>

          <Field label="Primary domain" required>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="acmelawncare.com"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </Field>

          <Field label="Industry / tagline">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Lawn care + landscaping"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </Field>

          <Field label="Icon">
            <div className="flex gap-2">
              {ICON_OPTIONS.map(({ name: opt, Icon, label }) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setIconName(opt)}
                  title={label}
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-md border transition-colors " +
                    (iconName === opt
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200")
                  }
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </Field>

          <details className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-400">
              Optional: data source identifiers
            </summary>
            <div className="mt-3 space-y-3">
              <Field
                label="GSC property"
                hint='e.g. "sc-domain:acmelawncare.com" or "https://acmelawncare.com/"'
              >
                <input
                  type="text"
                  value={gscSite}
                  onChange={(e) => setGscSite(e.target.value)}
                  placeholder="sc-domain:acmelawncare.com"
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </Field>

              <Field
                label="GA4 property ID"
                hint="Numeric, like 123456789. From GA4 Admin → Property Settings."
              >
                <input
                  type="text"
                  value={ga4PropertyId}
                  onChange={(e) => setGa4PropertyId(e.target.value)}
                  placeholder="123456789"
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </Field>
            </div>
          </details>
        </div>

        {error && (
          <p className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add client"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  errorText,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  errorText?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">
        {label}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </label>
      {children}
      {errorText ? (
        <p className="mt-1 text-xs text-rose-400">{errorText}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}
