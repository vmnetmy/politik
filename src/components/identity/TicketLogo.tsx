import { ALLIANCE_IMAGES, compactIdentityLabel, identityCode, PARTY_IMAGES } from "./assets";
import type { IdentityMarkSize } from "./AllianceLogo";

export function TicketLogo({ name, shortName, size = "sm", className = "" }: { name: string; shortName: string; size?: IdentityMarkSize; className?: string }) {
  const code = identityCode(name, shortName);
  const src = ALLIANCE_IMAGES[code] ?? PARTY_IMAGES[code];
  const classes = `identity-mark ticket-mark identity-mark-${size} ${className}`.trim();
  return src
    ? <span className={classes} title={name}><img src={src} alt={name} loading="lazy" decoding="async"/></span>
    : <span className={`${classes} identity-mark-fallback`} title={name}>{compactIdentityLabel(code)}</span>;
}
