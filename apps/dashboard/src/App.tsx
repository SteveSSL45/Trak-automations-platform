import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";

export default function App() {
  const navigate = useNavigate();
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  const handleSelectClient = (id: string) => {
    setActiveClientId(id);
    navigate("/");
  };

  return (
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
  );
}
