import type { CSSProperties } from "react";
import type { ElectionData } from "../../types";
import { allianceColor, shortAlliance } from "../../utils";
import { ALLIANCE_IMAGES, identityCode } from "./assets";

export type IdentityMarkSize = "sm" | "md" | "lg";

export function AllianceLogo({ name, data, size = "sm", className = "" }: { name: string; data: ElectionData; size?: IdentityMarkSize; className?: string }) {
  const shortName = shortAlliance(name, data.alliances);
  const src = ALLIANCE_IMAGES[identityCode(name, shortName)];
  const classes = `identity-mark alliance-mark identity-mark-${size} ${className}`.trim();
  return src
    ? <span className={classes} title={name}><img src={src} alt={name} decoding="async"/></span>
    : <span className={`${classes} identity-mark-fallback`} title={name} style={{ "--identity-color": allianceColor(name, data.alliances) } as CSSProperties}><i/>{shortName}</span>;
}

export function AlliancePill({ name, data }: { name: string; data: ElectionData }) {
  return <AllianceLogo name={name} data={data} className="alliance-pill"/>;
}
