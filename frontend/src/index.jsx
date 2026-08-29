import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./main";
import { ToastProvider } from "./Toast";

createRoot(document.getElementById("root")).render(<StrictMode><ToastProvider><App /></ToastProvider></StrictMode>);