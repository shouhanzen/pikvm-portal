# KVM Portal Spec

## Product Intent

KVM Portal is a phone-installable PWA for mobile-first control of an agent-oriented terminal session visible through a PiKVM video stream.

The target physical setup is a laptop connected to a PiKVM, with Cursor running inside a macOS Terminal window on a mirrored display visible to the PiKVM. The app is a focused terminal-control surface, not a generic remote desktop.

The center of gravity is controlling an agent in a terminal from an iPhone while respecting the core limitation that the laptop can only be controlled through KVM keyboard, mouse, and video.

## Hard Constraints

- Runtime laptop access is KVM-only.
- The app must not assume SSH access, a laptop-side agent, direct filesystem access, direct process access, or direct `tmux` command execution on the laptop.
- All runtime control must be expressible as PiKVM-compatible keyboard and mouse input.
- The PiKVM video stream is the primary feedback channel.
- The app is frontend-only: static PWA assets, direct browser-to-PiKVM communication, no application backend, no proxy.
- The app must not require installing custom software on the PiKVM.
- If browser constraints such as CORS, auth, certificates, or WebSocket access block direct access, solve them within the frontend, PiKVM configuration, browser, or Tailscale setup rather than adding a backend.

These are runtime constraints. Setup-time configuration of the laptop, terminal, optional `tmux`, Cursor, display mirroring/orientation, and shell environment is allowed and expected.

## Non-Goals

- No cloud service.
- No application backend or proxy.
- No generic remote desktop scope.
- No file transfer.
- No clipboard sync.
- No multi-user accounts or sharing.
- No direct laptop integration beyond setup-time environment configuration.
- No `tmux` copy-mode controls in the primary UX.

## Target Environment

### Client

- iPhone.
- Safari.
- Installed PWA launched from the iOS home screen.
- Portrait orientation only.
- Single trusted user.
- Private/local network use over Tailscale.

The design should prioritize iOS Safari constraints for installability, touch handling, viewport resizing, safe areas, local storage, and custom virtual keyboard behavior.

### Network And Security

The app is served as a same-origin PiKVM extra over Tailscale HTTPS. The target origin is the PiKVM MagicDNS HTTPS name, backed by a trusted Tailscale-issued Let's Encrypt certificate.

The PWA authenticates directly against PiKVM using `/api/auth/login` and the browser session cookie. No backend, proxy, or custom PiKVM daemon participates in runtime auth.

### Video

The real app uses PiKVM Janus/WebRTC H.264 as the only supported live video path. MJPEG was useful for spiking, but it should not be implemented as a fallback in the product UI.

Video orientation must be confirmed against the current mirrored Mac display. The app should not assume whether PiKVM streams the display as already-correct portrait content or raw landscape content that the PWA must rotate.

The current target setup uses display mirroring so the PiKVM can see the Mac login screen after sleep. This makes view/framing behavior critical: the app must be able to pan, zoom, and persist a useful crop of the mirrored display, including login/unlock states that may not match the normal terminal layout.

The app can know stream and render geometry directly:

- Source video pixel dimensions from WebRTC `videoWidth`/`videoHeight` and PiKVM streamer state.
- Rendered container dimensions from the PWA layout after safe areas, keyboard, and control bars are applied.
- View intent from persisted state: source anchor and scale. Visible crop, CSS transform, and void-space bounds are derived by `VideoStage` from current geometry.

The app cannot directly know semantic Mac desktop state from the video stream alone, such as the active macOS display arrangement, login-window safe region, terminal bounds, or cursor position. Those must be handled by persisted framing defaults, manual View mode controls, or later computer-vision heuristics if needed.

Video stream lifecycle state should be local to `VideoStage` and `useWebRTCStream`, not global app state by default. `VideoStage` owns the `<video>` element, Janus/WebRTC handles, media tracks, source geometry, retry/error display, and debug metrics such as latency or decoded FPS. Other controls should not depend on video render status for input enablement; they should depend on PiKVM/HID liveness from the authenticated `/api/ws?stream=1` state socket.

