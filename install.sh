#!/bin/sh
set -eu

REPO="${KVM_PORTAL_REPO:-shouhanzen/pikvm-portal}"
APP_NAME="${KVM_PORTAL_APP_NAME:-KVM Portal}"
APP_SLUG="${KVM_PORTAL_APP_SLUG:-kvm-portal}"
WEB_DIR="${KVM_PORTAL_WEB_DIR:-/usr/share/kvmd/web/extras/$APP_SLUG}"
EXTRA_DIR="${KVM_PORTAL_EXTRA_DIR:-/usr/share/kvmd/extras/$APP_SLUG}"
MANIFEST_PLACE="${KVM_PORTAL_MENU_PLACE:-15}"
ARTIFACT_NAME="${KVM_PORTAL_ARTIFACT_NAME:-kvm-portal-dist.tar.gz}"

usage() {
    cat <<EOF
Usage:
  install.sh [--uninstall]

Environment:
  VERSION=v0.1.0                  Install a specific release tag. Defaults to latest.
  KVM_PORTAL_WEB_DIR=$WEB_DIR
  KVM_PORTAL_EXTRA_DIR=$EXTRA_DIR
  KVM_PORTAL_REPO=$REPO
EOF
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "KVM Portal installer must run as root on the PiKVM." >&2
        exit 1
    fi
}

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

make_rw() {
    if command -v rw >/dev/null 2>&1; then
        rw >/dev/null || true
    fi
}

make_ro() {
    if command -v ro >/dev/null 2>&1; then
        ro >/dev/null || true
    fi
}

artifact_url() {
    if [ -n "${VERSION:-}" ]; then
        printf 'https://github.com/%s/releases/download/%s/%s\n' "$REPO" "$VERSION" "$ARTIFACT_NAME"
    else
        printf 'https://github.com/%s/releases/latest/download/%s\n' "$REPO" "$ARTIFACT_NAME"
    fi
}

write_extra_config() {
    mkdir -p "$EXTRA_DIR"

    cat > "$EXTRA_DIR/manifest.yaml" <<EOF
name: $APP_NAME
description: Mobile terminal control portal
icon: share/svg/kvm.svg
path: extras/$APP_SLUG
daemon: kvmd-nginx
place: $MANIFEST_PLACE
EOF

    cat > "$EXTRA_DIR/nginx.ctx-server.conf" <<EOF
location = /extras/$APP_SLUG {
    return 301 /extras/$APP_SLUG/;
}

location /extras/$APP_SLUG/ {
    alias $WEB_DIR/;
    index index.html;
    try_files \$uri \$uri/ /extras/$APP_SLUG/index.html;
    include /etc/kvmd/nginx/loc-nocache.conf;
    auth_request off;
}
EOF
}

reload_nginx() {
    kvmd-nginx-mkconf /etc/kvmd/nginx/nginx.conf.mako /run/kvmd/nginx.conf
    nginx -t -p /etc/kvmd/nginx -c /run/kvmd/nginx.conf -g 'pid /run/kvmd/nginx.pid; user kvmd-nginx; error_log stderr;'
    systemctl restart kvmd-nginx
}

install_portal() {
    need_cmd curl
    need_cmd tar
    need_cmd kvmd-nginx-mkconf
    need_cmd nginx
    need_cmd systemctl

    archive="$(mktemp)"
    trap 'rm -f "$archive"; make_ro' EXIT INT TERM

    url="$(artifact_url)"
    echo "Downloading KVM Portal: $url"
    curl -fL "$url" -o "$archive"

    make_rw
    rm -rf "$WEB_DIR"
    mkdir -p "$WEB_DIR"
    tar -xzf "$archive" -C "$WEB_DIR"
    write_extra_config
    reload_nginx

    echo "KVM Portal installed at /extras/$APP_SLUG/"
    echo "Health check: /extras/$APP_SLUG/health"
}

uninstall_portal() {
    need_cmd kvmd-nginx-mkconf
    need_cmd nginx
    need_cmd systemctl
    trap 'make_ro' EXIT INT TERM

    make_rw
    rm -rf "$WEB_DIR" "$EXTRA_DIR"
    reload_nginx
    echo "KVM Portal uninstalled."
}

main() {
    require_root

    case "${1:-}" in
        --uninstall)
            uninstall_portal
            ;;
        -h|--help)
            usage
            ;;
        "")
            install_portal
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
}

main "$@"
