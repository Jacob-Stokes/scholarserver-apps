import React from "react";
import { createRoot } from "react-dom/client";
import "@scholarserver/ui/styles.css";
import "@scholarserver/ui/appearance";
import "./automations.css";
import { App } from "./App";
import { managerDestination } from "./manager-navigation";

const destination = managerDestination(window.location.pathname, window.location.search);
if (destination) {
  window.location.replace(destination);
} else {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
