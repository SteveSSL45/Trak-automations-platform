# Phase 1: Tauri Shell + Multi-Client Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native macOS Tauri 2.x desktop app that opens with a polished, "intentional-looking" empty dashboard. Sidebar shows the three pilot clients (lawn care, home improvement, trakautomations.com); a sticky top bar holds the brand mark + a client-picker dropdown + a settings link; the main content area shows a clean "select a client" empty state when no client is active and a per-client placeholder when one is. Settings page exists as a skeleton with placeholder cards for the four required integrations (GSC, GA4, Anthropic, Ollama). The `.app` bundle builds and launches from `Applications`.

**Architecture:** Tauri 2 (Rust + Vite + React + TypeScript) on the macOS side. React Router for routing, Zustand for app state, Tailwind CSS 4 for styling, Lucide React for icons. Visual language matches `trak-automations-web` so the operator's dashboard and the public marketing site feel like the same product family — slate-900 background, cyan-500/sky-500 accent, Inter font. **No Ollama, no Python workers, no real data yet** — Phase 1 is purely the UI shell so visual decisions can be made before complexity lands.

**Tech Stack:** macOS 14+ on Apple Silicon · Tauri 2.x · React 18 + TypeScript · Vite · Tailwind CSS 4 · React Router DOM 6 · Zustand · Lucide React · Inter (via Fontsource).

---

## Pre-flight: macOS toolchain check

Before any task in this plan, confirm the build tooling is installed. **Do this first; if anything is missing the install takes ~30 min.**

```bash
# 1. Xcode Command Line Tools (Tauri's macOS build dependency)
xcode-select -p
# Expected output: /Library/Developer/CommandLineTools (or similar)
# If missing: xcode-select --install   # opens GUI installer; needs ~7 GB

# 2. Node.js 22 LTS via nvm (or Homebrew if you prefer)
node -v
# Expected: v22.x.x
# If missing or older:
#   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
#   nvm install 22 && nvm use 22

# 3. Rust + Cargo (Tauri's Rust backend)
rustc --version
# Expected: rustc 1.80.0+ (anything from 2024 onwards is fine)
# If missing:
#   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
#   source "$HOME/.cargo/env"

# 4. Git (with SSH key set up for GitHub — same as Windows side)
git --version
ssh -T git@github.com    # should print "Hi SteveSSL45! You've successfully authenticated..."
```

If all four print expected output, proceed to Task A.1. Otherwise install what's missing first.

**Note:** Phase 1 does NOT need Ollama, Python, Anthropic API keys, or any other runtime LLM tooling. Those land in Phase 2 and 3. Don't sequence those installs ahead of need.

---

## Working directory

After cloning the repo on the Mac:

```bash
git clone git@github.com:SteveSSL45/trak-automations-platform.git
cd trak-automations-platform
```

All paths in this plan are relative to that directory.

---

## Group A — Tauri scaffold + base config

### Task A.1: Scaffold Tauri 2 app

**Files:**
- Create: everything under `apps/dashboard/`

- [ ] **Step 1: Run the official Tauri 2 template**

```bash
cd apps
rm dashboard/.gitkeep    # we're about to populate the dashboard/ dir for real
npm create tauri-app@latest dashboard
```

Answer the prompts:
- **Project name:** `dashboard` (already set; just press Enter)
- **Identifier:** `com.trakautomations.dashboard`
- **Choose which language to use for your frontend:** TypeScript / JavaScript
- **Choose your package manager:** npm
- **Choose your UI template:** React
- **Choose your UI flavor:** TypeScript

This produces `apps/dashboard/` with a Tauri 2 + React + TS + Vite scaffold.

- [ ] **Step 2: Verify the scaffold landed**

```bash
ls apps/dashboard/
# Expected: src/, src-tauri/, public/, package.json, tsconfig.json, vite.config.ts, README.md, index.html
```

- [ ] **Step 3: Install npm dependencies**

