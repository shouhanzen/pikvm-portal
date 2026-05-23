import { create } from "zustand";
import { persist } from "zustand/middleware";

type LocalSecretsState = {
  pikvmUsername: string;
  elevenLabsApiKey: string;
  setPikvmUsername: (username: string) => void;
  clearPikvmUsername: () => void;
  setElevenLabsApiKey: (apiKey: string) => void;
  clearElevenLabsApiKey: () => void;
  resetLocalSecrets: () => void;
};

export const useLocalSecretsStore = create<LocalSecretsState>()(
  persist(
    (set) => ({
      pikvmUsername: "",
      elevenLabsApiKey: "",
      setPikvmUsername: (pikvmUsername) => set({ pikvmUsername }),
      clearPikvmUsername: () => set({ pikvmUsername: "" }),
      setElevenLabsApiKey: (elevenLabsApiKey) => set({ elevenLabsApiKey }),
      clearElevenLabsApiKey: () => set({ elevenLabsApiKey: "" }),
      resetLocalSecrets: () => set({ pikvmUsername: "", elevenLabsApiKey: "" }),
    }),
    { name: "kvmPortal.localSecrets" },
  ),
);
