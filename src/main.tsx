import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/geist-mono";
import "./styles/global.css";
import { App } from "./app/App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("CivicFlow root element is missing");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