The KVM model should preserve the hardware separation between input and output devices. Keyboard/mouse HID delivery and monitor/video rendering are independent channels. Video is the user's feedback channel, but a stalled video stream does not imply that HID input is unavailable, and HID state should not be inferred from video state.

### Local Persistence

Persistence should use focused frontend stores on the phone rather than a single global app-state bucket:

- `viewState`: current source anchor and scale.
- `appState`: keyboard layer, shift state, sticky modifiers, settings open/tab, debug overlay enabled/disabled, and voice state.
- `inputPrefs`: mouse sensitivity, scroll thresholds, and repeat rates.
- `localSecrets`: PiKVM username and ElevenLabs API key, stored only on the phone.

Live resources and observed runtime facts should not be persisted: WebSocket handles, Janus handles, media streams, video lifecycle status, HID liveness, transient gestures, and left mouse hold state.

### PiKVM Extension Surface

PiKVM has a built-in extras mechanism that can host custom same-origin UI surfaces without running an app backend:

- Extra manifests live under `/usr/share/kvmd/extras/<name>/manifest.yaml`.
- Extra nginx snippets can live under `/usr/share/kvmd/extras/<name>/nginx.ctx-server.conf`.
- PiKVM nginx includes `/usr/share/kvmd/extras/*/nginx.ctx-server.conf` inside its server context.
- Static web assets can live under `/usr/share/kvmd/web/extras/<name>/`.
- The PiKVM index reads extra manifests and can show menu entries for enabled extras.

KVM Portal is built locally, copied to `/usr/share/kvmd/web/extras/kvm-portal/`, and served under the PiKVM HTTPS origin at `/extras/kvm-portal/`.

Cross-reference:

- The upstream source is `pikvm/kvmd`.
- `configs/nginx/nginx.conf.mako` includes `/usr/share/kvmd/extras/*/nginx.ctx-main.conf`, `/usr/share/kvmd/extras/*/nginx.ctx-http.conf`, and `/usr/share/kvmd/extras/*/nginx.ctx-server.conf`.
- `kvmd/apps/kvmd/info/extras.py` reads each extra's `manifest.yaml`.
- `web/share/js/index/main.js` renders extras as PiKVM index menu entries.
- `PKGBUILD` installs `web` and `extras` into `/usr/share/kvmd`.
- The installed PiKVM has `kvmd 4.168-1`; local package files match the same structure.

Remaining deployment questions:

- Whether custom files under `/usr/share/kvmd/extras` survive PiKVM OS/package updates reliably.
- Whether the portal should remain publicly served while PiKVM APIs require cookie auth, or whether static assets should eventually be protected by PiKVM nginx auth.

## Runtime Transport Boundaries

The product architecture should use each PiKVM transport for the behavior it actually supports:

- HTTP REST is used for authentication and configuration-style requests, including `/api/auth/login`, `/api/auth/check`, `/api/auth/logout`, PiKVM streamer config, HID params, and other one-shot control/config endpoints.
- The authenticated `/api/ws?stream=1` WebSocket is used for PiKVM state events, streamer activation, liveness, and runtime HID input events.
- Janus/WebRTC is used for live H.264 video rendering.

The WebSocket is not a replacement for auth/config REST. PiKVM exposes auth as HTTP-only, and the main WebSocket requires an already-authenticated browser session before it can be opened.

## Application Architecture

The app is organized around stable lifecycle owners and small persisted preference stores.

Top-level shells:

- `AuthShell` owns auth checking, login submission, logout, and whether the authenticated control app may mount. It does not open WebSocket or video resources.
- `ControlShell` mounts only after auth succeeds. It owns the authenticated `/api/ws?stream=1` state/input WebSocket for the lifetime of the active control app and reconnects it across PWA page lifecycle transitions.
- `PhoneLayout` composes the visible mobile surface: `VideoStage`, `ControlBar`, custom keyboard, and bottom utility row.

Transport/service layer:

- `pikvmHttpApi` wraps REST calls for auth and configuration-style endpoints.
- `pikvmSocket` owns the authenticated state/input WebSocket protocol and exposes intentional HID actions rather than the raw socket.
- `janusWebRtc` wraps PiKVM Janus setup for WebRTC H.264 video.

