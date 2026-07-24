import type { CSSProperties } from "react";
import { motion } from "motion/react";

const EDITION_PALETTE = ["#d5a820", "#2f69a3", "#df4b43", "#16806d", "#8c5899", "#a47f35"];

export type ComparisonEditionOption = {
  id: number;
  label: string;
  color?: string;
};

export type ComparisonMetricOption<Metric extends string> = {
  id: Metric;
  label: string;
};

export function comparisonEditionColor(editionNumber: number, orderedEditions: number[]) {
  const index = Math.max(0, orderedEditions.indexOf(editionNumber));
  return EDITION_PALETTE[index % EDITION_PALETTE.length];
}

export function ComparisonEditionPicker({
  editions,
  selected,
  onToggle,
}: {
  editions: ComparisonEditionOption[];
  selected: number[];
  onToggle: (edition: number) => void;
}) {
  return <div className="comparison-edition-picker">
    <span>EDISI DIBANDINGKAN</span>
    <div style={{ "--edition-count": editions.length } as CSSProperties}>{editions.map((edition) => {
      const active = selected.includes(edition.id);
      return <button key={edition.id} type="button" className={active ? "is-active" : ""} onClick={() => onToggle(edition.id)} aria-pressed={active}>
        <i style={{ background: edition.color }}/>
        {edition.label}
      </button>;
    })}</div>
  </div>;
}

export function ComparisonMetricTabs<Metric extends string>({
  options,
  selected,
  layoutId,
  onChange,
}: {
  options: ComparisonMetricOption<Metric>[];
  selected: Metric;
  layoutId: string;
  onChange: (metric: Metric) => void;
}) {
  return <div className="comparison-metric-tabs">{options.map((option) => <button
    key={option.id}
    type="button"
    className={selected === option.id ? "is-active" : ""}
    onClick={() => onChange(option.id)}
    aria-pressed={selected === option.id}
  >
    {selected === option.id && <motion.i layoutId={layoutId} transition={{ type: "spring", stiffness: 420, damping: 34 }}/>}
    <span>{option.label}</span>
  </button>)}</div>;
}
