#!/usr/bin/env bash
#
# =============================================================================
#  Gaming — staging deploy: this laptop builds, the remote host runs
# =============================================================================
#
#   LAPTOP (here, the build workspace)      REMOTE "openclaw" (run + test space)
#   ----------------------------------      ------------------------------------
#   edit code                               /home/gaming          git clone
#   ./deploy/deploy.sh            ──ssh──▶  git pull origin/main
#                                           systemd: gaming-<app>  127.0.0.1:<internal>
#                                           nginx:   public :8081/:8082 + basic auth
#                                           ──▶ open http://<host>:8081/ in a browser
#
#  Usage
#     ./deploy/deploy.sh                      interactive: pick app(s), push, deploy
#     ./deploy/deploy.sh --apps=neon-stack    deploy one app
#     ./deploy/deploy.sh --apps=all --yes     deploy everything unattended
#     ./deploy/deploy.sh status               what is running / reachable
#     ./deploy/deploy.sh logs neon-stack      tail that app's journal
#     ./deploy/deploy.sh restart --apps=all
#     ./deploy/deploy.sh stop --apps=all
#     ./deploy/deploy.sh provision            (re)install remote units + nginx only
#     ./deploy/deploy.sh unprovision          remove remote units + nginx blocks
#     ./deploy/deploy.sh --reset-auth         set a new basic-auth password
#
#  Flags
#     --host=<ssh alias>   remote target          (default: openclaw)
#     --apps=<list>        names or numbers, or "all"
#     --yes / -y           assume yes on confirmations
#     --no-push            skip git push (deploy whatever is already on origin)
#     --clean              also run `git clean -fdx` on the remote
#     --no-auth            provision without basic auth (public)
#     --reset-auth         forget the stored password hash and prompt again
#
#  Files: deploy/apps.conf (app+port manifest), deploy/remote/provision.sh
#  Local secret: .deploy.local (hash only, gitignored, mode 600)
# =============================================================================

set -euo pipefail

# ------------------------------------------------------------------- constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APPS_CONF="${APPS_CONF:-$SCRIPT_DIR/apps.conf}"
PROVISION_SCRIPT="$SCRIPT_DIR/remote/provision.sh"
STATE_FILE="$REPO_ROOT/.deploy.local"

DEPLOY_HOST="${DEPLOY_HOST:-openclaw}"
REMOTE_REPO="${REMOTE_REPO:-/home/gaming}"

COMMAND="deploy"
APP_FILTER=""
LOGS_APP=""
ASSUME_YES=0
DO_PUSH=1
DO_CLEAN=0
AUTH_ENABLED=1
RESET_AUTH=0

# ---------------------------------------------------------------------- output
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_BLU=$'\033[36m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""
fi

info() { printf '%s▶%s %s\n' "$C_BLU" "$C_RESET" "$*"; }
ok()   { printf '%s✔%s %s\n' "$C_GRN" "$C_RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YEL" "$C_RESET" "$*" >&2; }
die()  { printf '%s✘%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

usage() {
  # Print the header comment block: everything after the shebang, stopped at
  # the first line of real code.
  awk 'NR==1 { next } /^set / { exit } { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

# ------------------------------------------------------------------ arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    deploy|status|logs|restart|stop|provision|unprovision)
      COMMAND="$1"; shift ;;
    -h|--help|help)
      usage; exit 0 ;;
    --apps=*)   APP_FILTER="${1#*=}"; shift ;;
    --apps)     APP_FILTER="${2:-}"; shift; if (($#)); then shift; fi ;;
    --host=*)   DEPLOY_HOST="${1#*=}"; shift ;;
    --host)     DEPLOY_HOST="${2:-}"; shift; if (($#)); then shift; fi ;;
    -y|--yes)   ASSUME_YES=1; shift ;;
    --no-push)  DO_PUSH=0; shift ;;
    --clean)    DO_CLEAN=1; shift ;;
    --no-auth)  AUTH_ENABLED=0; shift ;;
    --reset-auth) RESET_AUTH=1; shift ;;
    --) shift; break ;;
    -*) die "Unknown flag: $1  (try --help)" ;;
    *)  LOGS_APP="$1"; shift ;;
  esac
