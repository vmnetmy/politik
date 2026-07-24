import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from "chart.js";
import { useEffect, useRef } from "react";
import type { AgeBand, AgeCounts } from "../../data/types/voterAge";
import { formatNumber } from "../../utils";
import { chartAnimation, formatCompactAxis, getChartTheme } from "./chartTheme";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

export function AgeDistributionChart({ bands, counts, label }: { bands: AgeBand[]; counts: AgeCounts; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const theme = getChartTheme();
    const chart = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: bands.map((band) => band === "90+" ? "90 ke atas" : band),
        datasets: [{
          label: "Pemilih",
          data: bands.map((band) => counts[band]),
          backgroundColor: bands.map((_, index) => index < 2 ? theme.accent : index < 5 ? theme.accentSecondary : theme.accentMuted),
          borderRadius: 3,
          borderSkipped: false,
          barPercentage: .72,
          categoryPercentage: .8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: chartAnimation(420),
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: theme.tooltip,
            titleFont: { family: theme.fontFamily, size: 13, weight: 700 },
            bodyFont: { family: theme.fontFamily, size: 13, weight: 500 },
            callbacks: { label: (context) => `${formatNumber(Number(context.raw))} pemilih` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: theme.muted, font: { family: theme.fontFamily, size: 13, weight: 600 } },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: theme.grid },
            ticks: {
              color: theme.muted,
              font: { family: theme.fontFamily, size: 13, weight: 500 },
              callback: (value) => formatCompactAxis(Number(value)),
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [bands, counts, label]);

  return <canvas ref={canvasRef} role="img" aria-label={`Carta taburan umur pemilih untuk ${label}`}/>;
}
