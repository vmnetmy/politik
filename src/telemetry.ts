import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricWithAttribution } from "web-vitals/attribution";

type TelemetryEvent = {
  kind: "web-vital" | "client-error" | "interaction";
  name: string;
  value?: number;
  rating?: string;
  path: string;
  message?: string;
  occurredAt: string;
};

const endpoint = import.meta.env.VITE_TELEMETRY_ENDPOINT?.trim() || "/api/telemetry";
const enabled = import.meta.env.PROD
  && import.meta.env.VITE_TELEMETRY_ENABLED !== "false"
  && navigator.doNotTrack !== "1";

export function cleanPath(value: string) {
  try {
    return new URL(value, window.location.origin).pathname.slice(0, 180) || "/";
  } catch {
    return "/";
  }
}

export function recordInteraction(name: string, value?: number) {
  publish({
    kind: "interaction",
    name: name.slice(0, 80),
    value,
    path: cleanPath(window.location.href),
    occurredAt: new Date().toISOString(),
  });
}

function publish(event: TelemetryEvent) {
  if (!enabled) return;
  const payload = JSON.stringify(event);
  if (navigator.sendBeacon?.(endpoint, new Blob([payload], { type: "application/json" }))) return;
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
    credentials: "omit",
  });
}

function metricAttribution(metric: MetricWithAttribution) {
  const attribution = metric.attribution as Record<string, unknown>;
  const target = attribution.target
    ?? attribution.interactionTarget
    ?? attribution.largestShiftTarget
    ?? attribution.navigationEntry;
  return target ? String(target).slice(0, 300) : undefined;
}

function publishMetric(metric: MetricWithAttribution) {
  publish({
    kind: "web-vital",
    name: metric.name,
    value: Number(metric.value.toFixed(3)),
    rating: metric.rating,
    message: metricAttribution(metric),
    path: cleanPath(window.location.href),
    occurredAt: new Date().toISOString(),
  });
}

export function startTelemetry() {
  if (!enabled) return;
  onCLS(publishMetric);
  onFCP(publishMetric);
  onINP(publishMetric);
  onLCP(publishMetric);
  onTTFB(publishMetric);
  window.addEventListener("error", (event) => publish({
    kind: "client-error",
    name: event.error?.name || "Error",
    message: String(event.message || "Unknown client error").slice(0, 400),
    path: cleanPath(window.location.href),
    occurredAt: new Date().toISOString(),
  }));
  window.addEventListener("unhandledrejection", (event) => publish({
    kind: "client-error",
    name: "UnhandledPromiseRejection",
    message: String(event.reason instanceof Error ? event.reason.message : event.reason || "Unknown rejection").slice(0, 400),
    path: cleanPath(window.location.href),
    occurredAt: new Date().toISOString(),
  }));
}