```bash
cd apps/dashboard
npm install
```

This pulls Vite, React, React-DOM, TypeScript, `@tauri-apps/cli`, `@tauri-apps/api`. Takes ~30-60 sec.

- [ ] **Step 4: Commit**

```bash
cd ../..    # back to repo root
git add apps/
git commit -m "feat(dashboard): scaffold Tauri 2 app (React + TypeScript + Vite)"
```

---

### Task A.2: Verify dev server + native window launches

**Files:** none — verification only

- [ ] **Step 1: Boot the Tauri dev server**

```bash
cd apps/dashboard
npm run tauri dev
```

First boot is slow — Cargo compiles ~200 Rust crates. Expect 2–4 min on M3 Max.

- [ ] **Step 2: Confirm a native macOS window opens**

A window titled "Tauri" should appear with the default Tauri demo (logo, "Welcome to Tauri + React", input field). The window is a real native macOS window — not a browser tab.

If it doesn't open after 5 min, check the terminal for Rust compile errors. If you see "linker" errors, your Xcode CLT install probably needs a refresh (`sudo xcode-select --reset` then `xcode-select --install`).

- [ ] **Step 3: Stop the dev server**

`Ctrl+C` in the terminal.

This task does NOT commit anything — it just confirms the scaffold works on this machine.

---

### Task A.3: Configure `tauri.conf.json` for production identity

**Files:**
- Modify: `apps/dashboard/src-tauri/tauri.conf.json`

The default scaffold has placeholder values. We're setting real ones now so future build steps don't drift.

- [ ] **Step 1: Open `apps/dashboard/src-tauri/tauri.conf.json`**

The default file looks roughly like:

```json
{
  "productName": "dashboard",
  "version": "0.1.0",
  "identifier": "com.trakautomations.dashboard",
  "app": {
    "windows": [
      {
        "title": "dashboard",
        "width": 800,
        "height": 600
      }
    ],
    ...
  }
}
```

Replace the relevant fields with:

```json
{
  "productName": "Trak Automations",
  "version": "0.1.0",
  "identifier": "com.trakautomations.dashboard",
  "app": {
    "windows": [
      {
        "title": "Trak Automations",
        "width": 1400,
        "height": 900,
        "minWidth": 1100,
        "minHeight": 720,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "transparent": false
      }
    ],
    ...
  },
  "bundle": {
    ...existing bundle config...
    "category": "Productivity",
    "shortDescription": "Multi-client SEO/marketing operator dashboard",
    "longDescription": "Trak Automations is a single-operator AI-powered SEO/marketing agency dashboard. Manages multiple client websites with daily ingestion, automated swarm-based analysis, and operator-reviewed action plans."
  }
}
```

Don't touch fields you don't recognize — Tauri 2's config schema is strict and unknown fields will fail validation.

- [ ] **Step 2: Validate the config still parses**

```bash
cd apps/dashboard
npm run tauri info 2>&1 | tail -10
```

Should print Tauri's environment summary without errors. If you see a JSON parse error, the edit broke the file — fix the syntax.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/dashboard/src-tauri/tauri.conf.json
git commit -m "chore(dashboard): set production app identity (name, window size, bundle metadata)"
```

---

### Task A.4: Install + configure Tailwind CSS 4

**Files:**
- Modify: `apps/dashboard/package.json`
- Modify: `apps/dashboard/vite.config.ts`
- Create: `apps/dashboard/src/index.css` (or replace existing)
- Modify: `apps/dashboard/src/main.tsx`

We're using Tailwind v4 (Vite plugin) to match the marketing site.

- [ ] **Step 1: Install Tailwind 4 + the Vite plugin**

```bash
cd apps/dashboard
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add the Tailwind Vite plugin to `vite.config.ts`**

The default `vite.config.ts` looks roughly like:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  ...
});
```

Modify to add the Tailwind plugin:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  ...
});
```

- [ ] **Step 3: Replace `apps/dashboard/src/index.css` with Tailwind import + base CSS**

