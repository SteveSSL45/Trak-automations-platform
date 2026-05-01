export interface Client {
  id: string;
  name: string;
  domain: string;
  industry: string;
  /** lucide-react icon name for the sidebar list */
  iconName: "Trees" | "Hammer" | "Cpu";
}

/**
 * Phase 1 mock client list. Three pilot clients confirmed by the operator.
 * Phase 3 replaces this with per-client `client_config.json` files loaded
 * from `clients/<id>/`.
 */
export const CLIENTS: Client[] = [
  {
    id: "lawn-care-co",
    name: "Lawn Care Co.",
    domain: "lawncare-pilot.com",
    industry: "Lawn care + landscaping (Genesee County)",
    iconName: "Trees",
  },
  {
    id: "home-improvement-co",
    name: "Home Improvement Co.",
    domain: "homeimprovement-pilot.com",
    industry: "Home remodeling + handyman (Genesee County)",
    iconName: "Hammer",
  },
  {
    id: "trak-automations",
    name: "Trak Automations",
    domain: "trakautomations.com",
    industry: "AI/automation agency (eat-your-own-dog-food)",
    iconName: "Cpu",
  },
];

export function getClientById(id: string): Client | undefined {
  return CLIENTS.find((c) => c.id === id);
}
