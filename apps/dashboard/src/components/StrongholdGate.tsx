import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { isUnlocked, unlockStronghold } from "../state/stronghold-session";

interface Props {
  children: React.ReactNode;
}

/**
 * Blocks app render until Stronghold snapshot is unlocked.
 * Phase 3 keeps it minimal — single password input + Unlock button. Phase 7+
 * can add: "Remember password" via macOS Keychain, password strength meter,
 * forgot-password recovery (which is impossible by design — you'd lose tokens).
 */
export function StrongholdGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setUnlocked(isUnlocked());
  }, []);

  if (unlocked) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      await unlockStronghold(password);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <Lock size={18} className="text-cyan-400" />
          <h1 className="text-base font-semibold text-white">Unlock Trak Automations</h1>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Stronghold protects your client OAuth tokens. First run creates a new vault — pick a password
          you&rsquo;ll remember (it can&rsquo;t be recovered).
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
          autoFocus
          disabled={submitting}
          className="mb-3 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
        />
        {error && (
          <p className="mb-3 text-xs text-rose-400">
            {error.includes("invalid") || error.includes("wrong") ? "Wrong password." : error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