```css
@import "tailwindcss";

/* App-wide CSS variables — matches trak-automations-web brand palette */
:root {
  --bg-darker: #020617;        /* slate-950 */
  --bg-dark: #0f172a;           /* slate-900 */
  --bg-elevated: #1e293b;       /* slate-800 */
  --border-subtle: #334155;     /* slate-700 */
  --text-primary: #e2e8f0;      /* slate-200 */
  --text-muted: #94a3b8;        /* slate-400 */
  --accent: #06b6d4;            /* cyan-500 */
  --accent-hover: #0891b2;      /* cyan-600 */
  --accent-secondary: #0ea5e9;  /* sky-500 */
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100vh;
  background: var(--bg-darker);
  color: var(--text-primary);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";  /* Inter character variants */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  height: 100%;
}

/* Hide default Tauri scrollbar styling glitches on macOS */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
```

- [ ] **Step 4: Verify `main.tsx` imports `index.css`**

`apps/dashboard/src/main.tsx` should already have `import "./index.css";` near the top (Tauri's default scaffold does this). If not, add it after the React imports.

- [ ] **Step 5: Smoke-test that Tailwind classes work**

Edit `apps/dashboard/src/App.tsx` temporarily — add a `className` to the outer div:

```tsx
<div className="min-h-screen bg-slate-900 text-cyan-400 p-8">
  ...existing content...
</div>
```

Run `npm run tauri dev`. The window should now show a slate-900 background with cyan text. **If it doesn't, Tailwind isn't wired up — debug before continuing.**

Once verified, revert the smoke-test change (we'll do real layout in Group B).

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/dashboard/package.json apps/dashboard/package-lock.json apps/dashboard/vite.config.ts apps/dashboard/src/index.css
git commit -m "feat(dashboard): install Tailwind CSS 4 + Vite plugin + brand palette CSS vars"
```

---

### Task A.5: Add Inter font + Lucide icons

**Files:**
- Modify: `apps/dashboard/package.json`
- Modify: `apps/dashboard/src/main.tsx`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/dashboard
npm install @fontsource/inter lucide-react
```

`@fontsource/inter` self-hosts the Inter font (no Google Fonts CDN call). `lucide-react` is a lightweight icon set with React components.

- [ ] **Step 2: Import the font weights in `main.tsx`**

At the top of `apps/dashboard/src/main.tsx`, after the React imports:

```tsx
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
```

- [ ] **Step 3: Verify Inter is rendering**

Run `npm run tauri dev`. Open DevTools (right-click → Inspect Element). In the Computed tab on the body, font-family should resolve to `Inter`.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/dashboard/package.json apps/dashboard/package-lock.json apps/dashboard/src/main.tsx
git commit -m "feat(dashboard): add Inter font (self-hosted) + Lucide icon library"
```

---

## Group B — Layout shell

### Task B.1: Install + configure React Router DOM 6

**Files:**
- Modify: `apps/dashboard/package.json`
- Modify: `apps/dashboard/src/main.tsx`

- [ ] **Step 1: Install**

```bash
cd apps/dashboard
npm install react-router-dom
```

- [ ] **Step 2: Wrap `App` with `BrowserRouter` in `main.tsx`**

The default `main.tsx` renders `<App />` directly. Modify it:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

`BrowserRouter` (vs `HashRouter`) is fine in Tauri because Tauri serves the dev/production assets from a virtual root. No SPA routing weirdness.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/dashboard/package.json apps/dashboard/package-lock.json apps/dashboard/src/main.tsx
git commit -m "feat(dashboard): wire React Router DOM 6 (BrowserRouter at root)"
```

---

### Task B.2: Create mock client data

**Files:**
- Create: `apps/dashboard/src/lib/clients.ts`

The first three real pilot clients. Hardcoded for Phase 1; replaced by per-client config files in Phase 3.

- [ ] **Step 1: Create the mock client list**

```typescript
// apps/dashboard/src/lib/clients.ts

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
 *
 * Phase 3 replaces this with per-client `client_config.json` files loaded
 * from `clients/<id>/`. For Phase 1 we hardcode so we can build the UI
 * before the credential/onboarding system exists.
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
```

- [ ] **Step 2: Commit**

```bash
cd ../..
git add apps/dashboard/src/lib/clients.ts
git commit -m "feat(dashboard): add mock client list (3 pilots: lawn care, home improvement, trakautomations)"
```

---

### Task B.3: Build the Sidebar component

**Files:**
- Create: `apps/dashboard/src/components/Sidebar.tsx`

The left rail. Shows client list + active highlight + a small footer with operator identity.

- [ ] **Step 1: Create `Sidebar.tsx`**

```tsx
// apps/dashboard/src/components/Sidebar.tsx
import { Trees, Hammer, Cpu, Settings, type LucideIcon } from "lucide-react";
import { CLIENTS } from "../lib/clients";

const ICONS: Record<string, LucideIcon> = {
  Trees,
  Hammer,
  Cpu,
};

interface Props {
  activeClientId: string | null;
  onSelectClient: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ activeClientId, onSelectClient, onOpenSettings }: Props) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
      {/* Brand mark */}
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-sky-500" />
        <span className="text-base font-semibold tracking-tight text-white">
          Trak<span className="text-cyan-400">.</span>
        </span>
      </div>

      {/* Section: Clients */}
      <div className="px-3 pb-2 pt-2">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Clients
        </p>
        <ul className="space-y-1">
          {CLIENTS.map((client) => {
            const Icon = ICONS[client.iconName] ?? Cpu;
            const active = client.id === activeClientId;
            return (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => onSelectClient(client.id)}
                  className={
                    "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors " +
                    (active
                      ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/20"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white")
                  }
                >
                  <Icon
                    size={16}
                    className={active ? "text-cyan-400" : "text-slate-500 group-hover:text-slate-300"}
                  />
                  <span className="truncate">{client.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer: Settings + operator */}
      <div className="border-t border-slate-800 px-3 py-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors"
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>
        <div className="mt-2 px-3 py-2">
          <p className="text-xs text-slate-500">Operator</p>
          <p className="truncate text-sm text-slate-300">Steve</p>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ../..
git add apps/dashboard/src/components/Sidebar.tsx
git commit -m "feat(dashboard): Sidebar with client list, active highlight, settings link"
```

---

### Task B.4: Build the TopBar component

**Files:**
- Create: `apps/dashboard/src/components/TopBar.tsx`

Sticky top bar with breadcrumb-style client name, a quick client picker dropdown, and a "today's action plan" pill that's a placeholder for now (real in Phase 5).

- [ ] **Step 1: Create `TopBar.tsx`**

```tsx
// apps/dashboard/src/components/TopBar.tsx
import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { CLIENTS, getClientById } from "../lib/clients";

interface Props {
  activeClientId: string | null;
  onSelectClient: (id: string) => void;
}

export function TopBar({ activeClientId, onSelectClient }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeClient = activeClientId ? getClientById(activeClientId) : undefined;

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6">
      {/* Left: client picker */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm text-white hover:border-cyan-500 hover:bg-slate-800 transition-colors"
        >
          <span className="text-slate-400">Client</span>
          <span className="text-slate-700">·</span>
          <span className="font-medium">
            {activeClient ? activeClient.name : "Select…"}
          </span>
          <ChevronDown size={14} className="text-slate-500" />
        </button>

        {pickerOpen && (
          <div className="absolute left-6 top-12 z-30 w-72 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            <ul className="max-h-80 overflow-y-auto py-1">
              {CLIENTS.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectClient(c.id);
                      setPickerOpen(false);
                    }}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    <span className="font-medium text-white">{c.name}</span>
                    <span className="text-xs text-slate-500">{c.domain}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Right: status pill */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
          <Sparkles size={12} className="text-cyan-400" />
          <span>Phase 1 · UI shell</span>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ../..
git add apps/dashboard/src/components/TopBar.tsx
git commit -m "feat(dashboard): TopBar with client picker dropdown + phase status pill"
```

---

### Task B.5: Wire everything together in `App.tsx`

**Files:**
- Modify: `apps/dashboard/src/App.tsx`
- Create: `apps/dashboard/src/pages/Dashboard.tsx`
- Create: `apps/dashboard/src/pages/Settings.tsx` (skeleton — Group D fleshes this out)

- [ ] **Step 1: Replace `App.tsx` content**

The default scaffold's `App.tsx` shows the Tauri demo. Replace it entirely:

```tsx
// apps/dashboard/src/App.tsx
import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";

export default function App() {
  const navigate = useNavigate();
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        activeClientId={activeClientId}
        onSelectClient={(id) => {
          setActiveClientId(id);
          navigate("/");
        }}
        onOpenSettings={() => navigate("/settings")}
      />

      <div className="flex flex-1 flex-col">
        <TopBar
          activeClientId={activeClientId}
          onSelectClient={(id) => {
            setActiveClientId(id);
            navigate("/");
          }}
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
```

- [ ] **Step 2: Create `pages/Dashboard.tsx`**

```tsx
// apps/dashboard/src/pages/Dashboard.tsx
import { Inbox } from "lucide-react";
import { getClientById } from "../lib/clients";

interface Props {
  activeClientId: string | null;
}

export function Dashboard({ activeClientId }: Props) {
  if (!activeClientId) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <Inbox className="mx-auto mb-4 h-12 w-12 text-slate-700" />
          <h2 className="text-lg font-semibold text-white">Select a client</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick a client from the sidebar to see today&rsquo;s action plan, deliverables, and ingestion status.
          </p>
        </div>
      </div>
    );
  }

  const client = getClientById(activeClientId);
  if (!client) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-sm text-slate-500">Unknown client: {activeClientId}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500">{client.industry}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{client.name}</h1>
        <a
          href={`https://${client.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-cyan-400 hover:underline"
        >
          {client.domain} ↗
        </a>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-12 text-center">
        <p className="text-sm text-slate-500">
          Phase 1 placeholder — daily action plan UI lands in Phase 5.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Phase 2 wires Ollama. Phase 3 connects GSC + GA4. Phase 4 ingests data. Phase 5 produces real plans.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `pages/Settings.tsx` skeleton**

```tsx
// apps/dashboard/src/pages/Settings.tsx
// Group D fleshes this out. Stub for now so the route doesn't 404.
export function Settings() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Group D will populate this page.</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify the dev build still launches**

```bash
cd apps/dashboard
npm run tauri dev
```

You should see:
- Sidebar on the left with the three pilot clients
- Top bar with "Client · Select…" picker
- Empty state in the main area: "Select a client"

Click a client in the sidebar — main area updates to that client's placeholder. Click "Settings" in the sidebar footer — page changes to the settings stub. Click the top bar's "Client · …" dropdown — list of three clients appears.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add apps/dashboard/src/App.tsx apps/dashboard/src/pages/Dashboard.tsx apps/dashboard/src/pages/Settings.tsx
git commit -m "feat(dashboard): integrate Sidebar + TopBar + routes (/ and /settings) with active-client state"
```

---

## Group C — Lift active-client state into Zustand

The state is currently in `App.tsx`'s local `useState`. That works for Phase 1 but every Phase 2+ component will need access to the active client. Lifting to Zustand now means we don't refactor it later under pressure.

### Task C.1: Install Zustand + create the app store

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/src/state/app-store.ts`

- [ ] **Step 1: Install**

```bash
cd apps/dashboard
npm install zustand
```

- [ ] **Step 2: Create `src/state/app-store.ts`**

```typescript
// apps/dashboard/src/state/app-store.ts
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
```

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/dashboard/package.json apps/dashboard/package-lock.json apps/dashboard/src/state/app-store.ts
git commit -m "feat(dashboard): Zustand app store with persisted activeClientId"
```

---

### Task C.2: Wire `App.tsx` + components to read from the store

**Files:**
- Modify: `apps/dashboard/src/App.tsx`

- [ ] **Step 1: Replace `App.tsx`'s local `useState` with the store**

```tsx
// apps/dashboard/src/App.tsx
import { Routes, Route, useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
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
```

- [ ] **Step 2: Verify persistence works**

Run `npm run tauri dev`. Click a client in the sidebar. Close the window. Reopen via `npm run tauri dev` again. The previously-selected client should still be highlighted in the sidebar.

(If it doesn't persist, check `localStorage` in DevTools: should have a key `trak-app-store` with the `activeClientId` value.)

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/dashboard/src/App.tsx
git commit -m "feat(dashboard): App reads activeClientId from Zustand store (with persist)"
```

---

## Group D — Settings page skeleton

### Task D.1: Build the Settings page with Connection placeholder cards

**Files:**
- Modify: `apps/dashboard/src/pages/Settings.tsx`
- Create: `apps/dashboard/src/components/ConnectionCard.tsx`

The settings page is where Phase 3 will surface OAuth flows for each client's GSC + GA4. For now, we want skeleton cards so the navigation feels real.

- [ ] **Step 1: Create `components/ConnectionCard.tsx`**

```tsx
// apps/dashboard/src/components/ConnectionCard.tsx
import { Circle, type LucideIcon } from "lucide-react";

export type ConnectionStatus = "connected" | "needs_reauth" | "broken" | "not_connected";

interface Props {
  name: string;
  description: string;
  Icon: LucideIcon;
  status: ConnectionStatus;
  scopeNote?: string;
  onAction?: () => void;
}

const STATUS_META: Record<ConnectionStatus, { label: string; color: string; ring: string }> = {
  connected:     { label: "Connected",     color: "text-emerald-400",  ring: "ring-emerald-500/30" },
  needs_reauth:  { label: "Needs reauth",  color: "text-amber-400",    ring: "ring-amber-500/30"   },
  broken:        { label: "Broken",        color: "text-rose-400",     ring: "ring-rose-500/30"    },
  not_connected: { label: "Not connected", color: "text-slate-500",    ring: "ring-slate-700"      },
};

export function ConnectionCard({ name, description, Icon, status, scopeNote, onAction }: Props) {
  const meta = STATUS_META[status];
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900/40 p-5 ring-1 ${meta.ring}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">{name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            {scopeNote && (
              <p className="mt-1.5 text-xs text-slate-600">{scopeNote}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Circle className={`h-2 w-2 fill-current ${meta.color}`} />
          <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onAction}
          disabled={!onAction}
          className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "connected" ? "Test connection" : status === "needs_reauth" ? "Reauthorize" : "Configure"}
        </button>
        <span className="text-xs text-slate-600">— Phase 3 will wire this up</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `pages/Settings.tsx` with the real layout**

```tsx
// apps/dashboard/src/pages/Settings.tsx
import { Search, BarChart3, Brain, Cpu } from "lucide-react";
import { ConnectionCard } from "../components/ConnectionCard";

export function Settings() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Operator-level configuration. Per-client settings live on each client&rsquo;s detail page.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Operator-level connections
          </h2>
          <p className="text-xs text-slate-600">Shared across all clients</p>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          API keys you own (not the client&rsquo;s). One key serves every client unless overridden per-client.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            name="Anthropic API"
            description="Claude Sonnet 4.6 fallback for ambiguous cases"
            Icon={Brain}
            status="not_connected"
            scopeNote="Master key, shared across clients."
          />
          <ConnectionCard
            name="Ollama (local)"
            description="Llama 3.3 70B + future LoRA adapters"
            Icon={Cpu}
            status="not_connected"
            scopeNote="Auto-detected on http://localhost:11434"
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Per-client connections
          </h2>
          <p className="text-xs text-slate-600">Authorized per client</p>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          OAuth flows that authorize TRAK to read each client&rsquo;s Google services. Each client connects their own.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            name="Google Search Console"
            description="Daily query/page/position pulls"
            Icon={Search}
            status="not_connected"
            scopeNote="Read-only · per-client OAuth"
          />
          <ConnectionCard
            name="Google Analytics 4"
            description="Conversions + landing-page engagement"
            Icon={BarChart3}
            status="not_connected"
            scopeNote="Read-only · per-client OAuth"
          />
        </div>

        <p className="mt-4 text-xs text-slate-600">
          Add Ahrefs, DataForSEO, PageSpeed Insights in Phase 3 v1.5.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify the settings page renders**

`npm run tauri dev`, click Settings in the sidebar footer. Should see two sections: Operator-level (Anthropic + Ollama) and Per-client (GSC + GA4) — each card has a status pill and a disabled "Configure" button.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/dashboard/src/pages/Settings.tsx apps/dashboard/src/components/ConnectionCard.tsx
git commit -m "feat(dashboard): Settings page skeleton with operator-level + per-client connection placeholders"
```

---

## Group E — Visual polish + production build

### Task E.1: Visual polish pass

**Files:** any of the components above — operator iterates until the dashboard "feels right"

This is the explicit UI checkpoint from the TRAK_AUTOMATIONS.md doc:

> "UI checkpoint: beautiful empty dashboard. Iterate on fonts, colors, sidebar widths, navigation patterns until it feels right before adding complexity."

Things worth tweaking before moving to Phase 2:

- [ ] **Sidebar width** — currently `w-64` (256 px). Try `w-60` or `w-72` and pick whichever feels right.
- [ ] **Brand mark in sidebar** — currently a gradient square + "Trak." text. Want a real logo? Replace the `<div>` block. Otherwise leave.
- [ ] **Active client indicator** — currently a 1px ring + 10% cyan tint. Try a left-edge accent bar instead and see which reads cleaner.
- [ ] **Top bar density** — currently `h-14` (56 px). If everything feels cramped, try `h-16`.
- [ ] **Hover affordances** — every clickable element has a hover state? Test by hovering each.
- [ ] **Dark mode contrast** — read the dashboard in different lighting (especially direct sun on a Mac display). If anything's hard to read, bump the slate-300/400/500 values one step lighter.
- [ ] **Empty state on /** — does "Select a client" feel inviting or sterile? Could add a hint like "Or, last viewed: Lawn Care Co." with a quick-resume button.

This task does NOT have a verification check — the verification IS the operator's eye. Commit whatever changes feel worth keeping.

- [ ] **Commit any polish changes:**

```bash
git add -A apps/dashboard/src/
git commit -m "feat(dashboard): Phase 1 visual polish — <describe what changed>"
```

---

### Task E.2: Build the macOS .app and verify it launches

**Files:** none — produces `apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app`

- [ ] **Step 1: Run the production build**

```bash
cd apps/dashboard
npm run tauri build
```

This compiles Rust in release mode (slower than dev — first build can take 10+ min on M3 Max, subsequent builds are faster thanks to cargo's incremental cache). Vite builds the React bundle. The output is a `.app` bundle in `apps/dashboard/src-tauri/target/release/bundle/macos/`.

- [ ] **Step 2: Verify the bundle**

```bash
ls -la "apps/dashboard/src-tauri/target/release/bundle/macos/"
# Should see: Trak Automations.app/
```

- [ ] **Step 3: Launch from Finder**

```bash
open "apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app"
```

The app should launch to the same dashboard you saw in dev mode. **First launch is unsigned** — macOS will warn "App can't be opened because Apple cannot check it for malicious software". To bypass for personal use:

- Right-click the .app in Finder → Open → confirm dialog → Open anyway
- OR run `xattr -cr "apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app"` to clear quarantine flags, then `open` again

(Phase 9 of the master plan handles real code-signing + notarization for distribution. Phase 1 just needs to confirm the bundle works locally.)

- [ ] **Step 4: Drag to Applications (optional)**

```bash
cp -r "apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app" /Applications/
```

Now `Trak Automations` is searchable via Spotlight (`Cmd+Space`).

- [ ] **Step 5: Update the README to mention the `.app` location**

Append to README.md a new section:

```markdown
## Built artifacts

After `npm run tauri build` in `apps/dashboard/`:
- `apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app` — drag to /Applications/

Phase 9 of the master spec handles code-signing + notarization for real distribution.
```

- [ ] **Step 6: Final commit**

```bash
cd ../..
git add README.md
git commit -m "docs: README — note .app build artifact location after `tauri build`"
```

---

## Final verification checklist

- [ ] `npm run tauri dev` opens a native macOS window without errors
- [ ] Sidebar shows three clients: Lawn Care Co. / Home Improvement Co. / Trak Automations
- [ ] Clicking a client highlights it in the sidebar AND updates the top bar's "Client · …" label
- [ ] Top bar's client picker dropdown opens / closes / selects clients
- [ ] When no client is selected, main area shows "Select a client" empty state
- [ ] When a client is selected, main area shows their name + domain + Phase 1 placeholder
- [ ] Sidebar footer "Settings" link navigates to /settings
- [ ] Settings page shows 4 connection placeholder cards with "Not connected" status
- [ ] Closing + reopening the app remembers the last-selected client (Zustand persist)
- [ ] `npm run tauri build` produces a `.app` bundle that opens from Finder
- [ ] All commits are scoped (no `node_modules`, `target/`, `.env` files committed) — verify with `git log --stat -10`

If all 11 boxes check, Phase 1 is shipped. Push to GitHub:

```bash
git push origin main
```

---

## Self-review

**Spec coverage check:** every Phase 1 requirement from `TRAK_AUTOMATIONS.md` § "Phase 1 — Tauri shell + multi-client sidebar (weeks 1-2)" maps to tasks in this plan:

| Spec requirement | Implementing task |
|---|---|
| Sidebar nav with mock client list (3 hardcoded clients) | B.2 (data) + B.3 (component) |
| Top bar with client picker dropdown | B.4 |
| Empty main content area with "select a client" placeholder | B.5 (Dashboard component) |
| Settings page skeleton | B.5 (stub) + D.1 (real layout) |
| Tauri 2 + React + TypeScript scaffolding | A.1 |
| macOS .app build | E.2 |
| UI checkpoint / iteration time | E.1 |

**Placeholder scan:** every step that writes code shows the code; every command shows expected output where verification is needed; every task ends with a commit. No "TBD", "implement later", or "fill in details".

**Type consistency:** `Client` interface defined in B.2 is imported and used identically in B.3 (Sidebar), B.4 (TopBar), B.5 (Dashboard). `AppState` from C.1 is consumed in C.2. `ConnectionStatus` and `ConnectionCard`'s prop types stay self-contained in D.1.

**Scope:** this plan covers ONLY Phase 1 (UI shell). It explicitly defers:
- Ollama integration → Phase 2
- Per-client OAuth + credential storage → Phase 3
- Daily ingestion workers (GSC, GA4, Ahrefs, etc.) → Phase 4
- Dossier builder + 8-stage swarm chain → Phase 5
- Approval workflow + history → Phase 6
- launchd cron → Phase 7
- Weekly client PDF reports → Phase 8
- Code-signing + notarization → Phase 9

Each subsequent phase gets its own implementation plan. Don't blur lines forward.

**Implementation note:** all of Phase 1 happens on the Mac. None of the code in this plan touches Windows-specific paths or WSL. The repo was scaffolded on Windows for git/initial-commit convenience, but every `npm`, `cargo`, and `tauri` command in this plan runs on macOS only.
