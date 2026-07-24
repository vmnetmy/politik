import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { AnimatePresence, motion, MotionConfig, useDragControls } from "motion/react";
import type { DunBoundaryData, DunBoundaryFeature, StateElectionContest } from "../../data/types/stateElection";
import type { DunReference } from "../../data/types/voterAge";
import { contestWinner, ticketColor } from "../../data/stateElectionUtils";
import { Icon } from "../ui/Icon";

export type StateElectionMapSeat = {
  feature: DunBoundaryFeature;
  contest: StateElectionContest;
  dun: DunReference;
};

type Direction = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
type MapCamera = { x: number; y: number; scale: number };
type PointerPosition = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const ZOOM_STEP = 1.4;

const DIRECTIONS: Record<Direction, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function directionalSeat(current: StateElectionMapSeat, seats: StateElectionMapSeat[], key: Direction) {
  const [directionX, directionY] = DIRECTIONS[key];
  const [currentX, currentY] = current.feature.centroid;
  return seats
    .filter((seat) => seat.feature.id !== current.feature.id)
    .map((seat) => {
      const deltaX = seat.feature.centroid[0] - currentX;
      const deltaY = seat.feature.centroid[1] - currentY;
      const distance = Math.hypot(deltaX, deltaY);
      const directionalProgress = (deltaX * directionX + deltaY * directionY) / Math.max(1, distance);
      return { seat, distance, directionalProgress, score: distance / Math.max(.08, directionalProgress ** 3) };
    })
    .filter((item) => item.directionalProgress > .18)
    .sort((a, b) => a.score - b.score)[0]?.seat;
}

