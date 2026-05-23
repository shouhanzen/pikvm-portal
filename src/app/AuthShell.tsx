import { FormEvent, useEffect, useState } from "react";
import { checkAuth, login } from "../services/pikvmHttpApi";
import { logDebug, logError } from "../stores/debugLogStore";
import { useLocalSecretsStore } from "../stores/localSecretsStore";
import { ControlShell } from "./ControlShell";

type AuthState = "checking" | "authenticated" | "anonymous" | "unavailable";

export function AuthShell() {
  const storedUsername = useLocalSecretsStore((state) => state.pikvmUsername);
  const setPikvmUsername = useLocalSecretsStore((state) => state.setPikvmUsername);
  const clearPikvmUsername = useLocalSecretsStore((state) => state.clearPikvmUsername);

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [username, setUsername] = useState(storedUsername);
  const [password, setPassword] = useState("");
  const [rememberUsername, setRememberUsername] = useState(Boolean(storedUsername));
  const [error, setError] = useState("");

  async function runAuthCheck() {
    setAuthState("checking");
    setError("");
    try {
      const ok = await checkAuth();
      setAuthState(ok ? "authenticated" : "anonymous");
      logDebug("auth", ok ? "Auth cookie valid." : "Auth required.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : String(authError));
      setAuthState("unavailable");
      logError("auth", authError);
    }
  }

  useEffect(() => {
    void runAuthCheck();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      await login(username, password);
      if (rememberUsername) {
        setPikvmUsername(username);
      } else {
        clearPikvmUsername();
      }
      setPassword("");
      await runAuthCheck();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
      logError("auth", loginError);
    }
  }

  if (authState === "checking") {
    return <CenteredState title="KVM" detail="Checking PiKVM session..." />;
  }

  if (authState === "unavailable") {
    return (
      <CenteredState
        title="PiKVM unavailable"
        detail={error || "Could not reach PiKVM."}
        action={<button onClick={() => void runAuthCheck()}>Retry</button>}
      />
    );
  }

  if (authState === "authenticated") {
    return <ControlShell onLoggedOut={() => setAuthState("anonymous")} />;
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="eyebrow">KVM Portal</p>
        <h1>Log In</h1>
        <form id="pikvm-login-form" className="authForm" onSubmit={onSubmit}>
          <label>
            Username
            <input
              id="pikvm-username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              id="pikvm-password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={rememberUsername}
              onChange={(event) => setRememberUsername(event.target.checked)}
            />
            Remember username after successful login
          </label>
          <button id="pikvm-login-submit" type="submit">Log In</button>
        </form>
        {error ? <p className="error">Login failed: {error}</p> : null}
      </section>
    </main>
  );
}

function CenteredState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <main className="centeredState">
      <h1>{title}</h1>
      <p>{detail}</p>
      {action}
    </main>
  );
}
