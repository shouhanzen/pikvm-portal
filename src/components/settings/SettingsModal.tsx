import { FormEvent, useState } from "react";
import { useAppStateStore, type SettingsTab, type TerminalProfile } from "../../stores/appStateStore";
import { useDebugLogStore } from "../../stores/debugLogStore";
import { useInputPrefsStore } from "../../stores/inputPrefsStore";
import { useLocalSecretsStore } from "../../stores/localSecretsStore";
import { useViewPresetStore } from "../../stores/viewPresetStore";
import { useViewStateStore } from "../../stores/viewStateStore";
import { DebugLogPanel } from "./DebugLogPanel";
import { ViewPresetsPanel } from "./ViewPresetsPanel";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "view", label: "View" },
  { id: "inputs", label: "Inputs" },
  { id: "secrets", label: "Secrets" },
];

export function SettingsModal({ onLogout }: { onLogout: () => void }) {
  const settingsOpen = useAppStateStore((state) => state.settingsOpen);
  const settingsTab = useAppStateStore((state) => state.settingsTab);
  const debugOverlayEnabled = useAppStateStore((state) => state.debugOverlayEnabled);
  const debugLogOpen = useAppStateStore((state) => state.debugLogOpen);
  const terminalProfile = useAppStateStore((state) => state.terminalProfile);
  const closeSettings = useAppStateStore((state) => state.closeSettings);
  const setSettingsTab = useAppStateStore((state) => state.setSettingsTab);
  const setDebugOverlayEnabled = useAppStateStore((state) => state.setDebugOverlayEnabled);
  const setDebugLogOpen = useAppStateStore((state) => state.setDebugLogOpen);
  const setTerminalProfile = useAppStateStore((state) => state.setTerminalProfile);
  const resetAppState = useAppStateStore((state) => state.resetAppState);
  const resetView = useViewStateStore((state) => state.resetView);
  const resetViewPresets = useViewPresetStore((state) => state.resetViewPresets);
  const resetInputPrefs = useInputPrefsStore((state) => state.resetInputPrefs);
  const clearLogs = useDebugLogStore((state) => state.clearLogs);
  const pikvmUsername = useLocalSecretsStore((state) => state.pikvmUsername);
  const elevenLabsApiKey = useLocalSecretsStore((state) => state.elevenLabsApiKey);
  const setElevenLabsApiKey = useLocalSecretsStore((state) => state.setElevenLabsApiKey);
  const clearElevenLabsApiKey = useLocalSecretsStore((state) => state.clearElevenLabsApiKey);
  const resetLocalSecrets = useLocalSecretsStore((state) => state.resetLocalSecrets);
  const [newElevenLabsKey, setNewElevenLabsKey] = useState("");
  const [resetText, setResetText] = useState("");

  if (!settingsOpen) {
    return null;
  }

  function onSaveSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newElevenLabsKey.trim()) {
      setElevenLabsApiKey(newElevenLabsKey.trim());
      setNewElevenLabsKey("");
    }
  }

  function resetAll() {
    resetAppState();
    resetView();
    resetViewPresets();
    resetInputPrefs();
    resetLocalSecrets();
    clearLogs();
    onLogout();
  }

  return (
    <section className="settingsModal" role="dialog" aria-modal="true" aria-label="Settings">
      <header className="settingsHeader">
        <div>
          <p className="eyebrow">KVM Portal</p>
          <h2>Settings</h2>
        </div>
        <button type="button" className="closeButton" onClick={closeSettings}>Done</button>
      </header>

      <nav className="settingsTabs" aria-label="Settings tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            className={settingsTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => setSettingsTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="settingsBody">
        {settingsTab === "general" ? (
          <div className="settingsStack">
            <label className="settingsRow terminalProfileRow">
              <span>
                <strong>Tab controls</strong>
                <small>Choose which terminal app the tab buttons control.</small>
              </span>
              <select
                value={terminalProfile}
                onChange={(event) => setTerminalProfile(event.target.value as TerminalProfile)}
              >
                <option value="macTerminal">Mac Terminal</option>
                <option value="tmux">tmux</option>
              </select>
            </label>
            <label className="settingsRow switchRow">
              <span>
                <strong>Debug video overlay</strong>
                <small>Show stream state and view intent on top of video.</small>
              </span>
              <input
                type="checkbox"
                checked={debugOverlayEnabled}
                onChange={(event) => setDebugOverlayEnabled(event.target.checked)}
              />
            </label>
            <div className="settingsRow">
              <span>
                <strong>Debug logs</strong>
                <small>Open the in-app log panel.</small>
              </span>
              <button type="button" onClick={() => setDebugLogOpen(!debugLogOpen)}>
                {debugLogOpen ? "Hide" : "Show"}
              </button>
            </div>
            {debugLogOpen ? <DebugLogPanel /> : null}
            <div className="settingsRow">
              <span>
                <strong>Reset view</strong>
                <small>Return scale and anchor to defaults.</small>
              </span>
              <button type="button" onClick={resetView}>Reset</button>
            </div>
            <div className="settingsRow">
              <span>
                <strong>Log out</strong>
                <small>End the PiKVM browser session.</small>
              </span>
              <button type="button" onClick={onLogout}>Log out</button>
            </div>
            <section className="dangerZone">
              <h3>Reset all local state</h3>
              <p>This clears app state, view state, local secrets, logs, and logs out.</p>
              <input
                placeholder="Type reset"
                value={resetText}
                onChange={(event) => setResetText(event.target.value)}
              />
              <button type="button" disabled={resetText !== "reset"} onClick={resetAll}>
                Reset Everything
              </button>
            </section>
          </div>
        ) : null}

        {settingsTab === "view" ? <ViewPresetsPanel /> : null}

        {settingsTab === "inputs" ? (
          <div className="emptySettingsTab">
            <h3>Input tuning later</h3>
            <p>Mouse sensitivity and scroll controls will land with the mouse/view gesture pass.</p>
          </div>
        ) : null}

        {settingsTab === "secrets" ? (
          <div className="settingsStack">
            <div className="settingsRow">
              <span>
                <strong>PiKVM username</strong>
                <small>{pikvmUsername ? pikvmUsername : "Not stored"}</small>
              </span>
            </div>
            <form className="settingsStack" onSubmit={onSaveSecret}>
              <label>
                ElevenLabs API key
                <input
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={elevenLabsApiKey ? "Saved. Paste a new key to replace." : "Paste API key"}
                  type="password"
                  value={newElevenLabsKey}
                  onChange={(event) => setNewElevenLabsKey(event.target.value)}
                />
              </label>
              <div className="settingsRow">
                <small>{elevenLabsApiKey ? "Key saved locally." : "No key saved."}</small>
                <div className="buttonCluster">
                  {elevenLabsApiKey ? (
                    <button type="button" onClick={clearElevenLabsApiKey}>
                      Clear
                    </button>
                  ) : null}
                  <button type="submit" disabled={!newElevenLabsKey.trim()}>
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}
