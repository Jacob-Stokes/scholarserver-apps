import React from "react";
import { createRoot } from "react-dom/client";
import "@scholarserver/ui/styles.css";
import "@scholarserver/ui/appearance";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
