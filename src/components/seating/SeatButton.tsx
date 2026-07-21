import { motion } from "motion/react";
import type { CSSProperties, KeyboardEvent } from "react";
import type { Seat } from "../../types";
import type { SeatingPosition } from "../../data/types/seating";

export function SeatButton({ seat, position, viewBox, alliance, color, status, selected, visible, onSelect, onHover, onNavigate }: {
  seat: Seat;
  position: SeatingPosition;
  viewBox: { width: number; height: number };
  alliance: string;
  color: string;
  status: string;
  selected: boolean;
  visible: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : null;
    if (!direction) return;
    event.preventDefault();
    onNavigate(direction);
  };

  return <motion.button
    id={`seat-marker-${seat.code.replace(".", "-")}`}
    className={`seating-dot seating-card ${selected ? "is-selected" : ""} status-${status}`}
    style={{ left: `${(position.x / viewBox.width) * 100}%`, top: `${(position.y / viewBox.height) * 100}%`, "--seat-color": color } as CSSProperties}
    aria-label={`${position.physicalCode}, ${seat.code} ${seat.name}, ${seat.winner.name}, ${alliance}`}
    aria-pressed={selected}
    aria-controls="seating-selection-detail"
    tabIndex={selected ? 0 : -1}
    animate={{ opacity: visible ? 1 : 0.12, scale: selected ? 1.2 : 1 }}
    whileHover={{ scale: 1.35 }}
    whileFocus={{ scale: 1.35 }}
    onMouseEnter={() => onHover(true)}
    onMouseLeave={() => onHover(false)}
    onFocus={() => onHover(true)}
    onBlur={() => onHover(false)}
    onKeyDown={handleKeyDown}
    onClick={onSelect}
  ><span className="seating-code">{position.physicalCode}</span>{selected && <motion.span className="seating-selection-outline" layoutId="seating-selection-ring"/>}</motion.button>;
}
