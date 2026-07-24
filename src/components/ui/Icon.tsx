export type IconName = "grid" | "seat" | "people" | "chart" | "map" | "share" | "download" | "code" | "search" | "arrow" | "chevron" | "database" | "info" | "vote" | "zoom-in" | "zoom-out" | "reset" | "fullscreen" | "fullscreen-exit" | "move";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    seat: <><path d="M7 11V5a2 2 0 0 1 4 0v6"/><path d="M13 11V7a2 2 0 0 1 4 0v5"/><path d="M5 11h14v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M8 19v2m8-2v2"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.2"/><path d="M16 14.5a4.5 4.5 0 0 1 4.5 4.5"/></>,
    chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
    map: <><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2z"/><path d="M8 4v13m8-10v13"/></>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5m-7.6 6.9 7.6 4.5"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/></>,
    code: <><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 5-4 14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    vote: <><path d="M7 3h10l2 8H5z"/><path d="M4 11h16v10H4z"/><path d="m9 7 2 2 4-4"/></>,
    "zoom-in": <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4M10.5 7.5v6M7.5 10.5h6"/></>,
    "zoom-out": <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4M7.5 10.5h6"/></>,
    reset: <><path d="M4.5 8.5V4m0 0H9"/><path d="M5.2 5.2a8 8 0 1 1-1 8.7"/></>,
    fullscreen: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></>,
    "fullscreen-exit": <><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/></>,
    move: <><path d="M12 2v20M2 12h20"/><path d="m8 6 4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}
