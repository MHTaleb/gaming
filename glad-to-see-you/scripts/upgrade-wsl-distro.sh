#!/usr/bin/env bash
# upgrade-wsl-distro.sh — guided in-place Ubuntu 20.04 → 22.04 upgrade for this WSL distro.
#
# WHY: the installed Unity 6000.3 editor needs glibc >= 2.32; Ubuntu 20.04 has 2.31 (VERIFIED
# 2026-09-24), so the editor cannot start. Ubuntu 22.04 ships glibc 2.35 → the already-installed
# editor becomes runnable (WSLg is present: DISPLAY=:0).
#
# A HUMAN RUNS THIS SCRIPT — it calls sudo and YOU type your password. Default mode is read-only.
#
# Usage:
#   scripts/upgrade-wsl-distro.sh --check     # pre-flight + plan, changes nothing (default)
#   scripts/upgrade-wsl-distro.sh --execute   # run the upgrade (sudo prompts for YOUR password)
#   scripts/upgrade-wsl-distro.sh --verify    # after WSL restart: confirm the result
#
# Reference: Documentation/DEVELOPMENT_SETUP.md §3
set -u

MODE="check"
case "${1:-}" in
  --execute) MODE="execute" ;;
  --verify)  MODE="verify" ;;
  --check|""|-h|--help) MODE="check" ;;
  *) echo "unknown flag: $1 (use --execute / --verify)"; exit 2 ;;
esac

