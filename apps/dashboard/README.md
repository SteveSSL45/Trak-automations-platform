# Trak Automations — Dashboard

The native macOS Tauri 2 desktop app for the Trak Automations platform. React + TypeScript frontend, Rust backend (currently default; Phase 2+ will add custom Tauri commands).

> **Phase 1 scope:** UI shell only — sidebar, top bar, settings page skeleton. No real data, no Ollama, no API calls. See [`docs/superpowers/plans/2026-04-28-phase-1-tauri-shell.md`](../../docs/superpowers/plans/2026-04-28-phase-1-tauri-shell.md).

## Stack

| Layer | Tech |
|---|---|
| Native shell | Tauri 2.x (Rust) |
| Frontend bundler | Vite 7 |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS 4 (Vite plugin, `@import "tailwindcss"` syntax) |
| Routing | React Router DOM 6 |
| State | Zustand (with `persist` to localStorage) |
| Icons | Lucide React |
| Font | Inter (self-hosted via `@fontsource/inter`) |

## Prerequisites

- macOS 14+ on Apple Silicon
- Xcode Command Line Tools (`xcode-select --install`)
- Node.js 22 LTS or newer (currently developed against Node 25)
- Rust + Cargo via [rustup.rs](https://rustup.rs/)

## Development

```bash
cd apps/dashboard
npm install            # one time
npm run tauri dev      # spawns native window, hot-reloads on save
```

First boot is slow (Cargo compiles ~200 crates, 30–60 s on M3). Subsequent launches are near-instant.

## Production build

```bash
npm run tauri build
```

Produces an unsigned `.app` bundle at:

```
apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app
```

First-launch Gatekeeper warning is expected (unsigned). To bypass for personal use:

```bash
xattr -cr "src-tauri/target/release/bundle/macos/Trak Automations.app"
open "src-tauri/target/release/bundle/macos/Trak Automations.app"
```

Or right-click the .app in Finder → **Open** → **Open anyway**.

To install to `/Applications/`:

```bash
cp -r "src-tauri/target/release/bundle/macos/Trak Automations.app" /Applications/
```

## Distribution / code signing

When you want to hand the app to a non-dev Mac (a client's machine, or a
fresh laptop) without the Gatekeeper warning + `xattr` workaround, sign +
notarize it.

**One-time operator setup:**

1. Apple Developer Program membership ($99/yr): https://developer.apple.com/programs/enroll/
2. **Developer ID Application** cert via Xcode → Settings → Accounts → Manage Certificates → "+". Lands in Login Keychain.
3. App-specific password at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords. Save it.
4. Find your Team ID at https://developer.apple.com/account → Membership.

**Enable signing in `tauri.conf.json`:** change `bundle.macOS.signingIdentity` from `null` to your cert name. Find the exact name with:

```bash
security find-identity -v -p codesigning
```

It looks like `Developer ID Application: Your Name (ABCDE12345)`.

**Build + notarize:**

```bash
# Sign + bundle
cd apps/dashboard && npm run tauri build

# Notarize (one-time per build)
export APPLE_ID="you@example.com"
export APPLE_TEAM_ID="ABCDE12345"
export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # the app-specific one
bash ../../scripts/notarize.sh
```

The script submits the `.dmg`, polls Apple (~1-5 min), and staples the ticket. After that the `.dmg` opens cleanly on any Mac, offline.

`bundle.macOS.signingIdentity` stays `null` in the committed config so other devs (or CI) can build unsigned. Each operator sets it locally.

## Source layout

```
src/
├── main.tsx                ← React entry, Inter + Tailwind imports, BrowserRouter
├── App.tsx                 ← layout shell (Sidebar | TopBar / main routes)
├── index.css               ← @import "tailwindcss" + brand CSS vars
├── components/
│   ├── Sidebar.tsx         ← left rail, client list, active highlight, settings link
│   ├── TopBar.tsx          ← sticky header, client picker dropdown, status pill
│   └── ConnectionCard.tsx  ← settings page connection status card
├── pages/
│   ├── Dashboard.tsx       ← / route — empty-state or client placeholder
│   └── Settings.tsx        ← /settings route — operator + per-client connections
├── lib/
│   └── clients.ts          ← Phase 1 mock client list (3 pilots)
└── state/
    └── app-store.ts        ← Zustand store (activeClientId, persisted)

src-tauri/
├── Cargo.toml
├── Cargo.lock              ← committed (binary crate)
├── tauri.conf.json         ← productName, window size, bundle metadata
├── src/main.rs             ← default Tauri entry; custom commands land in Phase 2+
├── capabilities/           ← Tauri 2 permissions
└── icons/                  ← bundle icons
```

## Brand palette (CSS vars in `src/index.css`)

| Var | Value | Tailwind equiv |
|---|---|---|
| `--bg-darker` | `#020617` | `slate-950` |
| `--bg-dark` | `#0f172a` | `slate-900` |
| `--bg-elevated` | `#1e293b` | `slate-800` |
| `--border-subtle` | `#334155` | `slate-700` |
| `--text-primary` | `#e2e8f0` | `slate-200` |
| `--text-muted` | `#94a3b8` | `slate-400` |
| `--accent` | `#06b6d4` | `cyan-500` |
| `--accent-secondary` | `#0ea5e9` | `sky-500` |

Matches the public marketing site (`trak-automations-web`) so dashboard + landing page feel like the same product.
