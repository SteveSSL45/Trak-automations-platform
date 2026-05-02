# Phase 9: Code-Signing + Notarization — Implementation Plan

> Same execution pattern as prior phases. Final phase of the 9-phase MVP.

**Goal:** When the operator has an Apple Developer ID cert configured, `npm run tauri build` produces a fully signed `.app`, and `bash scripts/notarize.sh` submits it to Apple's notary service + staples the ticket. Result: the `.app` opens on any Mac without Gatekeeper warnings or `xattr -cr` workarounds. When the operator does NOT have a cert (current state), the build still produces the existing unsigned `.app` — no behavior change.

**Architecture:**
- Tauri config (`tauri.conf.json`) gets a `bundle.macOS.signingIdentity` field — null by default (ad-hoc signing, what we have today). Operator sets it to their Developer ID Application cert name to enable real signing.
- Entitlements file at `apps/dashboard/src-tauri/entitlements.plist` defines the hardened-runtime exceptions the app needs.
- `scripts/notarize.sh` is a separate post-build step that submits the `.app` (or DMG) to Apple's notary service via `xcrun notarytool`, waits for approval, and staples the ticket.
- Apple credentials read from environment variables — never committed.

**Operator-side prerequisites (one-time, not Claude-doable):**
1. Apple Developer Program membership ($99/yr) at https://developer.apple.com/programs/enroll/
2. **Developer ID Application** certificate generated in Xcode → Settings → Accounts → Manage Certificates → "+" Developer ID Application. Cert lands in Login Keychain.
3. App-specific password at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords. Save the password somewhere safe.
4. Apple Team ID — appears at https://developer.apple.com/account → Membership.

**Out of scope:**
- Mac App Store distribution (different cert + sandbox model — separate phase)
- Sparkle / auto-update infrastructure (Phase 10+)
- Per-user code-signing on a CI server (operator-side dev only for Phase 9)

## Tasks

### A.1: Add hardened-runtime entitlements

`apps/dashboard/src-tauri/entitlements.plist` — minimal set for a Tauri 2 app:
- `com.apple.security.cs.allow-jit` (Vite + reqwest both want JIT)
- `com.apple.security.cs.allow-unsigned-executable-memory` (Stronghold linker requirements)
- `com.apple.security.network.client` (HTTP to Ollama + Google APIs)

### A.2: Update tauri.conf.json

Add `bundle.macOS.signingIdentity` (null) + `bundle.macOS.entitlements` (relative path to the new plist). When the operator sets `signingIdentity` to a real cert name, Tauri's bundler signs automatically.

### A.3: Document env vars + create scripts/notarize.sh

The script:
1. Validates `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` env vars are set
2. Submits the just-built DMG to Apple's notary service
3. Polls for completion (typical: 1-5 min)
4. On success, staples the ticket onto the DMG + the .app inside
5. Verifies with `spctl --assess`

### A.4: Update apps/dashboard/README.md

A "Distribution / signing" section explaining: how to set up the cert one-time, how to enable signing, how to run `notarize.sh`. So future-operator (or future-Claude in another session) doesn't have to re-read this plan.

## Verification

- [ ] Without env vars set: `npm run tauri build` still produces the same unsigned .app + .dmg as today
- [ ] Entitlements file parses (`/usr/libexec/PlistBuddy -c Print apps/dashboard/src-tauri/entitlements.plist` succeeds)
- [ ] `tauri.conf.json` still validates (`npm run tauri info` exits clean)
- [ ] **(Operator-only, requires real cert)** With `APPLE_SIGNING_IDENTITY` set, build produces a signed bundle (`codesign -dv` shows the cert)
- [ ] **(Operator-only)** `bash scripts/notarize.sh` round-trips successfully — final `spctl --assess` returns "accepted"
