import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { IS_MAC } from "./hooks/useSidebar";

// macOS draws its window material (vibrancy) behind a transparent webview: the styles
// only make the page see-through with this class, so Windows, Linux and a plain browser
// tab (no material behind it) stay opaque.
const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
document.documentElement.classList.toggle("is-macos", IS_MAC && IS_TAURI);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
