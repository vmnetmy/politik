import { Link } from "react-router";
import { AllianceLogo, PartyLogo } from "./identity";
import { Icon } from "./ui/Icon";
import { currentAlliance, currentParty, currentStatus } from "../dataChanges";
import { useElection } from "../ElectionContext";
import type { ElectionData, Seat } from "../types";
import { allianceColor, formatNumber, formatPct, toSlug } from "../utils";

export function SeatCard({ seat, data, nested = false }: { seat: Seat; data: ElectionData; nested?: boolean }) {
  const { edition, paths } = useElection();
  const alliance = currentAlliance(seat);
  const party = currentParty(seat);
  const changed = seat.current?.isChanged;
  return (
    <Link className="seat-card" to={nested ? paths.stateParliament(toSlug(seat.state), toSlug(seat.name)) : `${paths.parliament}/${toSlug(seat.name)}`}>
      <div className="seat-card-top"><span>{seat.state}</span><span>{seat.code}</span></div><h3>{seat.name}</h3>
      <div className="winner-line"><span className="party-dot" style={{ background: allianceColor(alliance, data.alliances) }}/><div><span>WAKIL RAKYAT</span><strong>{seat.winner.name}</strong></div>{edition.isCurrentTerm && changed && <b className="changed-badge">DIKEMAS KINI</b>}</div>
      <div className="seat-card-stats"><div><span>{edition.isCurrentTerm ? "KEDUDUKAN SEMASA" : `KEPUTUSAN ${edition.shortTitle}`}</span><strong className="identity-pair">{edition.isCurrentTerm && currentStatus(seat) === "vacant" ? "KOSONG" : <><PartyLogo name={party}/><AllianceLogo name={alliance} data={data}/></>}</strong></div><div><span>MAJORITI {data.metadata.shortTitle}</span><strong>{formatNumber(seat.marginVotes)}</strong></div><div><span>KELUAR MENGUNDI</span><strong>{formatPct(seat.turnoutPct)}</strong></div></div>
      <div className="open-seat">Lihat keputusan <Icon name="arrow" size={16}/></div>
    </Link>
  );
}