Component lifecycle owners:

- `VideoStage` owns the `<video>` element, Janus/WebRTC stream lifecycle, video debug overlay, source geometry, view transform derivation, and void grid.
- `CustomKeyboard` owns virtual keyboard rendering, keyboard layers, modifier behavior, and ordinary text/special-key dispatch.
- `MouseSurface` owns pointer/touch gesture interpretation for one-finger mouse and two-finger view gestures.
- `ActionWheel` owns long-press radial interaction state, scroll repeat timers, and left-hold toggling UI.

Persisted stores:

- `viewState` is used inside `VideoStage` by the view plane.
- `appState` is used by layout and controls for keyboard state, settings state, debug overlay, and voice state.
- `inputPrefs` is used by input helpers for sensitivity and scroll behavior.
- `localSecrets` is used by auth and voice settings.

Live handles stay out of persisted stores. WebSocket instances, Janus sessions, media streams, DOM refs, timers, and transient gestures are owned by hooks/components with explicit cleanup.

## Control Bar Contract

The `ControlBar` sits at the top edge of the bottom `ControlDeck`. It contains native macOS Terminal tab controls, settings, and a dedicated keyboard hide/show button. When the keyboard is hidden, the main keyboard and bottom utility row collapse away while the `ControlBar` remains visible.

The primary app controls target native macOS Terminal tabs in the mirrored display setup. `tmux` may still be useful inside a tab, but it is not the first-layer tab/window control surface.

Initial app action mapping:

| App action | KVM sequence |
| --- | --- |
| Previous tab | `Ctrl-Shift-Tab` |
| Next tab | `Ctrl-Tab` |
| New tab | `Cmd-T` |
| Close tab | `Cmd-W` |
| Scroll up | Mouse wheel up |
| Scroll down | Mouse wheel down |

Runtime special-key, shortcut, mouse, and wheel input should be sent over the authenticated `/api/ws?stream=1` PiKVM WebSocket using PiKVM HID event messages. Plain text dispatch should use PiKVM's `POST /api/hid/print` endpoint with a raw `text/plain` body, because PiKVM already maps printable text through its configured keymap into sequenced key events.

`sendText(text)` should call `/api/hid/print` with `limit=0` and default/fast typing speed initially. If host-side corruption appears, add a configurable delay preference. `sendKey(...)` and `sendShortcut(...)` should use WebSocket key events. Voice committed transcripts should route through `sendText(text)` and must not automatically send `Enter`.

The app should rely on macOS Terminal's natural running-process guard for close-tab/window sequences. Close sends `Cmd-W` directly. If Terminal opens its running-process prompt, the user can accept with `Enter` or deny with `Escape` from the bottom utility row.

The app should not rely on discovering terminal, tab, or optional `tmux` state at runtime. It is semi-aware only in the sense that it emits known keyboard shortcut sequences.

## Core UX

### Layout

The phone layout is vertically stacked:

1. PiKVM video region.
2. `ControlBar`.
3. Custom virtual keyboard when visible.
4. Bottom utility row.

Text entry should preserve the user's normal mobile texting form factor, but the app should use a custom virtual keyboard rather than the native iOS keyboard. This keeps layout, accessory bars, symbols, special keys, and terminal modifiers under app control.

When the custom keyboard is visible, the video region may only show the lower part of the PiKVM screen. This is acceptable because the primary target apps are terminal-based and scrollable. Hiding the custom keyboard moves the app controls to the bottom and makes the full video region available.

### Bottom Utility Row

The bottom utility row reclaims the native keyboard's lower accessory space for terminal-specific keys:

- `Esc`
- `Tab`
- `Ctrl`
- `Alt`
- `Left`
- `Up`
- `Down`
- `Right`
- `/`

`Ctrl` and `Alt` are sticky one-shot modifiers for the next keypress. `Enter` stays in the main keyboard and is not repeated in the bottom utility row. Keyboard layer switching stays inside the keyboard itself (`#+=` / `ABC`).

### Voice Input

Voice transcription is a desired feature bundled with the custom keyboard. The current priority is transcript accuracy over fastest interim words. The first spike path is ElevenLabs Scribe v2 Realtime because it supports browser microphone streaming, partial transcripts, committed transcripts, and single-use frontend tokens.

