import { fetch } from "@tauri-apps/plugin-http";

const OLLAMA_BASE = "http://localhost:11434";
const REQUIRED_MODEL = "llama3.3:70b";

export type OllamaStatus =
  | { kind: "connected"; version: string; model: string }
  | { kind: "model_missing"; version: string; available: string[] }
  | { kind: "unreachable"; reason: string };

interface VersionResponse {
  version: string;
}

interface TagsResponse {
  models: { name: string }[];
}

/**
 * Probe the local Ollama daemon.
 * Returns one of three states:
 *   connected     — daemon up AND llama3.3:70b is pulled
 *   model_missing — daemon up but the required model isn't local
 *   unreachable   — couldn't reach :11434 (or non-2xx response)
 */
export async function getOllamaStatus(): Promise<OllamaStatus> {
  try {
    const versionRes = await fetch(`${OLLAMA_BASE}/api/version`, {
      method: "GET",
    });
    if (!versionRes.ok) {
      return { kind: "unreachable", reason: `version HTTP ${versionRes.status}` };
    }
    const { version } = (await versionRes.json()) as VersionResponse;

    const tagsRes = await fetch(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
    if (!tagsRes.ok) {
      return { kind: "unreachable", reason: `tags HTTP ${tagsRes.status}` };
    }
    const tags = (await tagsRes.json()) as TagsResponse;
    const available = tags.models.map((m) => m.name);

    if (available.includes(REQUIRED_MODEL)) {
      return { kind: "connected", version, model: REQUIRED_MODEL };
    }
    return { kind: "model_missing", version, available };
  } catch (err) {
    return {
      kind: "unreachable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
