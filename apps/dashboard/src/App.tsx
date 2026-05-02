import { Routes, Route, useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { StrongholdGate } from "./components/StrongholdGate";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { useAppStore } from "./state/app-store";

export default function App() {
  const navigate = useNavigate();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const setActiveClientId = useAppStore((s) => s.setActiveClientId);

  const handleSelectClient = (id: string) => {
    setActiveClientId(id);
    navigate("/");
  };

  return (
    <StrongholdGate>
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        activeClientId={activeClientId}
        onSelectClient={handleSelectClient}
        onOpenSettings={() => navigate("/settings")}
      />

      <div className="flex flex-1 flex-col">
        <TopBar
          activeClientId={activeClientId}
          onSelectClient={handleSelectClient}
        />

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard activeClientId={activeClientId} />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
    </StrongholdGate>
  );
}
