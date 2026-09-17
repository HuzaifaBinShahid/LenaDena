#!/usr/bin/env bash
# Regenerate Android, make a release APK, then upload it to Loadly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"

if [ ! -d "$SDK_DIR" ]; then
  echo "Android SDK not found. Set ANDROID_HOME to your Android SDK path, then try again." >&2
  exit 1
fi

cd "$ROOT"
pnpm exec expo prebuild --platform android --no-install
printf 'sdk.dir=%s\n' "$SDK_DIR" > android/local.properties

cd android
./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a

cd "$ROOT"
bash ./scripts/loadly-upload.sh android/app/build/outputs/apk/release/app-release.apk
