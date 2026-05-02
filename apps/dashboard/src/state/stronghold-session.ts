import { Client, Store, Stronghold } from "@tauri-apps/plugin-stronghold";
import { appDataDir, join } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

const CLIENT_NAME = "trak-oauth-tokens";
const SNAPSHOT_FILE = "stronghold.snapshot";

let stronghold: Stronghold | null = null;
let client: Client | null = null;
let store: Store | null = null;
let unlistenStoreEvent: (() => void) | null = null;

/**
 * Unlock (or create) the Stronghold snapshot at app_data_dir/stronghold.snapshot.
 * Wires the `oauth:store-token` event listener so Rust-side token writes get
 * persisted into the snapshot.
 */
export async function unlockStronghold(password: string): Promise<void> {
  if (stronghold) return;

  const dir = await appDataDir();
  const path = await join(dir, SNAPSHOT_FILE);

  stronghold = await Stronghold.load(path, password);
  client = await stronghold
    .loadClient(CLIENT_NAME)
    .catch(() => stronghold!.createClient(CLIENT_NAME));
  store = client.getStore();

  unlistenStoreEvent = await listen<{ key: string; blob: string }>(
    "oauth:store-token",
    async (event) => {
      const { key, blob } = event.payload;
      await setToken(key, blob);

      // Phase 4 token bridge: also write a Python-readable JSON for the
      // ingestion workers. Key format is "<client-id>::<provider>".
      const sep = key.indexOf("::");
      if (sep > 0) {
        const targetClientId = key.slice(0, sep);
        const provider = key.slice(sep + 2);
        try {
          await invoke("write_credentials_for_python", {
            targetClientId,
            provider,
            storedBlob: blob,
          });
        } catch (err) {
          console.warn("write_credentials_for_python failed:", err);
          // Non-fatal — Stronghold persist already succeeded.
        }
      }
    }
  );
}

export function isUnlocked(): boolean {
  return store !== null;
}

export async function getToken(key: string): Promise<string | null> {
  if (!store) throw new Error("Stronghold locked");
  const data = await store.get(key);
  if (!data) return null;
  return new TextDecoder().decode(data);
}

export async function setToken(key: string, blob: string): Promise<void> {
  if (!store || !stronghold) throw new Error("Stronghold locked");
  const bytes = Array.from(new TextEncoder().encode(blob));
  await store.insert(key, bytes);
  await stronghold.save();
}

export async function removeToken(key: string): Promise<void> {
  if (!store || !stronghold) throw new Error("Stronghold locked");
  await store.remove(key);
  await stronghold.save();
}

export async function lockStronghold(): Promise<void> {
  if (unlistenStoreEvent) {
    unlistenStoreEvent();
    unlistenStoreEvent = null;
  }
  stronghold = null;
  client = null;
  store = null;
}
