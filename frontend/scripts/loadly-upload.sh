#!/usr/bin/env bash
# Upload an Android APK to Loadly after a local Gradle release build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

FILE="${1:-}"

if [ -z "${LOADLY_API_KEY:-}" ] || [ -z "${LOADLY_USER_KEY:-}" ]; then
  echo "Loadly credentials are missing. Add LOADLY_API_KEY and LOADLY_USER_KEY to frontend/.env." >&2
  exit 1
fi
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "APK not found: ${FILE:-no file supplied}" >&2
  exit 1
fi

echo "Uploading $(basename "$FILE") to Loadly…"
RESPONSE="$(curl -sS -X POST https://api.loadly.io/apiv2/app/upload \
  -F "user_key=${LOADLY_USER_KEY}" \
  -F "_api_key=${LOADLY_API_KEY}" \
  -F "file=@${FILE}" \
  -F "buildInstallType=1")"

node -e '
  let response;
  try { response = JSON.parse(process.argv[1]); } catch {
    console.error("Loadly returned an invalid response."); process.exit(1);
  }
  const build = response.data || {};
  if (response.code !== 0 && response.code !== "0" && !build.buildShortcutUrl) {
    console.error("Loadly error: " + (response.message || JSON.stringify(response))); process.exit(1);
  }
  const url = build.buildShortcutUrl
    ? (build.buildShortcutUrl.startsWith("http") ? build.buildShortcutUrl : "https://i.loadly.io/" + build.buildShortcutUrl)
    : "(see Loadly dashboard)";
  console.log("\nUploaded to Loadly");
  console.log("Install: " + url);
  if (build.buildQRCodeURL) console.log("QR: " + build.buildQRCodeURL);
' "$RESPONSE"