Voice behavior:

- Tap space sends a literal space.
- Long-press space starts voice capture.
- Release normally commits/stops voice capture.
- Drag upward while holding space locks voice capture on, similar to voice-message interactions in chat apps.
- In idle mode, the spacebar includes a microphone icon on its left side.
- While recording, the microphone icon morphs into a frequency-wave visualization animated from live microphone input.
- In locked voice mode, the spacebar keeps the frequency-wave visualization, gains an active tint, and shows a circular stop affordance with a square stop icon in the center.
- Tapping the spacebar in locked voice mode commits/stops voice capture.
- Only Scribe committed transcripts are shown and typed. Partial transcripts are not part of the product UX except as optional debug information.
- Each committed transcript is immediately typed through `sendText(text)`.
- Voice never sends `Enter` automatically.

Open considerations:

- Browser microphone behavior and PWA constraints on iPhone Safari.
- Whether Scribe v2 Realtime accuracy is good enough on real terminal dictation phrases, or whether to compare against `gpt-4o-transcribe`.
- Single-use token flow. The production static PWA must not embed provider API keys. For the personal spike, the keyboard mock may store an ElevenLabs API key in local phone storage and mint single-use Scribe tokens directly for mobile testing convenience.
- Privacy and network expectations for cloud transcription.
- Editing/review affordances before sending text into the terminal.
- How transcript text maps to PiKVM HID events, including newlines, shell-sensitive characters, and cancellation.

### Control Bar

Draft 1 `ControlBar` actions:

- Previous tab.
- Next tab.
- New tab.
- Close tab.

Close tab sends `Cmd-W` directly. If Terminal opens its running-process prompt, the user can accept with `Enter` or deny with `Escape` from the bottom utility row.

### Interaction Plane

The app should initially pursue a unified touch interaction plane rather than a hard Mouse/View mode split:

- One finger controls the remote mouse: relative pointer movement, tap click, and long-press action wheel.
- Two fingers control the local view: pinch zoom and pan the rendered PiKVM video without sending KVM input.

If a second finger appears during a one-finger mouse gesture, the app should cancel mouse-click eligibility and switch that gesture to view manipulation until all fingers lift. The app can still expose an explicit Mouse/View lock later if accidental multitouch behavior proves annoying.

Keyboard visibility is separate layout state, not an input mode. The custom keyboard can be shown or hidden independently of the touch interaction plane.

Left mouse hold is toggled from the action wheel and persists until the user explicitly toggles it off. While active, it should show a small upper-left `LEFT HOLD` chip as the exception to the otherwise minimal status UI.

## View Model

View manipulation exists because the captured display is rotated, mirrored, and larger than the phone viewport, and the keyboard-visible layout may only show part of the screen. It lets the user focus on different terminal regions or Mac login/unlock regions without sending unintended KVM input.

View gestures:

- Two-finger pan moves the rendered video.
- Two-finger pinch zooms the rendered video.
- Draft 1 zoom range is clamped from `1x` to `16x`.
- View changes do not send KVM mouse or keyboard input.

Mouse controls operate over the currently framed video surface.

View state is anchor-based. The persisted view intent is a normalized source anchor and scale. `VideoStage` derives the rendered CSS transform from that intent plus current source video size and current viewport/container size.

The viewport anchor is a layout policy, not persisted view state. For the main terminal layout, the source anchor is pinned to the bottom-center of the current `VideoStage` viewport.

When keyboard or control visibility changes the video container size, the same source anchor and scale are reused. The viewport recalculates around the layout-derived anchor, so the bottom framing remains stable and the top of the viewable zone grows or shrinks naturally.

The app should preserve selected view intent even if this exposes empty/void space beyond the PiKVM video bounds. It should not auto-bump or re-anchor the view to fill the container, because that would cause keyboard toggling to shift the user's working area.

Void space outside the video bounds should render as a subtle checker or grid background.

On startup, restore the last saved view if available. If no saved view exists, start with a bottom-anchored terminal-focused default.

