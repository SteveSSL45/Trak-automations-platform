import { invoke } from "@tauri-apps/api/core";

export interface DossierGscDailyEntry {
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface DossierGsCDaily {
  date: string;
  site_url: string | null;
  top_queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  top_pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
  totals: { clicks: number; impressions: number; avg_position: number };
}

export interface DossierGscWeekly {
  range: { start: string; end: string };
  gainers: Array<{ query: string; position_delta: number; current_position: number; previous_position: number; clicks_7d: number }>;
  losers: Array<{ query: string; position_delta: number; current_position: number; previous_position: number; clicks_7d: number }>;
  striking_distance: Array<{ query: string; current_position: number; impressions_7d: number; clicks_7d: number }>;
  totals_7d: { clicks: number; impressions: number; avg_position: number };
}

export interface DossierGa4Daily {
  date: string;
  property_id: string | null;
  top_landing_pages: Array<{ page: string; sessions: number; users: number }>;
  totals: { sessions: number; users: number };
}

export interface Dossier {
  schema_version: string;
  client_id: string;
  client_name?: string;
  client_domain?: string;
  industry?: string;
  date: string;
  generated_at_unix: number;
  data_freshness: {
    gsc_last_fetched: string | null;
    ga4_last_fetched: string | null;
    ahrefs_last_fetched: string | null;
    crawl_last_fetched: string | null;
    pagespeed_last_fetched: string | null;
  };
  gsc_daily: DossierGsCDaily | null;
  gsc_weekly: DossierGscWeekly | null;
  ga4_daily: DossierGa4Daily | null;
  ahrefs: unknown;
  crawl: unknown;
  pagespeed: unknown;
  competitors: unknown;
}

export type DeliverableKind =
  | "title_tag"
  | "meta_description"
  | "content_brief"
  | "internal_link"
  | "schema_markup";

export interface ActionPlanDeliverable {
  id: string;
  kind: DeliverableKind;
  target_page: string;
  current?: string;
  proposed: string;
  rationale: string;
  stage_source: string;
}

export interface ActionPlan {
  client_id: string;
  date: string;
  schema_version: string;
  source: "swarm" | "mock";
  deliverables: ActionPlanDeliverable[];
}

export type DecisionAction = "approve" | "edit" | "reject";

export interface Decision {
  deliverable_id: string;
  action: DecisionAction;
  edited_to: string | null;
  reason: string | null;
}

export interface DecisionFile {
  client_id: string;
  date: string;
  decided_at_unix: number;
  decisions: Decision[];
}

export async function readDossier(clientId: string, date: string): Promise<Dossier | null> {
  return invoke("read_dossier", { clientId, date });
}

export async function readActionPlan(clientId: string, date: string): Promise<ActionPlan | null> {
  // Real swarm output: clients/<id>/swarm_runs/<date>/08_executor.json
  return invoke("read_action_plan", { clientId, date });
}

export async function readDecisions(
  clientId: string,
  date: string
): Promise<DecisionFile | null> {
  return invoke("read_decisions", { clientId, date });
}

export async function writeDecisions(
  clientId: string,
  date: string,
  decisions: Decision[]
): Promise<string> {
  return invoke("write_decisions", { clientId, date, decisions });
}

export function todayIsoYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
