import { Icon } from "../ui/Icon";
import { useParliament } from "../../data/hooks/useParliament";
import { useElection } from "../../ElectionContext";
import type { ElectionData } from "../../types";
import type { SeatingData } from "../../data/types/seating";
import { ChamberMap } from "./ChamberMap";
import { SeatingDetail } from "./SeatingDetail";
import { formatShortDate } from "../../utils";

export function ParliamentSeatingPlan({ data, seating, search, stateFilter, allianceFilter }: {
  data: ElectionData;
  seating: SeatingData;
  search: string;
  stateFilter: string;
  allianceFilter: string;
}) {
  const { edition } = useElection();
  const parliament = useParliament({ data, seating, search, stateFilter, allianceFilter });
  const selectedPosition = parliament.selectedSeat ? parliament.positionByCode.get(parliament.selectedSeat.code) : undefined;

  return <section className="panel seating-plan-panel" aria-labelledby="seating-plan-title">
      <div className="seating-plan-heading"><div><span className="eyebrow">PELAN TEMPAT DUDUK DEWAN RAKYAT</span><h2 id="seating-plan-title">Kedudukan dalam dewan</h2><p>Disusun semula daripada pelan rasmi bertarikh {formatShortDate("2026-07-13")}. Pilih satu tempat duduk untuk melihat wakil dan keputusan {data.metadata.shortTitle}.</p></div>{edition.isCurrentTerm && <div className="seating-plan-controls" aria-label="Lapisan identiti"><button className={parliament.view === "current" ? "is-active" : ""} aria-pressed={parliament.view === "current"} onClick={() => parliament.setView("current")}>Semasa</button><button className={parliament.view === "election" ? "is-active" : ""} aria-pressed={parliament.view === "election"} onClick={() => parliament.setView("election")}>{data.metadata.shortTitle}</button></div>}</div>
      <div className="seating-plan-layout">
        <ChamberMap
          data={data}
          seating={seating}
          view={parliament.view}
          selectedCode={parliament.selectedCode}
          hoveredSeat={parliament.hoveredSeat}
          hoveredPosition={parliament.hoveredPosition}
          seatByCode={parliament.seatByCode}
          identityAlliance={parliament.identityAlliance}
          matchesFilters={parliament.matchesFilters}
          alliances={parliament.alliances}
          onSelect={parliament.setSelectedCode}
          onHover={parliament.setHoveredCode}
          onNavigate={parliament.navigateFrom}
        />
        {parliament.selectedSeat && <SeatingDetail data={data} seat={parliament.selectedSeat} position={selectedPosition}/>}
      </div>
      {parliament.unmappedSeats.length > 0 && <div className="seating-source-note"><Icon name="info" size={17}/><div><strong>{seating.mappedSeatCount} daripada {data.seats.length} kerusi mempunyai label kedudukan dalam PDF; kesemua 280 kod tempat duduk A1-G28 dipaparkan sebagai kad.</strong><span>{parliament.unmappedSeats.map((seat, index) => <span key={seat.code}>{index > 0 && " · "}<button onClick={() => parliament.setSelectedCode(seat.code)}>{seat.code} {seat.name}</button></span>)} tidak berlabel dalam sumber, tetapi maklumat {data.metadata.shortTitle} masih boleh dipilih di sini. Sebanyak {seating.emptyPositions.length} kod tanpa wakil kekal kelihatan dan tidak diberikan nama rekaan.</span></div></div>}
    </section>;
}
