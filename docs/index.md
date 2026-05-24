# KVM Portal

KVM Portal is a phone-first PiKVM extra for controlling a terminal-oriented host from an installed mobile PWA. It provides a custom touch keyboard, PiKVM video, mouse gestures, view presets, and terminal tab controls.

## Requirements

- A PiKVM reachable over HTTPS.
- Shell access to the PiKVM as `root`.
- Internet access from the PiKVM for the GitHub release download.
- A phone browser that can install PWAs. The app is primarily tuned for iPhone portrait use.

## Install On PiKVM

Run this on the PiKVM as `root`:

```sh
curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh
```

The installer:

- downloads the latest `kvm-portal-dist.tar.gz` release artifact
- installs the static app under `/usr/share/kvmd/web/extras/kvm-portal`
- installs PiKVM extra metadata under `/usr/share/kvmd/extras/kvm-portal`
- regenerates and validates PiKVM's nginx config
- restarts `kvmd-nginx`
- restores the filesystem to read-only mode when PiKVM's `ro` helper is available

After install, open:

```text
https://YOUR-PIKVM-HOST/extras/kvm-portal/
```

You can verify the static route with:

```text
https://YOUR-PIKVM-HOST/extras/kvm-portal/health
```

It should return:

```text
ok
```

## Install A Specific Version

```sh
VERSION=v0.1.0 curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh
```

## Update

Re-run the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh
```

## Uninstall

Run on the PiKVM as `root`:

```sh
curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh -s -- --uninstall
```

## Custom Install Paths

The defaults match PiKVM's extra layout:

```sh
KVM_PORTAL_WEB_DIR=/usr/share/kvmd/web/extras/kvm-portal
KVM_PORTAL_EXTRA_DIR=/usr/share/kvmd/extras/kvm-portal
```

Override them only for nonstandard PiKVM setups:

```sh
KVM_PORTAL_WEB_DIR=/custom/web/path KVM_PORTAL_EXTRA_DIR=/custom/extra/path \
  curl -fsSL https://raw.githubusercontent.com/shouhanzen/pikvm-portal/main/install.sh | sh
```

## Install The PWA On iPhone

1. Open Safari on your iPhone.
2. Visit:

   ```text
   https://YOUR-PIKVM-HOST/extras/kvm-portal/
   ```

3. Log in with your PiKVM credentials.
4. Tap the Safari share button.
5. Tap **Add to Home Screen**.
6. Launch **KVM** from the home screen.
7. Keep the phone in portrait orientation.

If iOS shows a native video play overlay on first load, tap the video surface once. The app will use that tap to unlock playback before normal mouse gestures continue.

## First-Time App Setup

Open **Settings** in the control bar:

- **General**: choose tab controls for Mac Terminal or tmux.
- **View**: create view presets from the current zoom/framing.
- **Secrets**: optionally store an ElevenLabs API key locally for voice input.

Local app settings are stored in the iPhone/PWA's browser storage. Deleting the installed PWA or clearing site data removes local settings, presets, and saved local secrets.

## Terminal Profiles

The control bar tab buttons support:

- **Mac Terminal**: uses macOS Terminal keyboard shortcuts.
- **tmux**: uses the default `Ctrl-b` prefix.

For tmux mouse wheel behavior, enable mouse mode in tmux:

```tmux
set -g mouse on
```

Persist it in `~/.tmux.conf` and reload:

```sh
tmux source-file ~/.tmux.conf
```

## Release Artifacts

Maintainers can build the release artifact locally:

```sh
npm run package:release
```

Attach `kvm-portal-dist.tar.gz` to a GitHub release.
