#!/usr/bin/env bash
# =============================================================================
#  Runs ON the remote run/test host (piped over ssh on stdin by deploy.sh).
#
#  Idempotent: re-running simply rewrites the managed files and reloads.
#  Nothing here touches the pre-existing "seo-agachi" site on port 80.
#
#  Inputs (environment variables, all pre-encoded as base64 by deploy.sh so
#  that newlines / $ / quotes in the values can never break quoting):
#     GAMES_SPEC_B64   newline-separated: name|dir|internal_port|public_port|label
#     AUTH_USER_B64    basic-auth username
#     AUTH_HASH_B64    apr1 hash (openssl passwd -apr1); empty = no auth
#     ENABLE_AUTH      1 or 0
#     REMOTE_REPO      absolute path of the git clone on this host
#
#  What it creates, per app:
#     /etc/systemd/system/gaming-<name>.service
#     /etc/nginx/sites-available/gaming-<name>  (+ symlink in sites-enabled)
#  ...plus one shared /etc/nginx/.htpasswd-gaming for basic auth.
# =============================================================================

set -euo pipefail

REMOTE_REPO="${REMOTE_REPO:-/home/gaming}"
ENABLE_AUTH="${ENABLE_AUTH:-1}"

NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"
HTPASSWD_FILE="/etc/nginx/.htpasswd-gaming"
UNIT_PREFIX="gaming-"

