import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ElectionData, ScoresheetResult, ScoresheetSection } from "../../types";
import { allianceColor } from "../../utils";

const SECTION_LABELS: Record<ScoresheetSection, string> = { postal: "Pos", early: "Awal", ordinary: "Biasa" };

export function ScoresheetChart({ result, data }: { result: ScoresheetResult; data: ElectionData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const sections: ScoresheetSection[] = ["postal", "early", "ordinary"];
    const candidates = new Map(data.seats.find((seat) => seat.code === result.parliamentCode)?.candidates.map((candidate) => [candidate.id, candidate]) ?? []);
    const chart = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: sections.map((section) => SECTION_LABELS[section]),
        datasets: result.candidateColumns.map((column) => {
          const candidate = candidates.get(column.candidateId);
          return {
            label: column.candidateName,
            data: sections.map((section) => result.rows.filter((row) => row.section === section).reduce((sum, row) => sum + (row.candidateVotes[column.candidateId] ?? 0), 0)),
            backgroundColor: allianceColor(candidate?.alliance ?? "", data.alliances),
            borderWidth: 0,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 } } } },
        scales: {
          x: { stacked: false, grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: "rgba(20,55,44,.08)" } },
        },
      },
    });
    return () => chart.destroy();
  }, [data, result]);
  return <div className="scoresheet-chart"><canvas ref={canvasRef} aria-label="Perbandingan undi calon bagi undi pos, awal dan biasa" role="img"/></div>;
}
