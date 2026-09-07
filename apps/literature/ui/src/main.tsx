import { createRoot } from "react-dom/client";
import "@scholarserver/ui/styles.css";
import "@scholarserver/ui/appearance";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
