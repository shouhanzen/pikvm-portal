import { BottomUtilityRow } from "../components/controls/BottomUtilityRow";
import { ControlBar } from "../components/controls/ControlBar";
import { SettingsModal } from "../components/settings/SettingsModal";
import { VideoStage } from "../components/video/VideoStage";
import { CustomKeyboard } from "../components/keyboard/CustomKeyboard";
import { useAppStateStore } from "../stores/appStateStore";

export function PhoneLayout({ onLogout }: { onLogout: () => void }) {
  const keyboardVisible = useAppStateStore((state) => state.keyboardVisible);

  return (
    <main className="phoneLayout" data-auth-state="authenticated">
      <VideoStage />
      <section className="controlDeck" data-keyboard-visible={keyboardVisible}>
        <ControlBar />
        {keyboardVisible ? (
          <>
            <CustomKeyboard />
            <BottomUtilityRow />
          </>
        ) : null}
      </section>
      <SettingsModal onLogout={onLogout} />
    </main>
  );
}
