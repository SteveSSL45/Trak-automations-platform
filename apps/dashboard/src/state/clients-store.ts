import { create } from "zustand";
import { type Client, type ClientCreate, addClient, readClients } from "../lib/clients";

interface ClientsState {
  clients: Client[];
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (client: ClientCreate) => Promise<void>;
}

/**
 * Cached client list. Loaded once at app startup (after Stronghold unlock)
 * and refreshed on add. Components subscribe via useClientsStore() and
 * rerender when the array changes.
 */
export const useClientsStore = create<ClientsState>((set) => ({
  clients: [],
  loaded: false,
  error: null,
  refresh: async () => {
    try {
      const clients = await readClients();
      set({ clients, loaded: true, error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
  add: async (client: ClientCreate) => {
    const clients = await addClient(client);
    set({ clients, error: null });
  },
}));

export function getClientById(clients: Client[], id: string | null | undefined): Client | undefined {
  if (!id) return undefined;
  return clients.find((c) => c.id === id);
}
