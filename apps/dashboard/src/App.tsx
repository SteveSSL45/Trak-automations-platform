import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { StrongholdGate } from "./components/StrongholdGate";
import { AddClientModal } from "./components/AddClientModal";
import { Dashboard } from "./pages/Dashboard";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { useAppStore } from "./state/app-store";
import { useClientsStore } from "./state/clients-store";

export default function App() {
  const navigate = useNavigate();
  const refreshClients = useClientsStore((s) => s.refresh);
  const [addOpen, setAddOpen] = useState(false);

  // Load clients once after Stronghold unlock (StrongholdGate gates the render
  // tree so by the time this effect fires, Stronghold is ready and the Tauri
  // command bridge is initialized).
  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

  return (
    <StrongholdGate>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
        <Sidebar
          onOpenOverview={() => navigate("/")}
          onOpenAddClient={() => setAddOpen(true)}
          onOpenSettings={() => navigate("/settings")}
        />

        <div className="flex flex-1 flex-col">
          <RouteAwareTopBar />

          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Overview onOpenAddClient={() => setAddOpen(true)} />} />
              <Route path="/clients/:clientId" element={<DashboardRoute />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>

        <AddClientModal open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    </StrongholdGate>
  );
}

/** Adapts URL params to the existing Dashboard component's `activeClientId` prop,
 *  and keeps the Zustand `activeClientId` slice in sync (some legacy components
 *  still read from it).
 */
function DashboardRoute() {
  const { clientId } = useParams();
  const setActiveClientId = useAppStore((s) => s.setActiveClientId);

  useEffect(() => {
    if (clientId) setActiveClientId(clientId);
  }, [clientId, setActiveClientId]);

  return <Dashboard activeClientId={clientId ?? null} />;
}

function RouteAwareTopBar() {
  const { clientId } = useParams();
  const clients = useClientsStore((s) => s.clients);
  const active = clientId ? clients.find((c) => c.id === clientId) : undefined;
  return <TopBar title={active?.name} />;
}
