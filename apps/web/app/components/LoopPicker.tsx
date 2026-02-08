"use client";

import { useEffect, useRef, useState } from "react";
import { Waveform } from "./Waveform";

type LoopPickerProps = {
  peaks: number[] | null;
  durationSec: number;
  bpm: number | null;
  downbeat0Sec?: number;
  loopBars: number;
  startBarIndex: number;
  onStartBarChange: (index: number) => void;
  onLoopBarsChange: (bars: number) => void;
  onPlayToggle: () => void;
  isPlaying: boolean;
};

const barChoices = [0.25, 0.5, 1, 2, 4, 8, 16];
const nudgeChoices = [0.25, 0.5, 1, 2, 4];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatBarsLabel = (bars: number) => {
  if (bars === 0.25) return "1/4 bar";
  if (bars === 0.5) return "1/2 bar";
  return `${bars} bar${bars === 1 ? "" : "s"}`;
};

export const LoopPicker = ({
  peaks,
  durationSec,
  bpm,
  downbeat0Sec = 0,
  loopBars,
  startBarIndex,
  onStartBarChange,
  onLoopBarsChange,
  onPlayToggle,
  isPlaying
}: LoopPickerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{ offsetBars: number } | null>(null);
  const [nudgeBars, setNudgeBars] = useState<number>(4);
  const [viewportSec, setViewportSec] = useState<number>(0);
  const [scrollSec, setScrollSec] = useState<number>(0);

  const beatsPerBar = 4;
  const secondsPerBeat = bpm ? 60 / bpm : 0;
  const barDuration = secondsPerBeat * beatsPerBar;
  const barCount = bpm ? Math.max(1, Math.floor((durationSec - downbeat0Sec) / barDuration)) : 0;
  const maxStartBar = Math.max(0, Math.floor(barCount - loopBars));

  const startSec = bpm ? downbeat0Sec + startBarIndex * barDuration : 0;
  const endSec = bpm ? startSec + loopBars * barDuration : 0;

  useEffect(() => {
    if (!bpm || durationSec <= 0) return;
    const barDur = barDuration;
    const nextViewport = clamp((3 * barDur) / 32, 0.25, Math.min(30, durationSec));
    setViewportSec(nextViewport);
    const maxScroll = Math.max(0, durationSec - nextViewport);
    setScrollSec(clamp(downbeat0Sec, 0, maxScroll));
  }, [bpm, durationSec, downbeat0Sec, barDuration]);

  useEffect(() => {
    if (!bpm) return;
    if (startBarIndex > maxStartBar) {
      onStartBarChange(maxStartBar);
    }
  }, [bpm, maxStartBar, startBarIndex, onStartBarChange]);

  useEffect(() => {
    if (!bpm || viewportSec <= 0) return;
    setScrollSec((prev) => {
      const maxScroll = Math.max(0, durationSec - viewportSec);
      let next = prev;
      const safeLeft = prev + 0.2 * viewportSec;
      const safeRight = prev + 0.8 * viewportSec;
      if (startSec < safeLeft) {
        next = startSec - 0.2 * viewportSec;
      }
      if (endSec > safeRight) {
        next = endSec - 0.8 * viewportSec;
      }
      return clamp(next, 0, maxScroll);
    });
  }, [bpm, startSec, endSec, viewportSec, durationSec]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!bpm) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pxPerSec = rect.width / Math.max(0.001, viewportSec || durationSec);
    const timeSec = scrollSec + (event.clientX - rect.left) / pxPerSec;
    const pointerBarIndex = Math.round((timeSec - downbeat0Sec) / barDuration);
    const offsetBars = pointerBarIndex - Math.round(startBarIndex);
    setDragState({ offsetBars });
    container.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!bpm || !dragState) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pxPerSec = rect.width / Math.max(0.001, viewportSec || durationSec);
    const timeSec = scrollSec + (event.clientX - rect.left) / pxPerSec;
    const pointerBarIndex = Math.round((timeSec - downbeat0Sec) / barDuration);
    const rawIndex = pointerBarIndex - dragState.offsetBars;
    const nextIndex = Math.min(maxStartBar, Math.max(0, rawIndex));
    onStartBarChange(Math.round(nextIndex));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const container = containerRef.current;
    if (container) {
      container.releasePointerCapture(event.pointerId);
    }
    setDragState(null);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!bpm || viewportSec <= 0) return;
    const container = containerRef.current;
    if (!container) return;
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const deltaSec = (delta / Math.max(1, rect.width)) * viewportSec;
    setScrollSec((prev) => {
      const maxScroll = Math.max(0, durationSec - viewportSec);
      return clamp(prev + deltaSec, 0, maxScroll);
    });
  };

  const handleLoopBarsChange = (direction: "half" | "double") => {
    const currentIndex = barChoices.indexOf(loopBars);
    if (currentIndex === -1) return;
    let nextIndex = currentIndex;
    if (direction === "half") {
      nextIndex = Math.max(0, currentIndex - 1);
    } else {
      nextIndex = Math.min(barChoices.length - 1, currentIndex + 1);
    }
    const nextBars = barChoices[nextIndex];
    onLoopBarsChange(nextBars);
  };

  const applyNudge = (deltaBars: number) => {
    if (!bpm) return;
    const nextIndex = Math.min(maxStartBar, Math.max(0, startBarIndex + deltaBars));
    onStartBarChange(Math.round(nextIndex));
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!bpm) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const increment = event.shiftKey ? 4 : nudgeBars;
      const delta = event.key === "ArrowLeft" ? -increment : increment;
      applyNudge(delta);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bpm, nudgeBars, startBarIndex, maxStartBar]);

  const visiblePeaks = (() => {
    if (!peaks || peaks.length === 0 || viewportSec <= 0 || durationSec <= 0) return peaks;
    if (viewportSec >= durationSec) return peaks;
    const startRatio = clamp(scrollSec / durationSec, 0, 1);
    const endRatio = clamp((scrollSec + viewportSec) / durationSec, 0, 1);
    const startIndex = Math.floor(startRatio * peaks.length);
    const endIndex = Math.max(startIndex + 1, Math.ceil(endRatio * peaks.length));
    return peaks.slice(startIndex, endIndex);
  })();

  const totalSteps = bpm && barDuration > 0 ? Math.max(1, Math.round(viewportSec / barDuration)) : 1;
  const leftPercent = bpm && viewportSec > 0 ? ((startSec - scrollSec) / viewportSec) * 100 : 0;
  const widthPercent = bpm && viewportSec > 0 ? ((endSec - startSec) / viewportSec) * 100 : 0;

  return (
    <section className="analysis">
      <h2>Loop Picker</h2>
      {!bpm && <p className="status">Run Analyze to enable bar snapping.</p>}
      <div className="analysis-meta">
        <span>Bars: {formatBarsLabel(loopBars)}</span>
        <span>Start bar: {startBarIndex + 1}</span>
        <span>Start: {startSec.toFixed(2)}s</span>
        <span>End: {endSec.toFixed(2)}s</span>
      </div>
      <div className="loop-picker-stage">
        <div className="loop-picker-foreground">
          <div
            className="loop-picker"
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
          >
            <Waveform peaks={visiblePeaks} totalSteps={totalSteps} isActive progress={null} highlightStep={null} />
            <div className="loop-bracket" style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }} />
          </div>
        </div>
      </div>
      <div className="loop-controls-row">
        <div className="loop-controls-left">
          <div className="nudge-controls">
            <select
              value={nudgeBars}
              onChange={(event) => setNudgeBars(Number(event.target.value))}
              disabled={!bpm}
            >
              {nudgeChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {formatBarsLabel(choice)}
                </option>
              ))}
            </select>
            <button className="control-button nudge" onClick={() => applyNudge(-nudgeBars)} disabled={!bpm}>
              ⟵
            </button>
            <button className="control-button nudge" onClick={() => applyNudge(nudgeBars)} disabled={!bpm}>
              ⟶
            </button>
          </div>
        </div>
        <div className="loop-controls-center">
          <button
            className={`control-button play ${isPlaying ? "stop" : "start"} play-button`}
            onClick={onPlayToggle}
            disabled={!bpm}
            aria-label={isPlaying ? "Stop" : "Play"}
            title={isPlaying ? "Stop" : "Play"}
            type="button"
          >
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
        <div className="loop-controls-right">
          <button className="control-button loop" onClick={() => handleLoopBarsChange("half")} disabled={!bpm}>
            −
          </button>
          <span className="loop-bars-label">{formatBarsLabel(loopBars)}</span>
          <button className="control-button loop" onClick={() => handleLoopBarsChange("double")} disabled={!bpm}>
            ＋
          </button>
        </div>
      </div>
    </section>
  );
};
