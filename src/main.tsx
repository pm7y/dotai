import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "jotai";
import App from "./App";
import "./styles/globals.css";

// Suppress the default WKWebView context menu (Look Up / Translate / Services
// etc.) — none of those apply in a code editor, and Cmd+C/V/X plus CodeMirror's
// keymap cover what users actually need here.
window.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider>
      <App />
    </Provider>
  </React.StrictMode>,
);
