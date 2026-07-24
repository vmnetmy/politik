import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AtlasApp from "./AtlasApp";
import { startTelemetryWhenIdle } from "./deferTelemetry";

const mountAtlas = () => {
  document.querySelectorAll<HTMLLinkElement>("link[data-atlas-style]").forEach((stylesheet) => {
    stylesheet.media = "all";
  });
  requestAnimationFrame(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <AtlasApp/>
      </StrictMode>,
    );
    startTelemetryWhenIdle();
  });
};

requestAnimationFrame(() => requestAnimationFrame(mountAtlas));
