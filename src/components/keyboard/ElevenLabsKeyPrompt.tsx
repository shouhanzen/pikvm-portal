import { FormEvent, useState } from "react";
import { useLocalSecretsStore } from "../../stores/localSecretsStore";

export function ElevenLabsKeyPrompt({ onClose }: { onClose: () => void }) {
  const setElevenLabsApiKey = useLocalSecretsStore((state) => state.setElevenLabsApiKey);
  const [value, setValue] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim()) {
      setElevenLabsApiKey(value.trim());
      onClose();
    }
  }

  return (
    <div className="modalScrim">
      <form className="smallModal" onSubmit={onSubmit}>
        <button className="modalClose" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h2>ElevenLabs API key</h2>
        <input
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" disabled={!value.trim()}>
          Save
        </button>
      </form>
    </div>
  );
}
