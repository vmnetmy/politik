import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { recordInteraction } from "../../telemetry";
import { Icon } from "../ui/Icon";

type Camera = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const STEP = 1.45;

function distance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: Point, second: Point) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function AtlasMapViewport({
  viewBox,
  label,
  status,
  children,
  fullscreenDetail,
  detailKey,
  detailColor,
  exportName,
}: {
  viewBox: string;
  label: string;
  status: ReactNode;
  children: ReactNode;
  fullscreenDetail: ReactNode;
  detailKey: string;
  detailColor: string;
  exportName: string;
}) {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cameraRef = useRef(camera);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ point?: Point; midpoint?: Point; distance?: number; moved: boolean }>({ moved: false });
  const dragControls = useDragControls();
  const [originX, originY, width, height] = viewBox.split(/\s+/).map(Number);

  const commit = (next: Camera) => {
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next.scale));
    const value = {
      scale,
      x: Math.min(0, Math.max(width * (1 - scale), next.x)),
      y: Math.min(0, Math.max(height * (1 - scale), next.y)),
    };
    cameraRef.current = value;
    setCamera(value);
  };
  const reset = () => commit({ x: 0, y: 0, scale: 1 });

  useEffect(() => reset(), [viewBox]);
  useEffect(() => {
    const listener = () => setIsFullscreen(document.fullscreenElement === rootRef.current || fallbackFullscreen);
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, [fallbackFullscreen]);
  useEffect(() => {
    if (!fallbackFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setIsFullscreen(true);
    return () => { document.body.style.overflow = previous; };
  }, [fallbackFullscreen]);

  const geometry = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const screenScale = Math.min(rect.width / width, rect.height / height);
    return { rect, screenScale, offsetX: (rect.width - width * screenScale) / 2, offsetY: (rect.height - height * screenScale) / 2 };
  };
  const clientToView = (point: Point) => {
    const current = geometry();
    if (!current) return { x: width / 2, y: height / 2 };
    return {
      x: (point.x - current.rect.left - current.offsetX) / current.screenScale,
      y: (point.y - current.rect.top - current.offsetY) / current.screenScale,
    };
  };
  const zoomAt = (requestedScale: number, clientPoint?: Point) => {
    const current = cameraRef.current;
    const screen = geometry();
    const target = clientPoint ?? (screen
      ? { x: screen.rect.left + screen.rect.width / 2, y: screen.rect.top + screen.rect.height / 2 }
      : { x: width / 2, y: height / 2 });
    const point = clientToView(target);
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, requestedScale));
    const ratio = scale / current.scale;
    commit({ scale, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio });
    recordInteraction("atlas-zoom", scale);
  };
  const toggleFullscreen = async () => {
    const root = rootRef.current;
    if (!root) return;
    if (fallbackFullscreen) {
      setFallbackFullscreen(false);
      setIsFullscreen(false);
    } else if (document.fullscreenElement === root) {
      await document.exitFullscreen();
    } else {
      try {
        if (root.requestFullscreen) await root.requestFullscreen();
        else setFallbackFullscreen(true);
      } catch {
        setFallbackFullscreen(true);
      }
    }
    recordInteraction("atlas-fullscreen");
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button, a")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length > 1) event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = points.length > 1
      ? { midpoint: midpoint(points[0], points[1]), distance: distance(points[0], points[1]), moved: false }
      : { point: points[0], moved: false };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const screen = geometry();
    if (!screen) return;
    if (points.length > 1) {
      const nextMidpoint = midpoint(points[0], points[1]);
      const nextDistance = distance(points[0], points[1]);
      if (gesture.current.midpoint && gesture.current.distance) {
        const current = cameraRef.current;
        const previousView = clientToView(gesture.current.midpoint);
        const nextView = clientToView(nextMidpoint);
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * nextDistance / gesture.current.distance));
        const worldX = (previousView.x - current.x) / current.scale;
        const worldY = (previousView.y - current.y) / current.scale;
        commit({ scale, x: nextView.x - worldX * scale, y: nextView.y - worldY * scale });
        gesture.current.moved = true;
      }
      gesture.current.midpoint = nextMidpoint;
      gesture.current.distance = nextDistance;
      return;
    }
    const previous = gesture.current.point;
    if (!previous || !points[0]) return;
    const deltaX = (points[0].x - previous.x) / screen.screenScale;
    const deltaY = (points[0].y - previous.y) / screen.screenScale;
    const current = cameraRef.current;
    if (current.scale > MIN_SCALE) {
      if (Math.abs(points[0].x - previous.x) + Math.abs(points[0].y - previous.y) > 6) {
        gesture.current.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      commit({ ...current, x: current.x + deltaX, y: current.y + deltaY });
    }
    gesture.current.point = points[0];
  };
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current = { point: [...pointers.current.values()][0], moved: gesture.current.moved };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    const current = cameraRef.current;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomAt(current.scale * Math.exp(-event.deltaY * .012), { x: event.clientX, y: event.clientY });
    } else if (current.scale > MIN_SCALE) {
      event.preventDefault();
      const screen = geometry();
      if (screen) commit({ ...current, x: current.x - event.deltaX / screen.screenScale, y: current.y - event.deltaY / screen.screenScale });
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomAt(cameraRef.current.scale * STEP); }
    else if (event.key === "-") { event.preventDefault(); zoomAt(cameraRef.current.scale / STEP); }
    else if (event.key === "0") { event.preventDefault(); reset(); }
    else if (event.key.toLowerCase() === "f") { event.preventDefault(); void toggleFullscreen(); }
  };
  const serialisedSvg = () => {
    const source = svgRef.current;
    if (!source) return null;
    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.querySelectorAll("path").forEach((path) => {
      path.setAttribute("stroke", "#f7f3ea");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("vector-effect", "non-scaling-stroke");
    });
    clone.querySelectorAll("text").forEach((text) => {
      text.setAttribute("font-family", "Inter, Arial, sans-serif");
      text.setAttribute("font-size", "11");
      text.setAttribute("font-weight", "700");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#172431");
    });
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", String(originX));
    background.setAttribute("y", String(originY));
    background.setAttribute("width", String(width));
    background.setAttribute("height", String(height));
    background.setAttribute("fill", "#f4f1e9");
    clone.insertBefore(background, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  };
  const download = (blob: Blob, extension: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportName}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const exportSvg = () => {
    const value = serialisedSvg();
    if (!value) return;
    download(new Blob([value], { type: "image/svg+xml;charset=utf-8" }), "svg");
    recordInteraction("atlas-export-svg");
  };
  const exportPng = () => {
    const value = serialisedSvg();
    if (!value) return;
    const url = URL.createObjectURL(new Blob([value], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = Math.round(1600 * height / width);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => { if (png) download(png, "png"); }, "image/png");
    };
    image.src = url;
    recordInteraction("atlas-export-png");
  };

  return <div
    ref={rootRef}
    className={`atlas-map-viewport${isFullscreen ? " is-fullscreen" : ""}${fallbackFullscreen ? " is-fullscreen-fallback" : ""}`}
    onPointerDown={pointerDown}
    onPointerMove={pointerMove}
    onPointerUp={pointerEnd}
    onPointerCancel={pointerEnd}
    onWheel={wheel}
    onKeyDown={keyDown}
    onDoubleClick={(event) => zoomAt(cameraRef.current.scale * STEP, { x: event.clientX, y: event.clientY })}
    onClickCapture={(event) => {
      if (cameraRef.current.scale > MIN_SCALE && gesture.current.moved) {
        event.preventDefault();
        event.stopPropagation();
      }
      gesture.current.moved = false;
    }}
  >
    {status}
    <div className="atlas-map-tools" aria-label="Kawalan peta">
      <button type="button" aria-label="Zum masuk" disabled={camera.scale >= MAX_SCALE} onClick={() => zoomAt(camera.scale * STEP)}><Icon name="zoom-in" size={18}/></button>
      <span aria-live="polite">{Math.round(camera.scale * 100)}%</span>
      <button type="button" aria-label="Zum keluar" disabled={camera.scale <= MIN_SCALE} onClick={() => zoomAt(camera.scale / STEP)}><Icon name="zoom-out" size={18}/></button>
      <button type="button" aria-label="Tetapkan semula peta" disabled={camera.scale <= MIN_SCALE} onClick={reset}><Icon name="reset" size={18}/></button>
      <button type="button" aria-label="Muat turun peta SVG" onClick={exportSvg}><Icon name="download" size={18}/><small>SVG</small></button>
      <button type="button" aria-label="Muat turun peta PNG" onClick={exportPng}><Icon name="download" size={18}/><small>PNG</small></button>
      <button type="button" aria-label={isFullscreen ? "Keluar skrin penuh" : "Buka skrin penuh"} aria-pressed={isFullscreen} onClick={() => void toggleFullscreen()}><Icon name={isFullscreen ? "fullscreen-exit" : "fullscreen"} size={18}/></button>
    </div>
    <motion.svg ref={svgRef} className="atlas-map" viewBox={viewBox} animate={{ viewBox }} role="group" aria-label={label}>
      <title>{label}</title>
      <g transform={`translate(${originX + camera.x} ${originY + camera.y}) scale(${camera.scale}) translate(${-originX} ${-originY})`}>{children}</g>
    </motion.svg>
    <div className="atlas-map-gesture-hint" aria-hidden="true">Cubit atau Ctrl + tatal · seret untuk alih · + / − / 0 / F</div>
    <AnimatePresence initial={false}>
      {isFullscreen && <motion.aside
        className="atlas-detail-panel atlas-floating-detail"
        drag
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={rootRef}
        dragMomentum={false}
        style={{ "--atlas-ticket": detailColor } as React.CSSProperties}
        initial={{ opacity: 0, scale: .95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: .96 }}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <button className="atlas-floating-detail-handle" type="button" onPointerDown={(event) => { event.stopPropagation(); dragControls.start(event); }}><Icon name="move" size={16}/> Seret maklumat kawasan</button>
        <AnimatePresence mode="wait" initial={false}><motion.div key={detailKey} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>{fullscreenDetail}</motion.div></AnimatePresence>
      </motion.aside>}
    </AnimatePresence>
  </div>;
}
