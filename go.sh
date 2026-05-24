#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  ./go.sh                         Build and deploy KVM Portal to the PiKVM extra path.
  ./go.sh --deploy                Same as default.
  ./go.sh --bootstrap-agent-browser
                                  Open KVM Portal and log in through its auth UI.
  ./go.sh --scribe-token          Print an ElevenLabs Scribe single-use token.
  ./go.sh --stop-temp             Stop and clean the old temporary PiKVM HTTP server.

Environment:
  Project secrets are read from .env.
  See .env.example for required variables.
  KVM_PORTAL_SSH_HOST optionally overrides the SSH target. Defaults to the host from PIKVM_URL.
EOF
}

load_env() {
    if [[ ! -f .env ]]; then
        echo "Missing .env. Create one from .env.example." >&2
        exit 1
    fi

    set -a
    # shellcheck disable=SC1091
    source .env
    set +a

    : "${PIKVM_URL:?PIKVM_URL is required in .env}"
    : "${PIKVM_USERNAME:?PIKVM_USERNAME is required in .env}"
    : "${PIKVM_PASSWORD:?PIKVM_PASSWORD is required in .env}"
}

pikvm_base_url() {
    printf '%s\n' "${PIKVM_URL%/}"
}

pikvm_host_from_url() {
    local url="${PIKVM_URL%/}"
    local host
    host="${url#http://}"
    host="${host#https://}"
    host="${host%%/*}"
    host="${host%%:*}"
    printf '%s\n' "$host"
}

browser_login() {
    load_env

    if ! command -v agent-browser >/dev/null 2>&1; then
        echo "agent-browser is not installed. Run: npm install -g agent-browser && agent-browser install" >&2
        exit 1
    fi

    local base_url="${PIKVM_URL%/}"
    local app_url="$base_url/extras/kvm-portal/"

    agent-browser close --all >/dev/null 2>&1 || true

    echo "Opening KVM Portal: $app_url"
    agent-browser open "$app_url"
    agent-browser wait --load domcontentloaded

    echo "Waiting for KVM Portal login UI"
    agent-browser wait "#pikvm-login-form"

    echo "Submitting PiKVM credentials through KVM Portal"
    agent-browser fill "#pikvm-username" "$PIKVM_USERNAME"
    agent-browser fill "#pikvm-password" "$PIKVM_PASSWORD"
    agent-browser click "#pikvm-login-submit"

    echo "Waiting for authenticated state"
    agent-browser wait "[data-auth-state='authenticated']"

    echo "KVM Portal browser session is authenticated and ready."
}

select_source_dir() {
    local dist_dir="${KVM_PORTAL_DIST_DIR:-dist}"
    local fallback_dir="public"

    if [[ -d "$dist_dir" ]]; then
        printf '%s\n' "$dist_dir"
    elif [[ -d "$fallback_dir" ]]; then
        printf '%s\n' "$fallback_dir"
    else
        echo "No deployable app found. Expected '$dist_dir/' or '$fallback_dir/'." >&2
        exit 1
    fi
}

build_app() {
    echo "Building app"
    npm run build
}

deploy_extension() {
    load_env

    build_app

    local ssh_host="${KVM_PORTAL_SSH_HOST:-$(pikvm_host_from_url)}"
    local public_base_url="${KVM_PORTAL_PUBLIC_BASE_URL:-$(pikvm_base_url)}"
    local remote_stage="${KVM_PORTAL_REMOTE_STAGE:-/tmp/kvm-portal-deploy}"
    local remote_web_dir="${KVM_PORTAL_REMOTE_WEB_DIR:-/usr/share/kvmd/web/extras/kvm-portal}"
    local remote_extra_dir="${KVM_PORTAL_REMOTE_EXTRA_DIR:-/usr/share/kvmd/extras/kvm-portal}"
    local source_dir
    source_dir="$(select_source_dir)"

    local archive
    archive="$(mktemp)"
    trap "rm -f '$archive'" EXIT

    echo "Packaging $source_dir/"
    tar -C "$source_dir" -czf "$archive" .

    echo "Preparing $ssh_host:$remote_stage"
    ssh "$ssh_host" "set -eu; mkdir -p '$remote_stage'"

    echo "Copying app archive"
    scp "$archive" "$ssh_host:$remote_stage/app.tgz" >/dev/null

    echo "Installing PiKVM extra"
    ssh "$ssh_host" \
        "REMOTE_STAGE='$remote_stage' REMOTE_WEB_DIR='$remote_web_dir' REMOTE_EXTRA_DIR='$remote_extra_dir' bash -s" <<'EOF'
set -euo pipefail

if command -v rw >/dev/null 2>&1; then
    rw >/dev/null || true
fi

rm -rf "$REMOTE_WEB_DIR"
mkdir -p "$REMOTE_WEB_DIR" "$REMOTE_EXTRA_DIR"
tar -xzf "$REMOTE_STAGE/app.tgz" -C "$REMOTE_WEB_DIR"
rm -f "$REMOTE_STAGE/app.tgz"

cat > "$REMOTE_EXTRA_DIR/manifest.yaml" <<'MANIFEST'
name: KVM Portal
description: Mobile terminal control portal
icon: share/svg/kvm.svg
path: extras/kvm-portal
daemon: kvmd-nginx
place: 15
MANIFEST

cat > "$REMOTE_EXTRA_DIR/nginx.ctx-server.conf" <<'NGINX'
location = /extras/kvm-portal {
    return 301 /extras/kvm-portal/;
}

location /extras/kvm-portal/ {
    alias /usr/share/kvmd/web/extras/kvm-portal/;
    index index.html;
    try_files $uri $uri/ /extras/kvm-portal/index.html;
    include /etc/kvmd/nginx/loc-nocache.conf;
    auth_request off;
}
NGINX

kvmd-nginx-mkconf /etc/kvmd/nginx/nginx.conf.mako /run/kvmd/nginx.conf
nginx -t -p /etc/kvmd/nginx -c /run/kvmd/nginx.conf -g 'pid /run/kvmd/nginx.pid; user kvmd-nginx; error_log stderr;'
systemctl restart kvmd-nginx
EOF

    local health_url="$public_base_url/extras/kvm-portal/health"
    local app_url="$public_base_url/extras/kvm-portal/"

    echo "Waiting for $health_url"
    for _ in $(seq 1 40); do
        if curl -k -fsS --max-time 2 "$health_url" >/dev/null; then
            echo "Healthy: $app_url"
            exit 0
        fi
        sleep 0.25
    done

    echo "Timed out waiting for $health_url" >&2
    ssh "$ssh_host" "systemctl status kvmd-nginx --no-pager -l | sed -n '1,120p'" >&2 || true
    exit 1
}

