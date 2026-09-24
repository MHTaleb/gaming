#!/usr/bin/env bash
# Downloads and extracts the Unity editor (user-space, no Hub required).
# Usage: scripts/install-unity-editor.sh [version] [changeset]
# Defaults: 6000.3.24f1 / 4e7b9b5b6244 (Unity 6.3 LTS, verified 2026-09-24).
#
# NOTE (verified 2026-09-24): the Unity 6.3 LINUX binary requires glibc >= 2.32.
# On Ubuntu 20.04/WSL (glibc 2.31) the editor will NOT start — use a Windows editor
# or upgrade the distro. See Documentation/DEVELOPMENT_SETUP.md §3.
set -euo pipefail

VERSION="${1:-6000.3.24f1}"
CHANGESET="${2:-4e7b9b5b6244}"

ROOT="$HOME/Unity"
DOWNLOADS="$ROOT/downloads"
TARGET="$ROOT/Hub/Editor/$VERSION"
ARCHIVE="$DOWNLOADS/Unity-$VERSION.tar.xz"
URL="https://download.unity3d.com/download_unity/$CHANGESET/LinuxEditorInstaller/Unity-$VERSION.tar.xz"

log() { printf '\033[36m[unity]\033[0m %s\n' "$1"; }

mkdir -p "$DOWNLOADS" "$TARGET"

if [ -x "$TARGET/Editor/Unity" ]; then
  log "editor already extracted: $TARGET/Editor/Unity"
else
  if [ ! -s "$ARCHIVE" ] || [ "$(stat -c %s "$ARCHIVE")" -lt 1000000000 ]; then
    log "downloading Unity $VERSION (~4.5 GB)…"
    curl -L --fail -o "$ARCHIVE" "$URL"
  else
    log "archive already present: $ARCHIVE"
  fi

  log "extracting (takes a few minutes)…"
  tar -xJf "$ARCHIVE" -C "$TARGET"
fi

if [ -x "$TARGET/Editor/Unity" ]; then
  log "OK: $TARGET/Editor/Unity"
  if "$TARGET/Editor/Unity" -batchmode -quit -nographics -logFile /tmp/gts-unity-run.log 2>&1; then
    log "editor starts."
  else
    if grep -q "GLIBC_2\." /tmp/gts-unity-run.log 2>/dev/null; then
      log "WARNING: editor cannot start on this distro (glibc too old for Unity 6.3)."
      log "         Use a Windows editor or Ubuntu 22.04+ — see Documentation/DEVELOPMENT_SETUP.md §3."
    else
      log "editor did not start cleanly — most likely license activation is pending:"
      log "  1) $TARGET/Editor/Unity -batchmode -quit -createManualActivationFile -logFile /tmp/act.log"
      log "  2) upload the .alf at https://license.unity3d.com/manual → download .ulf"
      log "  3) $TARGET/Editor/Unity -batchmode -quit -manualLicenseFile <file>.ulf -logFile /tmp/lic.log"
    fi
  fi
else
  log "extraction did not produce Editor/Unity — check the download/logs."
  exit 1
fi

log "Android Build Support (OpenJDK + SDK/NDK module payload URLs) and module layout notes: Documentation/DEVELOPMENT_SETUP.md §4."
