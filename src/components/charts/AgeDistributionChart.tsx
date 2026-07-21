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

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

export function AgeDistributionChart({ bands, counts, label }: { bands: AgeBand[]; counts: AgeCounts; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: bands.map((band) => band === "90+" ? "90 ke atas" : band),
        datasets: [{
          label: "Pemilih",
          data: bands.map((band) => counts[band]),
          backgroundColor: bands.map((_, index) => index < 2 ? "#b9eb5d" : index < 5 ? "#1d745f" : "#8ba49b"),
          borderRadius: 3,
          borderSkipped: false,
          barPercentage: .72,
          categoryPercentage: .8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 320 },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (context) => `${formatNumber(Number(context.raw))} pemilih` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: "#65736c", font: { family: "Inter", size: 14, weight: 600 } },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: "rgba(83, 99, 91, .14)" },
            ticks: {
              color: "#7b8580",
              font: { family: "Inter", size: 13, weight: 500 },
              callback: (value) => new Intl.NumberFormat("ms-MY", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value)),
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [bands, counts]);

  return <canvas ref={canvasRef} role="img" aria-label={`Carta taburan umur pemilih untuk ${label}`}/>;
}