deploy_temp() {
    load_env

    local ssh_host="${KVM_PORTAL_SSH_HOST:-$(pikvm_host_from_url)}"
    local remote_dir="${KVM_PORTAL_REMOTE_DIR:-/tmp/kvm-portal-app}"
    local remote_hostname="${KVM_PORTAL_REMOTE_HOSTNAME:-$(pikvm_host_from_url)}"
    local port="${KVM_PORTAL_PORT:-18080}"
    local source_dir
    source_dir="$(select_source_dir)"

    local archive
    archive="$(mktemp)"
    trap "rm -f '$archive'" EXIT

    echo "Packaging $source_dir/"
    tar -C "$source_dir" -czf "$archive" .

    echo "Preparing $ssh_host:$remote_dir"
    ssh "$ssh_host" "set -eu; mkdir -p '$remote_dir'; rm -rf '$remote_dir/www'; mkdir -p '$remote_dir/www'"

    echo "Copying app archive"
    scp "$archive" "$ssh_host:$remote_dir/app.tgz" >/dev/null

    echo "Starting remote static server on port $port"
    ssh "$ssh_host" "set -eu; tar -xzf '$remote_dir/app.tgz' -C '$remote_dir/www'; rm -f '$remote_dir/app.tgz'; printf 'ok\n' > '$remote_dir/www/health'; if [ -f '$remote_dir/server.pid' ]; then old_pid=\$(tr -cd '0-9' < '$remote_dir/server.pid' || true); if [ -n \"\$old_pid\" ] && kill -0 \"\$old_pid\" 2>/dev/null; then kill \"\$old_pid\" || true; fi; fi; cd '$remote_dir/www'; nohup python3 -m http.server '$port' --bind 0.0.0.0 > '$remote_dir/server.log' 2>&1 & echo \$! > '$remote_dir/server.pid'"

    local health_url="http://$remote_hostname:$port/health"
    local app_url="http://$remote_hostname:$port/"

    echo "Waiting for $health_url"
    for _ in $(seq 1 40); do
        if curl -fsS --max-time 2 "$health_url" >/dev/null; then
            echo "Healthy: $app_url"
            exit 0
        fi
        sleep 0.25
    done

    echo "Timed out waiting for $health_url" >&2
    echo "Remote log:" >&2
    ssh "$ssh_host" "if [ -f '$remote_dir/server.log' ]; then sed -n '1,120p' '$remote_dir/server.log'; fi" >&2 || true
    exit 1
}

stop_temp() {
    load_env

    local ssh_host="${KVM_PORTAL_SSH_HOST:-$(pikvm_host_from_url)}"
    local remote_dir="${KVM_PORTAL_REMOTE_DIR:-/tmp/kvm-portal-app}"

    ssh "$ssh_host" "set -eu; if [ -f '$remote_dir/server.pid' ]; then pid=\$(tr -cd '0-9' < '$remote_dir/server.pid' || true); if [ -n \"\$pid\" ] && kill -0 \"\$pid\" 2>/dev/null; then kill \"\$pid\" || true; echo \"stopped \$pid\"; fi; fi; rm -rf '$remote_dir'"
}

scribe_token() {
    load_env
    : "${ELEVENLABS_API_KEY:?ELEVENLABS_API_KEY is required in .env}"

    uv run python - <<'PY'
import json
import os
import urllib.request

request = urllib.request.Request(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
    method="POST",
    headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]},
)

with urllib.request.urlopen(request, timeout=30) as response:
    payload = json.loads(response.read().decode("utf-8"))

print(payload["token"])
PY
}

cmd="${1:---deploy}"
case "$cmd" in
    --bootstrap-agent-browser|browser-login)
        browser_login
        ;;
    --deploy|deploy)
        deploy_extension
        ;;
    --deploy-temp|deploy-temp)
        deploy_temp
        ;;
    --stop-temp|stop-temp)
        stop_temp
        ;;
    --scribe-token|scribe-token)
        scribe_token
        ;;
    help|-h|--help)
        usage
        ;;
    *)
        echo "Unknown command: $cmd" >&2
        usage >&2
        exit 1
        ;;
esac
