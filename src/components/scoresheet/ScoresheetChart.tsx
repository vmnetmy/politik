import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ElectionData, ScoresheetResult, ScoresheetSection } from "../../types";
import { allianceColor } from "../../utils";
import { chartAnimation, getChartTheme } from "../charts/chartTheme";

const SECTION_LABELS: Record<ScoresheetSection, string> = { postal: "Pos", early: "Awal", ordinary: "Biasa" };

export function ScoresheetChart({ result, data }: { result: ScoresheetResult; data: ElectionData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const theme = getChartTheme();
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
        animation: chartAnimation(520),
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, color: theme.muted, font: { family: theme.fontFamily, size: 13, weight: 600 } } },
          tooltip: {
            backgroundColor: theme.tooltip,
            titleFont: { family: theme.fontFamily, size: 13, weight: 700 },
            bodyFont: { family: theme.fontFamily, size: 13, weight: 500 },
          },
        },
        scales: {
          x: { stacked: false, grid: { display: false }, ticks: { color: theme.muted, font: { family: theme.fontFamily, size: 13, weight: 600 } } },
          y: { beginAtZero: true, ticks: { color: theme.muted, font: { family: theme.fontFamily, size: 13, weight: 500 } }, grid: { color: theme.grid } },
        },
      },
    });
    return () => chart.destroy();
  }, [data, result]);
  return <div className="scoresheet-chart"><canvas ref={canvasRef} aria-label="Perbandingan undi calon bagi undi pos, awal dan biasa" role="img"/></div>;
}