View presets are out of scope for v1. Persist only the last/current view intent. If presets return later, they need a separate design pass for creation, editing, renaming, deleting, and ordering.

## Mouse And Touch Model

Primary video-area gestures in Mouse mode:

- Drag moves the mouse pointer relatively, like a trackpad.
- Single tap sends a left click at the current pointer position.
- Long press opens a radial action wheel centered on the hold point.
- Action wheel layout: top toggles sticky scroll mode, right sends right-click at the current cursor, left rescues the mouse to the hold location, bottom toggles sticky left mouse hold.
- Action wheel selection uses hold-slide-release with a 48px activation radius and a 500ms long-hold delay.
- Scroll mode is sticky until toggled off from the top-left video icon token or the action wheel. In scroll mode, taps do nothing and vertical swipes send native touch-direction mouse wheel events.
- Scroll mode sends one wheel tick per 20px of finger travel and applies medium decaying momentum after flicks.

Left mouse hold keeps the left button pressed until toggled off. While left mouse hold is active, normal drag still moves the pointer relatively, but the PiKVM left mouse button remains held down. Tapping the video should not implicitly release hold.

The video area should show persistent icon-only state tokens while scroll mode or left mouse hold is active. This is more reliable than trying to indicate pointer location, because the app controls the mouse relatively and may not know the exact on-screen cursor position.

### Action Wheel

The action wheel should use a hybrid crosshair-style layout:

- A radial/crosshair action area appears around the long-press origin with icons, quadrant dividers, and a subtle gradient tint that starts at the neutral circle and fades outward.
- The center/neutral radius is the only cancel area.
- Outside the neutral radius, action zones cover the full 360 degrees.
- Each outer action zone is defined by an angle range and extends indefinitely beyond the cutoff radius.
- Releasing outside the neutral radius triggers the action for the current angle zone.
- Discrete action zones activate on slide-and-release.
- Active regions should highlight more strongly as the thumb moves through them.

Initial angle mapping:

- Up: toggle sticky scroll mode.
- Down: toggle sticky left mouse hold.
- Right: right click.
- Left: rescue mouse to the hold location.

## Design Language

The UI should feel like a dark terminal cockpit with a gently animated wireframe-blueprint layer:

- Dark, low-glare base surfaces.
- Geometric, measured lines and control outlines.
- Blueprint-like grids, ticks, crosshairs, and guide marks.
- Subtle blue/cyan accent lighting rather than loud neon.
- Ambient line pulsing or rhythmic undulation should stay subtle.
- Inputs can produce stronger but restrained radiating effects, such as tap ripples, scroll pulses along the wheel axis, or brief highlights through active control paths.
- Motion should communicate input and state without distracting from the PiKVM video.
- Dangerous actions such as closing a terminal tab/window can rely on Terminal's own running-process confirmation prompt. The `ControlBar` icon itself does not need distinct danger styling.
- Reduced-motion accessibility support is not required for the initial personal build.

Initial app identity should use a simple `KVM` wordmark.

## Established Baseline

These items are proven enough to treat as baseline architecture:

- Tailscale is active, MagicDNS resolves `pikvm.tailc004ab.ts.net`, and PiKVM HTTPS presents a trusted Let's Encrypt certificate issued via Tailscale HTTPS.
- The app is deployed as a PiKVM extra at `/extras/kvm-portal/` using the project `go.sh` harness.
- The PiKVM-served static app installs and launches from the iPhone home screen.
- The PWA authenticates directly against `/api/auth/login` and uses the PiKVM browser session cookie.
- Same-origin frontend access is viable; cross-origin hosting remains rejected because PiKVM REST CORS preflight fails.
- Janus/WebRTC H.264 renders through the same-origin PWA and works in the installed iPhone PWA.
- WebRTC receiver timing over Tailscale measured roughly `35ms` median capture-to-browser media latency at about `30fps`.
- PiKVM source confirms `/api/ws?stream=1` supports state events, streamer activation, and HID input events for keyboard, mouse button, absolute mouse, relative mouse, and wheel.
- The custom keyboard approach is accepted for the product. The `react-simple-keyboard` spike proved viability, but the product keyboard should be an app-owned React key grid so the spacebar voice state, long-press/drag-lock behavior, waveform animation, and native-style key popups can be implemented cleanly.
- REST HID endpoints were proven for keyboard, shortcut, relative movement, click, and wheel. User confirmed keypresses are visible on the Mac. These REST probes are historical evidence; the product input path is WebSocket-first.
- MJPEG and snapshots were proven during spiking, but the product architecture is WebRTC-only for video.

