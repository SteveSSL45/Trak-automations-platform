import type { ActionPlan, ActionPlanDeliverable } from "./dossier";

/**
 * Hardcoded sample of what the trained 8-stage swarm's executor stage will
 * eventually produce. Used until the LoRA adapters are trained — the Tauri
 * approval UI exercises the real workflow against this mock so the UX is
 * locked before the swarm goes live.
 *
 * To delete in one commit: remove this file + remove the fallback branch
 * in pages/Dashboard.tsx that uses it when read_action_plan returns null.
 */
const SAMPLE_DELIVERABLES: ActionPlanDeliverable[] = [
  {
    id: "d_001",
    kind: "title_tag",
    target_page: "/",
    current: "Trak Automations | AI-Powered SEO",
    proposed: "AI-Powered SEO Automation for Operators | Trak Automations",
    rationale:
      "Leading with the value prop ('AI-Powered SEO Automation for Operators') captures both branded and high-intent non-branded queries. Current title under-uses the keyword 'automation'.",
    stage_source: "08_executor",
  },
  {
    id: "d_002",
    kind: "meta_description",
    target_page: "/",
    current:
      "AI-powered SEO platform for solo operators managing multiple clients.",
    proposed:
      "Run a 10-client SEO agency from one Mac. Daily LoRA-swarm analysis, GSC + GA4 ingestion, automated deliverables. Reviewed by you, executed in minutes.",
    rationale:
      "Specific scale claim ('10-client') + concrete capabilities ('LoRA-swarm', 'GSC + GA4', 'minutes') beat the generic current copy. ~155 chars stays inside Google's snippet budget.",
    stage_source: "08_executor",
  },
  {
    id: "d_003",
    kind: "content_brief",
    target_page: "/blog/seo-for-solo-operators",
    proposed:
      "Outline a 1,400-word post on 'Running an SEO Agency Solo: How to Manage 10+ Clients Without Burnout'. Sections: 1) The Solo-Operator Bottleneck, 2) Where Tools Help (Ingestion, Analysis, Deliverables), 3) Where Humans Stay (Approval, Strategy, Client Trust), 4) A Day-in-the-Life Walk-Through. Target 'solo seo agency', 'manage seo clients', 'seo automation'.",
    rationale:
      "GSC weekly shows 'solo seo agency' at position 14 with 280 impressions/week — striking distance. No existing content on the site targets it. Content brief gives the writer enough to start without prescribing every paragraph.",
    stage_source: "08_executor",
  },
  {
    id: "d_004",
    kind: "schema_markup",
    target_page: "/",
    proposed:
      "Add Organization + SoftwareApplication JSON-LD with applicationCategory='BusinessApplication', offers (price=1500, priceCurrency=USD, billingDuration=P1M).",
    rationale:
      "No structured data currently. SoftwareApplication schema unlocks Google's pricing-rich-result eligibility — directly relevant to the 'how much does it cost' query intent showing up in GSC.",
    stage_source: "08_executor",
  },
];

export function buildMockActionPlan(clientId: string, date: string): ActionPlan {
  return {
    client_id: clientId,
    date,
    schema_version: "0.1",
    source: "mock",
    deliverables: SAMPLE_DELIVERABLES.map((d) => ({ ...d })),
  };
}
