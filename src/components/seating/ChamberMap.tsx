import { AllianceLogo } from "../identity";
import { currentStatus } from "../../dataChanges";
import type { ElectionData, Seat } from "../../types";
import type { SeatingData, SeatingPosition, SeatingView } from "../../data/types/seating";
import { allianceColor } from "../../utils";
import { SeatButton } from "./SeatButton";

export function ChamberMap({ data, seating, view, selectedCode, hoveredSeat, hoveredPosition, seatByCode, identityAlliance, matchesFilters, alliances, onSelect, onHover, onNavigate }: {
  data: ElectionData;
  seating: SeatingData;
  view: SeatingView;
  selectedCode: string;
  hoveredSeat?: Seat;
  hoveredPosition?: SeatingPosition;
  seatByCode: Map<string, Seat>;
  identityAlliance: (seat: Seat) => string;
  matchesFilters: (seat: Seat) => boolean;
  alliances: string[];
  onSelect: (seatCode: string) => void;
  onHover: (seatCode: string | null) => void;
  onNavigate: (position: SeatingPosition, direction: "up" | "down" | "left" | "right") => void;
}) {
  return <div className="seating-visual">
    <div className="seating-map-wrap">
      <p id="seating-keyboard-instructions" className="sr-only">Gunakan kekunci anak panah untuk bergerak antara kerusi. Tekan Enter atau Space untuk memilih.</p>
      <div className="seating-map" role="group" aria-describedby="seating-keyboard-instructions" aria-label={`Pelan ${seating.mappedSeatCount} kerusi Parlimen yang dipetakan daripada PDF dan ${seating.emptyPositions.length} kedudukan fizikal kosong`}>
      <svg className="seating-chamber" viewBox={`0 0 ${seating.viewBox.width} ${seating.viewBox.height}`} aria-hidden="true">
        <path d="M130 770V545C72 472 66 318 116 192C163 75 265 28 395 28H795C925 28 1027 75 1074 192C1124 318 1118 472 1060 545V770"/>
        <path d="M130 545H488L540 430H650L702 545H1060M488 545V780M702 545V780M540 430L404 226M650 430L786 226"/>
        <rect x="552" y="635" width="86" height="38" rx="8"/>
        <rect x="532" y="690" width="126" height="44" rx="8"/>
        <text x="595" y="660">BENTARA</text><text x="595" y="718">SPEAKER</text>
      </svg>
      {seating.emptyPositions.map((position) => <span
        aria-hidden="true"
        className="seating-empty-position"
        key={position.id}
        style={{ left: `${(position.x / seating.viewBox.width) * 100}%`, top: `${(position.y / seating.viewBox.height) * 100}%` }}
      ><span>{position.physicalCode}</span></span>)}
      {seating.positions.map((position) => {
        const seat = seatByCode.get(position.seatCode);
        if (!seat) return null;
        const alliance = identityAlliance(seat);
        return <SeatButton
          key={seat.code}
          seat={seat}
          position={position}
          viewBox={seating.viewBox}
          alliance={alliance}
          color={allianceColor(alliance, data.alliances)}
          status={currentStatus(seat)}
          selected={seat.code === selectedCode}
          visible={matchesFilters(seat)}
          onSelect={() => onSelect(seat.code)}
          onHover={(hovered) => onHover(hovered ? seat.code : null)}
          onNavigate={(direction) => onNavigate(position, direction)}
        />;
      })}
      {hoveredSeat && hoveredPosition && <div className="seating-hover-label" key={hoveredSeat.code} style={{ left: `${(hoveredPosition.x / seating.viewBox.width) * 100}%`, top: `${(hoveredPosition.y / seating.viewBox.height) * 100}%` }}><strong>{hoveredPosition.physicalCode} · {hoveredSeat.code} {hoveredSeat.name}</strong><span>{hoveredSeat.winner.name}</span></div>}
      </div>
    </div>
    <div className="seating-legend"><span className="seating-legend-label">{view === "current" ? "GABUNGAN SEMASA" : `GABUNGAN ${data.metadata.shortTitle}`}</span>{alliances.map((alliance) => <span key={alliance}><i style={{ background: allianceColor(alliance, data.alliances) }}/><AllianceLogo name={alliance} data={data}/></span>)}<span className="seating-empty-legend"><i/>KOD TANPA WAKIL</span></div>
  </div>;
}