function distance(first: PointerPosition, second: PointerPosition) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: PointerPosition, second: PointerPosition) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function StateElectionMap({
  boundaries,
  seats,
  selectedId,
  ticketFilter,
  onSelect,
  fullscreenDetail,
  fullscreenDetailKey,
  fullscreenDetailColor,
}: {
  boundaries: DunBoundaryData;
  seats: StateElectionMapSeat[];
  selectedId: string;
  ticketFilter: string;
  onSelect: (id: string) => void;
  fullscreenDetail?: ReactNode;
  fullscreenDetailKey?: string;
  fullscreenDetailColor?: string;
}) {
  const [hoveredId, setHoveredId] = useState("");
  const [camera, setCamera] = useState<MapCamera>({ x: 0, y: 0, scale: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const detailDragControls = useDragControls();
  const canvasRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef(new Map<string, SVGPathElement>());
  const cameraRef = useRef(camera);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const gestureRef = useRef<{ lastPoint?: PointerPosition; lastMidpoint?: PointerPosition; lastDistance?: number; moved: boolean }>({ moved: false });
  const lastDragEndedAtRef = useRef(0);
  const seatById = useMemo(() => new Map(seats.map((seat) => [seat.feature.id, seat])), [seats]);
  const selected = seatById.get(selectedId) ?? seats[0];
  const hovered = seatById.get(hoveredId);
  const eligibleSeats = ticketFilter === "SEMUA" ? seats : seats.filter((seat) => contestWinner(seat.contest).shortName === ticketFilter);
  const width = boundaries.metadata.viewBox.width;
  const height = boundaries.metadata.viewBox.height;

  const commitCamera = (next: MapCamera) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const value = {
      scale,
      x: Math.min(0, Math.max(width * (1 - scale), next.x)),
      y: Math.min(0, Math.max(height * (1 - scale), next.y)),
    };
    cameraRef.current = value;
    setCamera(value);
  };

  const screenGeometry = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const screenScale = Math.min(rect.width / width, rect.height / height);
    return {
      rect,
      screenScale,
      offsetX: (rect.width - width * screenScale) / 2,
      offsetY: (rect.height - height * screenScale) / 2,
    };
  };

  const clientToView = (point: PointerPosition) => {
    const geometry = screenGeometry();
    if (!geometry) return { x: width / 2, y: height / 2 };
    return {
      x: (point.x - geometry.rect.left - geometry.offsetX) / geometry.screenScale,
      y: (point.y - geometry.rect.top - geometry.offsetY) / geometry.screenScale,
    };
  };

  const zoomAt = (nextScale: number, clientPoint?: PointerPosition) => {
    const current = cameraRef.current;
    const geometry = screenGeometry();
    const target = clientPoint ?? (geometry
      ? { x: geometry.rect.left + geometry.rect.width / 2, y: geometry.rect.top + geometry.rect.height / 2 }
      : { x: width / 2, y: height / 2 });
    const viewPoint = clientToView(target);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const ratio = scale / current.scale;
    commitCamera({
      scale,
      x: viewPoint.x - (viewPoint.x - current.x) * ratio,
      y: viewPoint.y - (viewPoint.y - current.y) * ratio,
    });
  };

  const resetCamera = () => commitCamera({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === canvasRef.current || fallbackFullscreen);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [fallbackFullscreen]);

  useEffect(() => {
    if (!fallbackFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setIsFullscreen(true);
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fallbackFullscreen]);

  const toggleFullscreen = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (fallbackFullscreen) {
      setFallbackFullscreen(false);
      setIsFullscreen(false);
      return;
    }
    if (document.fullscreenElement === canvas) {
      await document.exitFullscreen();
      return;
    }
    try {
      if (canvas.requestFullscreen) await canvas.requestFullscreen();
      else setFallbackFullscreen(true);
    } catch {
      setFallbackFullscreen(true);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button")) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const points = [...pointersRef.current.values()];
    gestureRef.current.moved = false;
    if (points.length === 1) {
      gestureRef.current.lastPoint = points[0];
    } else if (points.length === 2) {
      gestureRef.current.lastMidpoint = midpoint(points[0], points[1]);
      gestureRef.current.lastDistance = distance(points[0], points[1]);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const currentMidpoint = midpoint(points[0], points[1]);
      const currentDistance = distance(points[0], points[1]);
      const previousMidpoint = gestureRef.current.lastMidpoint;
      const previousDistance = gestureRef.current.lastDistance;
      if (previousMidpoint && previousDistance) {
        const current = cameraRef.current;
        const previousView = clientToView(previousMidpoint);
        const currentView = clientToView(currentMidpoint);
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * currentDistance / previousDistance));
        const worldX = (previousView.x - current.x) / current.scale;
        const worldY = (previousView.y - current.y) / current.scale;
        commitCamera({
          scale: nextScale,
          x: currentView.x - worldX * nextScale,
          y: currentView.y - worldY * nextScale,
        });
        gestureRef.current.moved = true;
      }
      gestureRef.current.lastMidpoint = currentMidpoint;
      gestureRef.current.lastDistance = currentDistance;
      return;
    }
    const previous = gestureRef.current.lastPoint;
    const currentPoint = points[0];
    if (!previous || !currentPoint) return;
    const geometry = screenGeometry();
    if (!geometry) return;
    const deltaX = (currentPoint.x - previous.x) / geometry.screenScale;
    const deltaY = (currentPoint.y - previous.y) / geometry.screenScale;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 1) gestureRef.current.moved = true;
    const current = cameraRef.current;
    if (current.scale > MIN_SCALE) commitCamera({ ...current, x: current.x + deltaX, y: current.y + deltaY });
    gestureRef.current.lastPoint = currentPoint;
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current.moved) lastDragEndedAtRef.current = Date.now();
    pointersRef.current.delete(event.pointerId);
    const remaining = [...pointersRef.current.values()];
    gestureRef.current = { lastPoint: remaining[0], moved: false };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const current = cameraRef.current;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomAt(current.scale * Math.exp(-event.deltaY * .012), { x: event.clientX, y: event.clientY });
      return;
    }
    if (current.scale <= MIN_SCALE) return;
    event.preventDefault();
    const geometry = screenGeometry();
    if (!geometry) return;
    commitCamera({
      ...current,
      x: current.x - event.deltaX / geometry.screenScale,
      y: current.y - event.deltaY / geometry.screenScale,
    });
  };

  const onMapKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAt(cameraRef.current.scale * ZOOM_STEP);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomAt(cameraRef.current.scale / ZOOM_STEP);
    } else if (event.key === "0") {
      event.preventDefault();
      resetCamera();
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      void toggleFullscreen();
    }
  };

  const focusSeat = (seat: StateElectionMapSeat) => {
    onSelect(seat.feature.id);
    requestAnimationFrame(() => pathRefs.current.get(seat.feature.id)?.focus());
  };

  return <MotionConfig reducedMotion="user" transition={{ duration: .28, ease: [0.22, 1, 0.36, 1] }}>
    <div
      ref={canvasRef}
      className={`prn-map-canvas${isFullscreen ? " is-fullscreen" : ""}${fallbackFullscreen ? " is-fullscreen-fallback" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onWheel={onWheel}
      onDoubleClick={(event) => zoomAt(cameraRef.current.scale * ZOOM_STEP, { x: event.clientX, y: event.clientY })}
      onKeyDown={onMapKeyDown}
    >
      <AnimatePresence mode="wait" initial={false}>
        {(hovered ?? selected) && <motion.div
          className="prn-map-hover-label"
          key={(hovered ?? selected).feature.id}
          initial={{ opacity: 0, y: 7, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -5, filter: "blur(4px)" }}
        >
          <span>{(hovered ?? selected).feature.code}</span>
          <strong>{(hovered ?? selected).feature.name}</strong>
          <b>{contestWinner((hovered ?? selected).contest).shortName}</b>
        </motion.div>}
      </AnimatePresence>
      <motion.div className="prn-map-tools" aria-label="Kawalan peta" layout>
        <button type="button" aria-label="Zum masuk" disabled={camera.scale >= MAX_SCALE} onClick={() => zoomAt(cameraRef.current.scale * ZOOM_STEP)}><Icon name="zoom-in" size={19}/></button>
        <span aria-live="polite">{Math.round(camera.scale * 100)}%</span>
        <button type="button" aria-label="Zum keluar" disabled={camera.scale <= MIN_SCALE} onClick={() => zoomAt(cameraRef.current.scale / ZOOM_STEP)}><Icon name="zoom-out" size={19}/></button>
        <button type="button" aria-label="Tetapkan semula peta" disabled={camera.scale <= MIN_SCALE} onClick={resetCamera}><Icon name="reset" size={18}/></button>
        <button type="button" aria-label={isFullscreen ? "Keluar skrin penuh" : "Buka skrin penuh"} aria-pressed={isFullscreen} onClick={() => void toggleFullscreen()}><Icon name={isFullscreen ? "fullscreen-exit" : "fullscreen"} size={19}/></button>
      </motion.div>
      <AnimatePresence initial={false}>
        {isFullscreen && fullscreenDetail && <motion.aside
          className="prn-map-detail prn-map-floating-detail"
          aria-label={`Maklumat kawasan dipilih${selected ? `: ${selected.feature.name}` : ""}`}
          drag
          dragControls={detailDragControls}
          dragListener={false}
          dragConstraints={canvasRef}
          dragElastic={.04}
          dragMomentum={false}
          initial={{ opacity: 0, scale: .94, clipPath: "inset(0 0 100% 0)" }}
          animate={{ opacity: 1, scale: 1, clipPath: "inset(0 0 0% 0)" }}
          exit={{ opacity: 0, scale: .96, clipPath: "inset(100% 0 0 0)" }}
          transition={{ type: "spring", stiffness: 330, damping: 30 }}
          style={{ "--map-ticket": fullscreenDetailColor ?? "#f0c73d" } as React.CSSProperties}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="prn-map-floating-detail-handle"
            aria-label="Seret panel maklumat"
            onPointerDown={(event) => {
              event.stopPropagation();
              detailDragControls.start(event);
            }}
          >
            <Icon name="move" size={17}/><span>Maklumat kawasan · seret untuk alih</span>
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="prn-map-floating-detail-content"
              key={fullscreenDetailKey ?? selectedId}
              initial={{ opacity: 0, x: 18, filter: "blur(3px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -14, filter: "blur(3px)" }}
              transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}
            >
              {fullscreenDetail}
            </motion.div>
          </AnimatePresence>
        </motion.aside>}
      </AnimatePresence>
      <div className="prn-map-gesture-hint" aria-hidden="true">{isFullscreen ? "Cubit atau Ctrl + tatal · Seret untuk alih · + / − / 0 / F" : "Cubit untuk zum · Seret untuk alih"}</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Peta keputusan 36 DUN Negeri Sembilan"
        role="group"
      >
        <title>Peta keputusan 36 DUN Negeri Sembilan</title>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
          <g className="prn-map-features">
            {seats.map((seat) => {
              const winner = contestWinner(seat.contest);
              const selectedSeat = seat.feature.id === selected?.feature.id;
              const eligible = ticketFilter === "SEMUA" || winner.shortName === ticketFilter;
              return <motion.path
                key={seat.feature.id}
                ref={(element) => {
                  if (element) pathRefs.current.set(seat.feature.id, element);
                  else pathRefs.current.delete(seat.feature.id);
                }}
                d={seat.feature.path}
                fillRule="evenodd"
                role="button"
                tabIndex={selectedSeat && eligible ? 0 : -1}
                aria-hidden={!eligible}
                aria-pressed={selectedSeat}
                aria-label={`${seat.feature.code} ${seat.feature.name}, pemenang ${winner.shortName}, ${winner.name}`}
                style={{ pointerEvents: eligible ? "auto" : "none" }}
                animate={{
                  fill: ticketColor(winner.shortName),
                  opacity: eligible ? 1 : .12,
                  strokeWidth: selectedSeat ? 3.6 : 1.35,
                  stroke: selectedSeat ? "#f0c73d" : "#f7f3e8",
                }}
                onClick={() => eligible && Date.now() - lastDragEndedAtRef.current > 180 && onSelect(seat.feature.id)}
                onFocus={() => eligible && onSelect(seat.feature.id)}
                onMouseEnter={() => setHoveredId(seat.feature.id)}
                onMouseLeave={() => setHoveredId("")}
                onKeyDown={(event) => {
                  if (!(event.key in DIRECTIONS)) return;
                  event.preventDefault();
                  const next = directionalSeat(seat, eligibleSeats, event.key as Direction);
                  if (next) focusSeat(next);
                }}
              />;
            })}
          </g>
          {selected && <motion.circle
            className="prn-map-selection-marker"
            initial={false}
            animate={{ cx: selected.feature.centroid[0], cy: selected.feature.centroid[1], r: 10 / camera.scale }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
          />}
        </g>
      </svg>
    </div>
  </MotionConfig>;
}
