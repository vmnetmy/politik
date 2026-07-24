export type ChartTheme = {
  fontFamily: string;
  ink: string;
  muted: string;
  grid: string;
  tooltip: string;
  accent: string;
  accentSecondary: string;
  accentMuted: string;
};

function cssToken(style: CSSStyleDeclaration, name: string, fallback: string) {
  return style.getPropertyValue(name).trim() || fallback;
}

export function getChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  return {
    fontFamily: cssToken(style, "--font-sans", "Inter, sans-serif"),
    ink: cssToken(style, "--color-ink", "#18222b"),
    muted: cssToken(style, "--color-text-secondary", "#52605b"),
    grid: "rgba(82, 96, 91, .16)",
    tooltip: cssToken(style, "--color-shell", "#17232f"),
    accent: cssToken(style, "--color-accent", "#d5a62e"),
    accentSecondary: cssToken(style, "--color-hero-2", "#29485f"),
    accentMuted: "#82929d",
  };
}

export function chartAnimation(duration: number) {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? false as const
    : { duration, easing: "easeOutQuart" as const };
}

export function formatCompactAxis(value: number) {
  return new Intl.NumberFormat("ms-MY", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