## Draft 1 Build Plan

Draft 1 replaces the spike console with the real product skeleton at `/extras/kvm-portal/`. Its job is to make the core terminal-control loop real: authenticate, see the terminal through WebRTC, type with the custom keyboard, dictate through Scribe, and run tab controls.

### Source Organization

Use the real project structure from the start:

- `src/app/`: `App`, `AuthShell`, `ControlShell`, and `PhoneLayout`.
- `src/components/video/`: `VideoStage` and `DebugVideoOverlay`.
- `src/components/controls/`: `ControlBar` and `BottomUtilityRow`.
- `src/components/keyboard/`: `CustomKeyboard`, `KeyboardKey`, `KeyPopup`, `VoiceSpacebar`, and keyboard layout helpers.
- `src/components/settings/`: `SettingsButton`, `SettingsModal`, and tab components.
- `src/components/debug/`: `DebugLogPanel`.
- `src/hooks/`: lifecycle and DOM hooks such as WebRTC, Scribe voice, element rects, and later pointer gestures.
- `src/services/`: plain TypeScript wrappers for PiKVM HTTP, PiKVM WebSocket, Janus/WebRTC, and Scribe token/client helpers.
- `src/stores/`: Zustand stores for app state, view state, input preferences, local secrets, and debug logs.
- `src/types/`: shared HID, view, and voice types.

Services should not depend on React. Hooks own lifecycles. Components compose UI and user events. Live handles stay out of persisted stores.

### Draft 1 Scope

Included:

- `AuthShell`:
  - Calls `/api/auth/check` on launch.
  - Shows centered unavailable state with retry if PiKVM/network is unreachable.
  - Shows login if unauthenticated.
  - Stores PiKVM username locally, but not PiKVM password.
  - Submits login with `expire=0`; PiKVM global auth expiration policy should cap the actual session lifetime.
  - Relies on the browser-managed PiKVM `auth_token` cookie for the real session.
- `ControlShell`:
  - Mounts only after auth succeeds.
  - Opens the authenticated `/api/ws?stream=1` input/state WebSocket.
  - Tears down the input/state WebSocket on app background/page hide and reconnects on foreground/page show/focus.
  - Exposes intentional input actions instead of raw sockets.
- `VideoStage`:
  - Uses real PiKVM Janus/WebRTC H.264 from the start.
  - Renders connection/unhealthy states in the center of the stage.
  - Owns local video lifecycle and source/render geometry.
  - Owns the gesture plane.
  - One-finger tap sends left click at the current remote cursor position.
  - One-finger drag sends relative mouse movement with direct pixel mapping.
  - Relative mouse movement maps thumb movement in screen space to cursor movement in screen space by dividing HID deltas by the fitted video source-to-screen scale and current view zoom.
  - Long-hold radial wheel supports sticky scroll mode, right-click at current cursor, and rescue mouse to hold location.
  - Rescue mouse is the only Draft 1 action that sends absolute mouse coordinates.
  - Two-finger gestures are view-only: pinch adjusts persisted `viewState.scale`, two-finger pan adjusts persisted `viewState.sourceAnchor`, and no HID mouse events are sent during the view gesture.
  - Pinch zoom is anchored under the gesture midpoint by updating both scale and source anchor during the same gesture.
  - WebRTC is torn down on app background/page hide and restarted on foreground/page show/focus to avoid stale iOS PWA media sessions.
- `PhoneLayout` vertical order:
  1. `VideoStage`.
  2. `ControlBar`.
  3. `CustomKeyboard`.
  4. `BottomUtilityRow`.
