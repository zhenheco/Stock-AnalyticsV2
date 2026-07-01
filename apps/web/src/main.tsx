import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initSentry } from "./sentry";
import "./styles.css";

const root = document.getElementById("root");

if (root) {
  initSentry();
  createRoot(root).render(<App />);
}
