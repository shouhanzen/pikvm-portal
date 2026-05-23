import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";

for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(
    eventName,
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