- `ControlBar`:
  - Left-to-right order: Settings, Previous tab, Next tab, New tab, Close tab, Keyboard hide/show.
  - Previous tab: `Ctrl-Shift-Tab`.
  - Next tab: `Ctrl-Tab`.
  - New tab: `Cmd-T`.
  - Close tab: `Cmd-W`.
  - Settings.
  - Keyboard hide/show button: down chevron when visible, up chevron when hidden.
  - Icon-only buttons with accessible labels; small buttons can use the shared press popup affordance.
- `CustomKeyboard`:
  - Uses an app-owned React key grid rather than `react-simple-keyboard`.
  - Uses the accepted iPhone-like key rects and layout as the geometry baseline.
  - Uses iPhone-style special layers: `123`, `#+=`, and `ABC`.
  - Special-layer printable symbols are typed through `sendText(text)` so punctuation/currency/bullet keys emit exactly.
  - Implements native-like shift: one-shot tap and double-tap caps lock.
  - Uses sticky one-shot `Ctrl` and `Alt`.
  - Shows a native-style key popup above the tap location for small keys, so the user can confirm what was tapped when their finger occludes the key.
  - Does not show popups for large/wide keys such as spacebar and keyboard enter.
  - Sends printable text through `sendText(text)` -> `POST /api/hid/print`.
  - Sends special keys through WebSocket key events.
- `VoiceSpacebar`:
  - Tap sends a literal space.
  - Long-press starts Scribe voice capture.
  - Release normally commits/stops.
  - Drag upward while holding locks recording on.
  - In locked mode, tapping the spacebar commits/stops.
  - Shows microphone/wave/stop visuals inside the spacebar only.
  - Types only Scribe committed transcripts via `sendText(text)`.
  - Never sends `Enter` automatically.
- `BottomUtilityRow`:
  - `Esc`, `Tab`, `Ctrl`, `Alt`, `/`, `Left`, `Down`, `Up`, `Right`.
  - `Ctrl` and `Alt` are sticky one-shot modifiers for the next keypress.
  - Small utility keys can use the same native-style press popup affordance as keyboard keys.
- Settings:
  - Fullscreen modal that captures all input while open.
  - Tabs: General, Inputs, Secrets.
  - General: debug overlay toggle, open logs, reset view, log out, reset all local state with confirmation.
  - Log out calls `/api/auth/logout`, closes runtime resources, and returns to the login gate.
  - Reset all local state clears app state, preferences, view state, local secrets, and debug logs; it also calls `/api/auth/logout`.
  - Inputs: omit controls until mouse/view features exist.
  - Secrets: ElevenLabs API key only. Saved keys are shown as masked presence, replacement inputs are blank, and the PiKVM username is stored only through the login form.
- Debug:
  - Video debug overlay when enabled.
  - In-app debug/log panel from settings.
  - Capture auth, WebSocket, WebRTC, HID, Scribe, unhandled error, and unhandled rejection events.

Excluded from Draft 1:

- Left mouse hold behavior.
- View presets.
- Dedicated offline/service worker update flow beyond whatever minimal PWA shell is needed later.

### Draft 1 Stores

- `appStateStore`:
  - keyboard layer.
  - shift state.
  - sticky modifiers.
  - settings open/tab.
  - debug overlay enabled.
  - voice state.
- `viewStateStore`:
  - current `scale`.
  - current normalized `sourceAnchor`.
  - No presets in v1.
- `inputPrefsStore`:
  - mouse sensitivity.
  - scroll tick distance.
  - scroll repeat rate.
- `localSecretsStore`:
  - PiKVM username.
  - ElevenLabs API key.
- `debugLogStore`:
  - recent app log entries.
  - newest-first, capped to a fixed size.

Do not persist live resources: WebSocket instances, Janus sessions, media streams, DOM refs, Scribe connections, timers, transient gestures, or in-flight request state.

### Later Work

After Draft 1 works on the phone, clear these risks next:

- Unified multitouch gesture plane: one finger for mouse, two fingers for view.
- View transform math under keyboard hide/show.
- Action wheel, scroll repeat zones, and left mouse hold chip.
- `/api/hid/print` reliability for voice and longer text; add typing delay preference only if corruption appears.
- App-shell caching and explicit unavailable state polish.
