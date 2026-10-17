#!/usr/bin/env bash
# Builds the web preview: client app at /, coach app at /coach-app. Used by Vercel (vercel.json).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/dist"
(cd "$ROOT/apps/client" && EXPO_PUBLIC_COACH_URL=/coach-app npx expo export --platform web --output-dir "$ROOT/dist")
(cd "$ROOT/apps/coach" && EXPO_BASE_URL=/coach-app EXPO_PUBLIC_CLIENT_URL=/ npx expo export --platform web --output-dir "$ROOT/dist/coach-app")