done

# ------------------------------------------------------------- app manifest
APP_NAMES=(); APP_DIRS=(); APP_INTERNAL=(); APP_PUBLIC=(); APP_LABELS=(); APP_RELAY=()
SELECTED=()

load_apps() {
  [[ -f "$APPS_CONF" ]] || die "Missing app manifest: $APPS_CONF"
  local line name dir iport pport label relay pad
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    [[ -z "${line//[[:space:]]/}" ]] && continue
    # The relay port is optional, so an old five-field line must keep working.
    # Without a placeholder, bash assigns the whole remainder to the last
    # variable and the label becomes "Packet Defense | 9083".
    IFS='|' read -r name dir iport pport label relay <<< "$line"
    pad=$' \t'
    name="${name//[$pad]/}"; dir="${dir//[$pad]/}"
    iport="${iport//[$pad]/}"; pport="${pport//[$pad]/}"
    relay="${relay//[$pad]/}"
    label="${label#"${label%%[![:space:]]*}"}"
    label="${label%"${label##*[![:space:]]}"}"
    [[ -n "$name" && -n "$dir" && -n "$iport" && -n "$pport" ]] || continue
    APP_NAMES+=("$name"); APP_DIRS+=("$dir")
    APP_INTERNAL+=("$iport"); APP_PUBLIC+=("$pport")
    APP_LABELS+=("${label:-$name}"); APP_RELAY+=("$relay")
  done < "$APPS_CONF"
  ((${#APP_NAMES[@]})) || die "No apps defined in $APPS_CONF"
}

app_index() {
  local needle="$1" i
  for i in "${!APP_NAMES[@]}"; do
    if [[ "${APP_NAMES[$i]}" == "$needle" ]]; then printf '%s' "$i"; return 0; fi
  done
  return 1
}

add_index() {
  local idx="$1" existing
  for existing in ${SELECTED[@]+"${SELECTED[@]}"}; do
    [[ "$existing" == "$idx" ]] && return 0
  done
  SELECTED+=("$idx")
}

interactive_select() {
  echo ""
  printf '%sWhich app(s) should run on %s?%s\n' "$C_BOLD" "$DEPLOY_HOST" "$C_RESET"
  local i
  for i in "${!APP_NAMES[@]}"; do
    printf '   %s%d)%s %-16s %s%s  ->  http://%s:%s/%s\n' \
      "$C_BOLD" "$((i + 1))" "$C_RESET" "${APP_LABELS[$i]}" \
      "$C_DIM" "${APP_DIRS[$i]}" "$PUBLIC_HOST" "${APP_PUBLIC[$i]}" "$C_RESET"
  done
  printf '   %sa)%s all\n\n' "$C_BOLD" "$C_RESET"
  local reply=""
  if [[ -t 0 ]]; then
    read -r -p "Select [a]: " reply || reply=""
  fi
  reply="${reply//[[:space:]]/}"
  [[ -z "$reply" ]] && reply="a"
  APP_FILTER="$reply"
  resolve_selection
}

resolve_selection() {
  SELECTED=()
  local input="${APP_FILTER//[[:space:]]/}"
  if [[ -z "$input" ]]; then
    if [[ "$PROMPT_DEFAULT" == "1" && -t 0 ]]; then
      interactive_select
    else
      SELECTED=("${!APP_NAMES[@]}")
    fi
    return 0
  fi
  if [[ "$input" == "all" || "$input" == "*" ]]; then
    SELECTED=("${!APP_NAMES[@]}")
    return 0
  fi
  local IFS=',' token idx
  for token in $input; do
    [[ -z "$token" ]] && continue
    if [[ "$token" =~ ^[0-9]+$ ]]; then
      idx=$((token - 1))
      ((idx >= 0 && idx < ${#APP_NAMES[@]})) || die "No app number $token (see deploy/apps.conf)"
    else
      idx="$(app_index "$token")" || die "Unknown app '$token'. Known: ${APP_NAMES[*]}"
    fi
    add_index "$idx"
  done
}

build_spec() {
  local i out=""
  for i in ${SELECTED[@]+"${SELECTED[@]}"}; do
    out+="${APP_NAMES[$i]}|${APP_DIRS[$i]}|${APP_INTERNAL[$i]}|${APP_PUBLIC[$i]}|${APP_LABELS[$i]}|${APP_RELAY[$i]}"$'\n'
  done
  printf '%s' "$out"
}

# ------------------------------------------------------------------ credentials
load_state() {
  AUTH_USER="${DEPLOY_AUTH_USER:-games}"
  AUTH_HASH="${DEPLOY_AUTH_HASH:-}"
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
  fi
}

ensure_auth() {
  [[ "$AUTH_ENABLED" == "1" ]] || { warn "basic auth disabled (--no-auth)"; return 0; }
  [[ "$RESET_AUTH" == "1" ]] && AUTH_HASH=""
  if [[ -n "$AUTH_HASH" ]]; then
    ok "credentials for '${AUTH_USER}' loaded from .deploy.local"
    return 0
  fi
  [[ -t 0 ]] || die "No stored password hash and no terminal to prompt on.
    Run ./deploy/deploy.sh --reset-auth from an interactive terminal first."

  local user="" pass="" confirm="" generated=0
  read -r -p "Basic-auth username [${AUTH_USER}]: " user || user=""
  AUTH_USER="${user:-$AUTH_USER}"
  while :; do
    printf 'Basic-auth password (Enter alone = generate a strong one): '
    read -r -s pass || pass=""
    echo ""
    if [[ -z "$pass" ]]; then
      pass="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-20)"
      generated=1
      break
    fi
    if ((${#pass} < 8)); then warn "Please use at least 8 characters."; continue; fi
    printf 'Confirm password: '
    read -r -s confirm || confirm=""
    echo ""
    if [[ "$pass" != "$confirm" ]]; then warn "Passwords did not match."; continue; fi
    break
  done
  command -v openssl >/dev/null || die "openssl is required to hash the password"
  AUTH_HASH="$(openssl passwd -apr1 "$pass")"
  printf 'AUTH_USER=%q\nAUTH_HASH=%q\n' "$AUTH_USER" "$AUTH_HASH" > "$STATE_FILE"
  chmod 600 "$STATE_FILE"
  ok "saved hash (not the password) to .deploy.local, mode 600"
  if [[ "$generated" == "1" ]]; then
    printf '\n%s    username: %s\n    password: %s%s\n\n' "$C_BOLD" "$AUTH_USER" "$pass" "$C_RESET"
    warn "Copy that password now — it is not stored anywhere."
  fi
  unset pass confirm
}

# ----------------------------------------------------------------------- local
local_branch() {
  BRANCH="${DEPLOY_BRANCH:-$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)}"
  [[ "$BRANCH" != "HEAD" ]] || die "Detached HEAD — check out a branch before deploying."
}

push_code() {
  git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "$REPO_ROOT is not a git repository"
  local dirty
  dirty="$(git -C "$REPO_ROOT" status --porcelain)"
  if [[ -n "$dirty" ]]; then
    warn "Uncommitted changes present — they will NOT be deployed (remote pulls origin/${BRANCH})."
    printf '%s\n' "$dirty" | sed 's/^/     /'
    if [[ "$ASSUME_YES" != "1" ]]; then
      local reply=""
      read -r -p "Deploy committed code only? [y/N] " reply || reply="n"
      [[ "$reply" =~ ^[Yy] ]] || die "Aborted — commit first, or use --yes to proceed anyway."
    fi
  fi
  info "pushing ${BRANCH} to origin"
  git -C "$REPO_ROOT" push origin "$BRANCH"
  git -C "$REPO_ROOT" fetch --quiet origin
  local local_sha remote_sha
  local_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  remote_sha="$(git -C "$REPO_ROOT" rev-parse "origin/$BRANCH")"
  [[ "$local_sha" == "$remote_sha" ]] ||
    die "origin/${BRANCH} is ${remote_sha:0:7} but local HEAD is ${local_sha:0:7}.
    The push did not land — refusing to deploy stale code."
  ok "origin/${BRANCH} @ ${local_sha:0:7}"
  EXPECTED_SHA="$local_sha"
}

# ---------------------------------------------------------------------- remote
remote_sync() {
  info "remote: git pull in ${REMOTE_REPO} (${BRANCH})"
  ssh "$DEPLOY_HOST" "REMOTE_REPO=$(printf '%q' "$REMOTE_REPO") BRANCH=$(printf '%q' "$BRANCH") DO_CLEAN=$DO_CLEAN bash -s" <<'REMOTE_EOF'
set -euo pipefail
cd "$REMOTE_REPO"
git fetch --prune --quiet origin
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout --quiet "$BRANCH"
else
  git checkout --quiet -b "$BRANCH" "origin/$BRANCH"
fi
git reset --hard --quiet "origin/$BRANCH"
if [ "$DO_CLEAN" = "1" ]; then
  git clean -fdxq
  echo "   cleaned untracked + ignored files"
fi
echo "   remote HEAD: $(git --no-pager log --oneline -1)"
REMOTE_EOF

  local remote_sha
  remote_sha="$(ssh "$DEPLOY_HOST" "git -C $(printf '%q' "$REMOTE_REPO") rev-parse HEAD")"
  if [[ "$remote_sha" == "$EXPECTED_SHA" ]]; then
    ok "remote is on ${remote_sha:0:7} — matches local HEAD"
  else
    warn "remote HEAD ${remote_sha:0:7} != local ${EXPECTED_SHA:0:7}"
  fi
}

remote_provision() {
  local spec spec_b64 user_b64 hash_b64
  spec="$(build_spec)"
  spec_b64="$(printf '%s' "$spec" | base64 -w0)"
  user_b64="$(printf '%s' "$AUTH_USER" | base64 -w0)"
  hash_b64="$(printf '%s' "${AUTH_HASH:-}" | base64 -w0)"
  info "remote: provisioning units + nginx"
  ssh "$DEPLOY_HOST" \
    "GAMES_SPEC_B64='$spec_b64' AUTH_USER_B64='$user_b64' AUTH_HASH_B64='$hash_b64' ENABLE_AUTH=$AUTH_ENABLED REMOTE_REPO=$(printf '%q' "$REMOTE_REPO") bash -s" \
    < "$PROVISION_SCRIPT"
}

remote_restart() {
  local units="" i
  for i in ${SELECTED[@]+"${SELECTED[@]}"}; do
    units+="gaming-${APP_NAMES[$i]}.service "
    # The relay is restarted too, but only if the app declares one - and a
    # restart drops every battle in progress, which is why it is its own unit
    # rather than sharing the static server's lifecycle.
    [[ -n "${APP_RELAY[$i]}" ]] && units+="gaming-${APP_NAMES[$i]}-relay.service "
  done
  info "remote: restarting ${units}"
  ssh "$DEPLOY_HOST" "bash -s" <<REMOTE_EOF
set -u
failed=0
for unit in $units; do
  if systemctl restart "\$unit"; then
    printf '   ✔ %s restarted\n' "\$unit"
  else
    printf '   ✘ %s FAILED to restart\n' "\$unit" >&2
    failed=1
  fi
done
exit \$failed
REMOTE_EOF
}

remote_health() {
  local triples="" i
  for i in ${SELECTED[@]+"${SELECTED[@]}"}; do
    triples+="${APP_NAMES[$i]}:${APP_INTERNAL[$i]}:${APP_PUBLIC[$i]} "
  done
  info "remote: health check"
  ssh "$DEPLOY_HOST" "bash -s" <<REMOTE_EOF
set -u
printf '   %-16s %-10s %-6s %-6s\n' APP SERVICE APP EDGE
for triple in $triples; do
  name="\${triple%%:*}"; rest="\${triple#*:}"
  internal="\${rest%%:*}"; public="\${rest##*:}"
  state=\$(systemctl is-active "gaming-\$name.service" 2>/dev/null || true)
  app_code=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:\$internal/" || echo 000)
  edge_code=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:\$public/" || echo 000)
  printf '   %-16s %-10s %-6s %-6s\n' "\$name" "\$state" "\$app_code" "\$edge_code"
done
echo "   (app_code 200 = static server OK; edge_code 401 = nginx up with auth, 200 = nginx up, no auth)"
REMOTE_EOF
}

remote_status() {
  ssh "$DEPLOY_HOST" "bash -s" <<'REMOTE_EOF'
set -u
echo "   --- systemd ---"
for unit in $(systemctl list-units --type=service --all --no-legend 'gaming-*.service' 2>/dev/null | awk '{print $1}'); do
  printf '   %-32s %s\n' "$unit" "$(systemctl is-active "$unit")"
done
echo "   --- nginx sites ---"
ls -1 /etc/nginx/sites-enabled/ 2>/dev/null | grep '^gaming-' | sed 's/^/   /' || echo "   (none)"
echo "   --- listening ---"
ss -ltnp 2>/dev/null | awk 'NR==1 || /:(80|8081|8082|9081|9082|3001) /' | sed 's/^/   /'
REMOTE_EOF
}

remote_logs() {
  local app="${LOGS_APP:-}"
  [[ -z "$app" && ${#SELECTED[@]} -eq 1 ]] && app="${APP_NAMES[${SELECTED[0]}]}"
  [[ -n "$app" ]] || die "Specify an app: ./deploy/deploy.sh logs <app>"
  app_index "$app" >/dev/null || die "Unknown app '$app'. Known: ${APP_NAMES[*]}"
  info "remote: journalctl -u gaming-${app}.service"
  ssh "$DEPLOY_HOST" "journalctl -u gaming-${app}.service -n 60 --no-pager"
}

remote_stop() {
  local units="" i
  for i in ${SELECTED[@]+"${SELECTED[@]}"}; do
    units+="gaming-${APP_NAMES[$i]}.service "
    [[ -n "${APP_RELAY[$i]}" ]] && units+="gaming-${APP_NAMES[$i]}-relay.service "
  done
  info "remote: stopping ${units}"
  ssh "$DEPLOY_HOST" "bash -s" <<REMOTE_EOF
set -u
for unit in $units; do
  systemctl stop "\$unit" && printf '   ✔ %s stopped\n' "\$unit"
done
REMOTE_EOF
}

remote_unprovision() {
  local names="" i
  for i in ${SELECTED[@]+"${SELECTED[@]}"}; do
    names+="${APP_NAMES[$i]} "
  done
  [[ "$ASSUME_YES" == "1" ]] || {
    local reply=""
    read -r -p "Remove systemd units + nginx blocks for: ${names}? [y/N] " reply || reply="n"
    [[ "$reply" =~ ^[Yy] ]] || die "Aborted."
  }
  ssh "$DEPLOY_HOST" "bash -s" <<REMOTE_EOF
set -u
for name in $names; do
  systemctl disable --now "gaming-\$name.service" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/gaming-\$name.service"
  systemctl disable --now "gaming-\$name-relay.service" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/gaming-\$name-relay.service"
  rm -f "/etc/nginx/sites-enabled/gaming-\$name" "/etc/nginx/sites-available/gaming-\$name"
  printf '   ✔ removed gaming-%s\n' "\$name"
done
systemctl daemon-reload
nginx -t && systemctl reload nginx && echo "   ✔ nginx reloaded"
REMOTE_EOF
}

# ------------------------------------------------------------ public reachability
public_host() {
  local h
  h="$(ssh -G "$DEPLOY_HOST" 2>/dev/null | awk 'tolower($1)=="hostname"{print $2; exit}')"
  printf '%s' "${h:-$DEPLOY_HOST}"
}

local_check() {
  local i code url expected
  expected=$([[ "$AUTH_ENABLED" == "1" ]] && echo 401 || echo 200)
  info "verifying from this laptop (expected HTTP ${expected})"
  for i in ${SELECTED[@]+"${SELECTED[@]}"}; do
    url="http://${PUBLIC_HOST}:${APP_PUBLIC[$i]}/"
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$url" 2>/dev/null || echo 000)"
    if [[ "$code" == "$expected" ]]; then
      ok "${APP_LABELS[$i]}  ${url}  [${code}]"
    elif [[ "$code" == "000" ]]; then
      warn "${APP_LABELS[$i]}  ${url}  [unreachable] — check the cloud firewall / security group for port ${APP_PUBLIC[$i]}"
    else
      warn "${APP_LABELS[$i]}  ${url}  [${code}] — expected ${expected}"
    fi
  done
}

summary() {
  echo ""
  printf '%s%s%s\n' "$C_BOLD" "──────────────────────────────────────────────────────────────" "$C_RESET"
  [[ "$AUTH_ENABLED" == "1" ]] && printf '  credentials: %s%s%s  (change with --reset-auth)\n' "$C_BOLD" "$AUTH_USER" "$C_RESET"
  local i
  for i in ${SELECTED[@]+"${SELECTED[@]}"}; do
    printf '  %-16s %shttp://%s:%s/%s\n' "${APP_LABELS[$i]}" "$C_BLU" "$PUBLIC_HOST" "${APP_PUBLIC[$i]}" "$C_RESET"
  done
  printf '  %slogs: ./deploy/deploy.sh logs <app>   stop: ./deploy/deploy.sh stop%s\n' "$C_DIM" "$C_RESET"
  printf '%s%s%s\n' "$C_BOLD" "──────────────────────────────────────────────────────────────" "$C_RESET"
}

# ------------------------------------------------------------------------ main
main() {
  command -v ssh >/dev/null || die "ssh is required"
  load_apps
  PUBLIC_HOST="$(public_host)"

  case "$COMMAND" in
    deploy|restart) PROMPT_DEFAULT=1 ;;
    *)              PROMPT_DEFAULT=0 ;;
  esac

  case "$COMMAND" in
    logs) if [[ -z "$APP_FILTER" && -n "$LOGS_APP" ]]; then APP_FILTER="$LOGS_APP"; fi ;;
  esac

  local_branch
  resolve_selection
  ((${#SELECTED[@]})) || die "No apps selected."
  EXPECTED_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "")"

  # Provisioning (and therefore credentials) is needed for the config commands.
  case "$COMMAND" in
    deploy|provision) load_state; ensure_auth ;;
    *)                load_state ;;
  esac

  info "host ${DEPLOY_HOST} (${PUBLIC_HOST}) · branch ${BRANCH} · apps: $(for i in "${SELECTED[@]}"; do printf '%s ' "${APP_NAMES[$i]}"; done)"

  case "$COMMAND" in
    deploy)
      if [[ "$DO_PUSH" == "1" ]]; then push_code; else ok "skipping push (--no-push)"; fi
      remote_sync
      remote_provision
      remote_restart
      remote_health
      local_check
      summary
      ;;
    provision)
      remote_provision
      summary
      ;;
    restart)
      remote_restart
      remote_health
      summary
      ;;
    status)
      remote_status
      remote_health
      ;;
    logs)
      remote_logs
      ;;
    stop)
      remote_stop
      ;;
    unprovision)
      remote_unprovision
      ;;
    *)
      die "Unknown command: $COMMAND" ;;
  esac
}

main "$@"
