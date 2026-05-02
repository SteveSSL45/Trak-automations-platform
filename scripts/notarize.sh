#!/usr/bin/env bash
# Submit the just-built .dmg to Apple's notary service, then staple the
# notarization ticket onto both the .dmg and the .app inside.
#
# Run AFTER `npm run tauri build` has completed and produced a signed bundle.
#
# One-time setup:
#   1. Apple Developer Program membership ($99/yr)
#   2. "Developer ID Application" cert in Login Keychain (Xcode → Accounts)
#   3. App-specific password from appleid.apple.com
#   4. Set tauri.conf.json's bundle.macOS.signingIdentity to your cert name
#      (e.g. "Developer ID Application: Your Name (TEAMID12)")
#
# Per-run env vars (export these in your shell, or paste a `.env` somewhere
# gitignored and `source` it):
#   APPLE_ID          your Apple ID email
#   APPLE_TEAM_ID     your team ID (10-char alphanumeric, see appleid.apple.com)
#   APPLE_APP_PASSWORD app-specific password from appleid.apple.com
#
# Anything you don't want in shell history can be stashed in macOS Keychain
# and looked up; for now we keep it simple.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_DIR="$REPO_ROOT/apps/dashboard/src-tauri/target/release/bundle"
DMG_PATH="$BUNDLE_DIR/dmg/Trak Automations_0.1.0_aarch64.dmg"
APP_PATH="$BUNDLE_DIR/macos/Trak Automations.app"

# --- Validate prerequisites -------------------------------------------------
missing=0
for var in APPLE_ID APPLE_TEAM_ID APPLE_APP_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    echo "Error: \$$var is not set." >&2
    missing=1
  fi
done
if [[ $missing -eq 1 ]]; then
  cat >&2 <<EOF

To run notarization you need:
  export APPLE_ID="you@example.com"
  export APPLE_TEAM_ID="ABCDE12345"
  export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # app-specific, NOT real Apple ID password

Get the app-specific password from https://appleid.apple.com → Sign-In and
Security → App-Specific Passwords.
EOF
  exit 2
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "Error: $DMG_PATH not found." >&2
  echo "Run 'npm run tauri build' from apps/dashboard/ first." >&2
  exit 2
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: $APP_PATH not found." >&2
  exit 2
fi

# --- Verify the .app is actually signed -------------------------------------
echo "Checking signature on .app …"
if ! codesign -dv --verbose=2 "$APP_PATH" 2>&1 | grep -q "Authority=Developer ID Application"; then
  cat >&2 <<EOF
Error: $APP_PATH is not signed with a Developer ID Application certificate.

Run: codesign -dv "$APP_PATH"  to inspect the current signature.

If it shows ad-hoc signing, set bundle.macOS.signingIdentity in
apps/dashboard/src-tauri/tauri.conf.json to your cert's full name:
  "signingIdentity": "Developer ID Application: Your Name (TEAMID12)"

Find your cert name with:
  security find-identity -v -p codesigning
EOF
  exit 2
fi
echo "  ✓ signature looks valid"

# --- Submit to Apple's notary service ---------------------------------------
echo "Submitting $DMG_PATH to Apple notary service …"
SUBMIT_OUT=$(xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --wait \
  --output-format json)

echo "$SUBMIT_OUT"
STATUS=$(echo "$SUBMIT_OUT" | grep -o '"status": *"[^"]*"' | head -1 | cut -d'"' -f4)
SUBMISSION_ID=$(echo "$SUBMIT_OUT" | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ "$STATUS" != "Accepted" ]]; then
  echo "Notarization status: $STATUS — fetching log …" >&2
  xcrun notarytool log "$SUBMISSION_ID" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" >&2
  exit 1
fi

# --- Staple the ticket ------------------------------------------------------
echo "Stapling notarization ticket onto .dmg …"
xcrun stapler staple "$DMG_PATH"

echo "Stapling notarization ticket onto .app …"
xcrun stapler staple "$APP_PATH"

# --- Final verification -----------------------------------------------------
echo "Verifying with spctl …"
spctl --assess --type execute --verbose=2 "$APP_PATH" || true
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG_PATH" || true

echo
echo "✓ Done. The .dmg can now be distributed and will open without"
echo "  Gatekeeper warnings on any Mac (offline, since the ticket is stapled)."
echo
echo "  $DMG_PATH"