C_RESET=$'\033[0m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_BLU=$'\033[36m'
ok()   { printf '%s   ✔%s %s\n' "$C_GRN" "$C_RESET" "$*"; }
info() { printf '%s   ▶%s %s\n' "$C_BLU" "$C_RESET" "$*"; }
warn() { printf '%s   !%s %s\n' "$C_YEL" "$C_RESET" "$*" >&2; }

b64dec() { printf '%s' "${1:-}" | base64 -d; }

GAMES_SPEC="$(b64dec "${GAMES_SPEC_B64:-}")"
AUTH_USER="$(b64dec "${AUTH_USER_B64:-}")"
AUTH_HASH="$(b64dec "${AUTH_HASH_B64:-}")"
AUTH_USER="${AUTH_USER:-games}"

[[ -n "$GAMES_SPEC" ]] || { echo "GAMES_SPEC_B64 is required" >&2; exit 1; }

# ---------------------------------------------------------------- prerequisites
[[ -d "$REMOTE_REPO/.git" ]] || { echo "Not a git clone: $REMOTE_REPO" >&2; exit 1; }

NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || { echo "node is not installed on this host" >&2; exit 1; }
command -v nginx >/dev/null || { echo "nginx is not installed on this host" >&2; exit 1; }

info "node:  $NODE_BIN ($("$NODE_BIN" -v))"
info "nginx: $(nginx -v 2>&1 | sed 's/^nginx version: //')"

# ------------------------------------------------------------------- basic auth
if [[ "$ENABLE_AUTH" == "1" ]]; then
  if [[ -z "$AUTH_HASH" ]]; then
    echo "ENABLE_AUTH=1 but no password hash was supplied" >&2
    exit 1
  fi
  printf '%s:%s\n' "$AUTH_USER" "$AUTH_HASH" > "$HTPASSWD_FILE"
  chmod 640 "$HTPASSWD_FILE"
  chown root:www-data "$HTPASSWD_FILE" 2>/dev/null || true
  ok "basic auth enabled for user '$AUTH_USER' ($HTPASSWD_FILE)"
else
  rm -f "$HTPASSWD_FILE"
  warn "basic auth DISABLED — the games will be publicly readable"
fi

# ------------------------------------------------------------- systemd + nginx
NEW_SITES=()          # nginx site files created in this run
PUBLIC_PORTS=()       # ports we should make sure the firewall allows

cleanup_on_failure() {
  local status=$?
  if [[ $status -ne 0 && ${#NEW_SITES[@]} -gt 0 ]]; then
    warn "rolling back nginx config added by this run"
    for site in "${NEW_SITES[@]}"; do
      rm -f "$NGINX_ENABLED/$site" "$NGINX_AVAILABLE/$site"
    done
    nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
  fi
  exit $status
}
trap cleanup_on_failure EXIT

while IFS='|' read -r name dir internal_port public_port label; do
  [[ -z "${name//[[:space:]]/}" ]] && continue

  app_dir="$REMOTE_REPO/$dir"
  unit="gaming-$name.service"
  site="gaming-$name"

  [[ -d "$app_dir/www" ]] || { echo "Missing $app_dir/www — is $dir checked in?" >&2; exit 1; }
  [[ -f "$app_dir/tools/serve.js" ]] || { echo "Missing $app_dir/tools/serve.js" >&2; exit 1; }

  # --- app must never listen publicly; nginx owns the public port -------------
  if ! grep -q 'process.env.HOST' "$app_dir/tools/serve.js"; then
    echo "$dir/tools/serve.js does not support the HOST env var (needed to bind loopback)" >&2
    exit 1
  fi

  # --- systemd unit ----------------------------------------------------------
  cat > "/etc/systemd/system/$unit" <<UNIT
[Unit]
Description=Gaming staging: ${label} (static server, internal :${internal_port})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${app_dir}
Environment=PORT=${internal_port}
Environment=HOST=127.0.0.1
ExecStart=${NODE_BIN} ${app_dir}/tools/serve.js
Restart=always
RestartSec=2
User=root

[Install]
WantedBy=multi-user.target
UNIT
  ok "unit   /etc/systemd/system/$unit  (127.0.0.1:${internal_port})"

  # --- nginx site ------------------------------------------------------------
  cat > "$NGINX_AVAILABLE/$site" <<NGINX
# Managed by gaming/deploy — do not edit by hand; your changes are overwritten.
# Source: deploy/remote/provision.sh   App: ${label} (${name})
server {
    listen ${public_port};
    listen [::]:${public_port};

    server_name _;

    # Staging build for manual testing — keep it out of search indexes.
    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;

    $( [[ "$ENABLE_AUTH" == "1" ]] && printf 'auth_basic "Gaming staging";\n    auth_basic_user_file %s;' "$HTPASSWD_FILE" || true )

    access_log /var/log/nginx/${site}.access.log;
    error_log  /var/log/nginx/${site}.error.log;

    location / {
        proxy_pass http://127.0.0.1:${internal_port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
    }
}
NGINX
  ln -sfn "$NGINX_AVAILABLE/$site" "$NGINX_ENABLED/$site"
  NEW_SITES+=("$site")
  PUBLIC_PORTS+=("$public_port")
  ok "nginx  ${NGINX_ENABLED}/$site  (public :${public_port} -> 127.0.0.1:${internal_port})"

done <<< "$GAMES_SPEC"

systemctl daemon-reload
ok "systemd daemon-reload"

# Fail loudly, and roll back, rather than leaving nginx broken.
if ! nginx -t; then
  echo "nginx config test failed — see above" >&2
  exit 1
fi

# --------------------------------------------------------------- enable + start
while IFS='|' read -r name dir internal_port public_port label; do
  [[ -z "${name//[[:space:]]/}" ]] && continue
  systemctl enable --now "gaming-$name.service" >/dev/null 2>&1 || true
done <<< "$GAMES_SPEC"
ok "services enabled (auto-start on boot)"

systemctl reload nginx
ok "nginx reloaded"

# ------------------------------------------------------------------- firewall
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  for p in "${PUBLIC_PORTS[@]}"; do
    if ufw status | grep -q "^$p/tcp"; then
      ok "ufw: $p/tcp already allowed"
    else
      ufw allow "$p/tcp" >/dev/null
      ok "ufw: allowed $p/tcp"
    fi
  done
else
  info "ufw is not active — no local firewall rules to add"
  warn "if a cloud firewall (Hetzner/DO/AWS) is in front of this host, open the ports above there too"
fi

trap - EXIT
echo ""
ok "provisioning complete"
