#!/usr/bin/env bash
set -euo pipefail

echo "=== npm install ==="
npm install

echo "=== Vite build ==="
npm run build

echo "=== Capacitor sync ==="
npx cap sync android

echo "=== Gradle assembleDebug ==="
cd android
./gradlew assembleDebug --no-daemon

echo "=== Done ==="
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
