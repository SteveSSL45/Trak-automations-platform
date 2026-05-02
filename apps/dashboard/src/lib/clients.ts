import { invoke } from "@tauri-apps/api/core";

/** Built-in icon set the operator can pick from when adding a client. */
export type ClientIconName = "Trees" | "Hammer" | "Cpu" | "Building";

export interface Client {
  id: string;
  name: string;
  domain: string;
  industry: string;
  icon_name: ClientIconName | string;
  /** GSC property URL ("sc-domain:..." or "https://.../"). Filled after OAuth grant. */
  gsc_site: string | null;
  /** GA4 property ID (numeric). Filled after operator looks it up in GA4 admin. */
  ga4_property_id: string | null;
  created_at_unix: number;
}

export interface ClientCreate {
  id: string;
  name: string;
  domain: string;
  industry: string;
  icon_name: ClientIconName;
  gsc_site?: string | null;
  ga4_property_id?: string | null;
}

export async function readClients(): Promise<Client[]> {
  return invoke("read_clients");
}

export async function addClient(client: ClientCreate): Promise<Client[]> {
  const fullClient = {
    ...client,
    gsc_site: client.gsc_site ?? null,
    ga4_property_id: client.ga4_property_id ?? null,
    created_at_unix: Math.floor(Date.now() / 1000),
  };
  return invoke("add_client", { client: fullClient });
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<Client[]> {
  return invoke("update_client", { id, patch });
}

/** Slugify a name into a default client id. Operator can override before submit. */
export function slugifyId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
