import { AuthShell } from "./AuthShell";

export default function App() {
  const isPhoneLandscape = window.innerWidth < 720 && window.innerWidth > window.innerHeight;

  if (isPhoneLandscape) {
    return (
      <main className="orientationGate">
        <h1>KVM</h1>
        <p>Rotate back to portrait.</p>
      </main>
    );
  }

  return <AuthShell />;
}
