import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ChartDataset } from "chart.js";
import { formatNumber } from "../../utils";
import { chartAnimation, formatCompactAxis, getChartTheme } from "./chartTheme";

export type ComparisonChartMetric = "kerusi" | "turnout" | "pemilih" | "calon" | "undi" | "bahagian";

export type ComparisonChartSeries = {
  label: string;
  data: Array<number | null>;
  color: string;
  stack?: string;
};

function valueLabel(metric: ComparisonChartMetric, value: number) {
  if (metric === "turnout" || metric === "bahagian") return `${value.toFixed(1)}%`;
  if (metric === "undi") return `${formatNumber(value)} undi`;
  if (metric === "pemilih") return `${formatNumber(value)} pemilih`;
  if (metric === "calon") return `${formatNumber(value)} calon`;
  return `${formatNumber(value)} kerusi`;
}

export function ElectionComparisonChart({
  labels,
  series,
  metric,
  stacked = false,
  horizontal = false,
  ariaLabel,
}: {
  labels: string[];
  series: ComparisonChartSeries[];
  metric: ComparisonChartMetric;
  stacked?: boolean;
  horizontal?: boolean;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const theme = getChartTheme();
    const datasets: ChartDataset<"bar", Array<number | null>>[] = series.map((item) => ({
      label: item.label,
      data: item.data,
      backgroundColor: item.color,
      borderColor: item.color,
      borderWidth: 0,
      borderRadius: stacked ? 0 : 4,
      borderSkipped: false,
      barPercentage: stacked ? .76 : .72,
      categoryPercentage: .78,
      stack: item.stack,
      skipNull: true,
    }));
    const chart = new Chart(canvasRef.current, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? "y" : "x",
        animation: chartAnimation(620),
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              boxWidth: 13,
              boxHeight: 13,
              color: theme.muted,
              padding: 18,
              font: { family: theme.fontFamily, size: 13, weight: 650 },
            },
          },
          tooltip: {
            backgroundColor: theme.tooltip,
            padding: 12,
            titleFont: { family: theme.fontFamily, size: 13, weight: 700 },
            bodyFont: { family: theme.fontFamily, size: 13, weight: 550 },
            callbacks: {
              label: (context) => {
                const value = context.raw;
                return value === null ? `${context.dataset.label}: Tidak berkenaan` : `${context.dataset.label}: ${valueLabel(metric, Number(value))}`;
              },
            },
          },
        },
        scales: horizontal ? {
          x: {
            stacked,
            beginAtZero: true,
            border: { display: false },
            grid: { color: theme.grid },
            ticks: {
              color: theme.muted,
              font: { family: theme.fontFamily, size: 12, weight: 550 },
              callback: (value) => metric === "turnout" || metric === "bahagian"
                ? `${value}%`
                : formatCompactAxis(Number(value)),
            },
          },
          y: {
            stacked,
            border: { display: false },
            grid: { display: false },
            ticks: {
              color: theme.muted,
              font: { family: theme.fontFamily, size: 12, weight: 650 },
            },
          },
        } : {
          x: {
            stacked,
            border: { display: false },
            grid: { display: false },
            ticks: {
              color: theme.muted,
              font: { family: theme.fontFamily, size: 12, weight: 650 },
              maxRotation: labels.length > 8 ? 55 : 0,
              minRotation: labels.length > 8 ? 28 : 0,
            },
          },
          y: {
            stacked,
            beginAtZero: true,
            border: { display: false },
            grid: { color: theme.grid },
            ticks: {
              color: theme.muted,
              font: { family: theme.fontFamily, size: 12, weight: 550 },
              callback: (value) => metric === "turnout" || metric === "bahagian"
                ? `${value}%`
                : formatCompactAxis(Number(value)),
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [ariaLabel, horizontal, labels, metric, series, stacked]);

  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel}/>;
}
