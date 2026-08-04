import { motion } from "motion/react";
import { Link } from "react-router";
import { AllianceLogo, PartyLogo } from "../identity";
import { Icon } from "../ui/Icon";
import { currentAlliance, currentParty, currentStatus } from "../../dataChanges";
import { useElection } from "../../ElectionContext";
import type { ElectionData, Seat } from "../../types";
import type { SeatingPosition } from "../../data/types/seating";
import { formatNumber, formatPct, toSlug } from "../../utils";

export function SeatingDetail({ data, seat, position }: { data: ElectionData; seat: Seat; position?: SeatingPosition }) {
  const { edition, paths } = useElection();
  const activeParty = currentParty(seat);
  const activeAlliance = currentAlliance(seat);
  return <motion.article
    id="seating-selection-detail"
    className="seating-selection-detail"
    aria-live="polite"
    key={seat.code}
    initial={{ opacity: 0, x: 12 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -12 }}
  >
    <div className="seating-selection-top"><span>{seat.state} · {position?.physicalCode ?? "TIADA KOD"}</span><strong>{seat.code}</strong></div>
    <h3>{seat.name}</h3><p>{seat.winner.name}</p>
    <div className="seating-identity-row"><span>{data.metadata.shortTitle}</span><strong><PartyLogo name={seat.winner.party}/><AllianceLogo name={seat.winner.alliance} data={data}/></strong></div>
    {edition.isCurrentTerm && <div className="seating-identity-row is-current"><span>SEMASA</span><strong>{currentStatus(seat) === "vacant" ? "KERUSI KOSONG" : <><PartyLogo name={activeParty}/><AllianceLogo name={activeAlliance} data={data}/></>}</strong></div>}
    <dl><div><dt>Majoriti {data.metadata.shortTitle}</dt><dd>{formatNumber(seat.marginVotes)}</dd></div><div><dt>Bahagian undi</dt><dd>{formatPct(seat.winner.share, 2)}</dd></div><div><dt>Status kerusi</dt><dd>{currentStatus(seat) === "active" ? "Aktif" : currentStatus(seat) === "vacant" ? "Kosong" : "Digantung"}</dd></div><div><dt>Pemetaan PDF</dt><dd>{position?.sourceConstituency ?? "Tiada label"}</dd></div></dl>
    <Link to={`${paths.parliament}/${toSlug(seat.name)}`}>Lihat keputusan penuh <Icon name="arrow" size={16}/></Link>
  </motion.article>;
}
