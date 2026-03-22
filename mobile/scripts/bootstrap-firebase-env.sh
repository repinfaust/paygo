#!/usr/bin/env bash
set -euo pipefail

PLIST_PATH="${1:-/Users/davidloake/Library/Mobile Documents/com~apple~CloudDocs/Downloads/GoogleService-Info(2).plist}"
OUT_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"

if [[ ! -f "$PLIST_PATH" ]]; then
  echo "plist not found: $PLIST_PATH"
  exit 1
fi

API_KEY=$(plutil -extract API_KEY raw -o - "$PLIST_PATH")
PROJECT_ID=$(plutil -extract PROJECT_ID raw -o - "$PLIST_PATH")
STORAGE_BUCKET=$(plutil -extract STORAGE_BUCKET raw -o - "$PLIST_PATH")
APP_ID=$(plutil -extract GOOGLE_APP_ID raw -o - "$PLIST_PATH")
SENDER_ID=$(plutil -extract GCM_SENDER_ID raw -o - "$PLIST_PATH")

cat > "$OUT_FILE" <<ENV
EXPO_PUBLIC_FIREBASE_API_KEY=$API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=${PROJECT_ID}.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=$PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=$STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_APP_ID=$APP_ID
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$SENDER_ID
ENV

echo "Wrote $OUT_FILE"
