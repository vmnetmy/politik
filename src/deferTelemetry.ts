export function startTelemetryWhenIdle() {
  if (!import.meta.env.PROD || import.meta.env.VITE_TELEMETRY_ENABLED === "false") return;
  const start = () => void import("./telemetry").then(({ startTelemetry }) => startTelemetry());
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(start, { timeout: 4_000 });
  } else {
    globalThis.setTimeout(start, 2_000);
  }
}
