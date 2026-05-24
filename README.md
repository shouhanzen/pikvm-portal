# KVM Portal

Mobile-first PiKVM portal for controlling a terminal-oriented host from an installed phone PWA.

## Documentation

Install and PWA setup docs are available at:

http://shouh.me/pikvm-portal/

## Install On PiKVM

Run on the PiKVM as root:

```sh
curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh
```

Install a specific release:

```sh
VERSION=v0.1.0 curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh
```

Uninstall:

```sh
curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh -s -- --uninstall
```

The installer downloads `kvm-portal-dist.tar.gz` from the latest GitHub release, installs it as a PiKVM extra, regenerates and validates PiKVM's nginx config, restarts `kvmd-nginx`, and restores the filesystem to read-only mode when supported.

## Release Artifact

Maintainers can build the release artifact with:

```sh
npm run package:release
```

Attach `kvm-portal-dist.tar.gz` to the GitHub release.