log()  { printf '\033[36m[distro]\033[0m %s\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }

glibc_version() { ldd --version | head -1 | awk '{print $NF}'; }

# true when the installed glibc is >= 2.32 (sort -V puts the smaller version first)
glibc_ok() { [ "$(printf '%s\n2.32\n' "$(glibc_version)" | sort -V | head -1)" = "2.32" ]; }

# best-effort distro label for the Windows-side backup/restart commands
distro_name() {
  local n
  n="$(command -v wsl.exe >/dev/null 2>&1 && wsl.exe -l -v 2>/dev/null | tr -d '\0\r' | sed -n 's/^\* *//p' | awk '{print $1}')"
  echo "${n:-Ubuntu-20.04}"
}

if [ "$MODE" = "verify" ]; then
  echo "== post-upgrade verification =="
  lsb_release -ds 2>/dev/null
  echo "glibc: $(glibc_version)"
  if glibc_ok; then
    ok "glibc >= 2.32 — the Unity editor can now run on this distro."
    echo
    log "next steps (Documentation/DEVELOPMENT_SETUP.md §3):"
    echo "  1) one-time license activation (.alf -> https://license.unity3d.com/manual -> .ulf), then"
    echo "  2) open the project:  ~/Unity/Hub/Editor/6000.3.24f1/Editor/Unity -projectPath ~/workspace/gaming/glad-to-see-you"
    echo "  3) re-run scripts/check-environment.sh — expect 'editor process starts'."
  else
    bad "still glibc < 2.32. If the upgrade ran, restart the distro first (from Windows):"
    echo "      wsl.exe --terminate $(distro_name)"
    exit 1
  fi
  exit 0
fi

echo "== glad-to-see-you: WSL distro upgrade (Ubuntu 20.04 -> 22.04) =="
FAIL=0

grep -qi microsoft /proc/version && ok "running inside WSL" || { bad "not WSL — this script targets the WSL distro"; FAIL=1; }

log "current: $(lsb_release -ds 2>/dev/null || echo unknown) — glibc $(glibc_version)"
if glibc_ok; then
  ok "glibc already >= 2.32 — upgrade not needed."
  exit 0
fi

if lsb_release -cs 2>/dev/null | grep -qx focal; then
  ok "codename focal (20.04) — in-place path is 22.04 'jammy' (glibc 2.35)"
else
  warn "not Ubuntu 20.04 (focal) — review Ubuntu release-upgrade docs for your version"
fi

command -v do-release-upgrade >/dev/null 2>&1 && ok "do-release-upgrade present" || { bad "do-release-upgrade missing (sudo apt install update-manager-core)"; FAIL=1; }
dpkg -s update-manager-core >/dev/null 2>&1 && ok "update-manager-core installed" || warn "update-manager-core missing — --execute installs it"

PROMPT_SETTING="$(grep -h '^Prompt=' /etc/update-manager/release-upgrades 2>/dev/null | tail -1)"
if [ "$PROMPT_SETTING" = "Prompt=lts" ]; then
  ok "release-upgrades: Prompt=lts (upgrades allowed)"
else
  warn "release-upgrades: '${PROMPT_SETTING:-<unset>}' — do-release-upgrade would refuse; --execute sets it to Prompt=lts"
fi

THIRD_PARTY="$(grep -rHv '^#\|^$' /etc/apt/sources.list /etc/apt/sources.list.d/ 2>/dev/null | grep -v 'ubuntu.com\|security.ubuntu.com' | head -4 || true)"
if [ -z "$THIRD_PARTY" ]; then
  ok "no third-party apt sources"
else
  warn "third-party apt sources present — the upgrader will ask to disable them:"
  echo "$THIRD_PARTY" | sed 's/^/      /'
fi

FREE_GB="$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')"
if [ "${FREE_GB:-0}" -ge 8 ]; then ok "disk free: ${FREE_GB} GB"; else bad "disk free: ${FREE_GB:-0} GB (need >= 8 GB)"; FAIL=1; fi

if curl -sI --max-time 8 http://archive.ubuntu.com/ubuntu/ 2>/dev/null | head -1 | grep -q '200'; then
  ok "archive.ubuntu.com reachable"
else
  bad "archive.ubuntu.com unreachable — fix networking first"; FAIL=1
fi

echo
warn "BACK UP FIRST — from Windows PowerShell/CMD:"
echo "      wsl.exe --export $(distro_name) D:\\wsl-backup-$(date +%Y%m%d).tar"
echo "      (repo is already pushed to origin; ~/Unity and ~/apps are re-downloadable via scripts/)"

echo
log "what --execute runs (you type your sudo password there):"
cat <<'PLAN'
  1  sudo apt update
  2  sudo apt full-upgrade -y     # bring 20.04 fully current first
  3  sudo apt install -y update-manager-core screen
  4  sudo sed -i 's/^Prompt=.*/Prompt=lts/' /etc/update-manager/release-upgrades
  5  sudo do-release-upgrade      # the actual upgrade, ~30-90 min, interactive
PLAN

if [ "$MODE" != "execute" ]; then
  echo
  log "read-only mode: nothing was changed. Re-run with --execute when ready (or do the steps manually)."
  [ "$FAIL" -eq 0 ] && exit 0 || exit 1
fi

[ "$FAIL" -eq 0 ] || { bad "pre-flight failed — fix the items above first."; exit 1; }

echo
warn "This modifies the distro. Keep this terminal open until it finishes."
printf 'Type "upgrade" to continue: '
read -r ANSWER
[ "$ANSWER" = "upgrade" ] || { log "aborted — nothing changed."; exit 1; }

set -e
log "step 1/5: apt update";           sudo apt update
log "step 2/5: apt full-upgrade";     sudo apt full-upgrade -y
log "step 3/5: install tooling";      sudo apt install -y update-manager-core screen
log "step 4/5: enable LTS upgrades";  sudo sed -i 's/^Prompt=.*/Prompt=lts/' /etc/update-manager/release-upgrades
set +e

log "step 5/5: do-release-upgrade — answer 'y' to its prompts; accepting defaults elsewhere is fine on WSL"
sudo do-release-upgrade
UPGRADE_RC=$?

echo
if [ "$UPGRADE_RC" -ne 0 ]; then
  warn "do-release-upgrade exited with code $UPGRADE_RC (aborted or failed) — review its output above."
fi
log "restart the distro so the new libraries load:"
echo "      from Windows:  wsl.exe --terminate $(distro_name)"
echo "      then re-open this project in VS Code and run:  scripts/upgrade-wsl-distro.sh --verify"
exit "$UPGRADE_RC"
