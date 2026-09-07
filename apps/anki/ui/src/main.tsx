import React from "react";
import { createRoot } from "react-dom/client";
import "@scholarserver/ui/styles.css";
import "@scholarserver/ui/appearance";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
