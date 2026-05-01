import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  /** Which client is currently being viewed. null = none. */
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
}

/**
 * App-wide store. Persisted to localStorage so reopening the app
 * remembers the last-viewed client.
 *
 * Future fields (Phase 5+):
 *   - latestActionPlanByClient: Record<string, ActionPlan>
 *   - pendingApprovals: PendingApproval[]
 *   - lastIngestionRun: ISO timestamp
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeClientId: null,
      setActiveClientId: (id) => set({ activeClientId: id }),
    }),
    {
      name: "trak-app-store",
    }
  )
);
