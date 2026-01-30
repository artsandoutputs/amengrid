"use client";

import { useEffect, useRef } from "react";

type WaveformProps = {
  peaks: number[] | null;
  totalSteps: number;
  isActive: boolean;
  progress?: number | null;
  highlightStep?: number | null;
  highlightSliceIndex?: number | null;
  sliceCount?: number | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const Waveform = ({
  peaks,
  totalSteps,
  isActive,
  progress,
  highlightStep,
  highlightSliceIndex,
  sliceCount
}: WaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !peaks || peaks.length === 0) return;

    const resize = () => {
      const width = container.clientWidth;
      const height = Math.max(56, Math.floor(container.clientHeight || 64));
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.clearRect(0, 0, width, height);

      const mid = height / 2;
      const waveColor = isActive ? "#0f0b08" : "#4f463a";
      const gridColor = "rgba(90, 84, 74, 0.4)";
      const highlightColor = "rgba(255, 170, 40, 0.6)";
      const progressColor = "rgba(255, 170, 40, 0.32)";
      const sourceHighlightColor = "rgba(255, 90, 40, 0.55)";

      if (progress !== null && progress !== undefined) {
        const fillWidth = width * clamp(progress, 0, 1);
        ctx.fillStyle = progressColor;
        ctx.fillRect(0, 0, fillWidth, height);
      }

      if (totalSteps > 0) {
        const stepWidth = width / totalSteps;
        for (let i = 0; i < totalSteps; i += 1) {
          const x = i * stepWidth;
          ctx.strokeStyle = gridColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        if (highlightStep !== null && highlightStep !== undefined && highlightStep >= 0) {
          const stepX = (highlightStep % totalSteps) * stepWidth;
          ctx.fillStyle = highlightColor;
          ctx.fillRect(stepX, 0, stepWidth, height);
        }
      }

      if (
        highlightSliceIndex !== null &&
        highlightSliceIndex !== undefined &&
        sliceCount &&
        sliceCount > 0
      ) {
        const sliceWidth = width / sliceCount;
        const sliceX = (highlightSliceIndex % sliceCount) * sliceWidth;
        ctx.fillStyle = sourceHighlightColor;
        ctx.fillRect(sliceX, 0, sliceWidth, height);
      }

      const drawEnvelope = (source: number[], color: string, alpha: number) => {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        const columns = Math.max(1, Math.floor(width));
        for (let x = 0; x < columns; x += 1) {
          const start = Math.floor((x / columns) * source.length);
          const end = Math.max(start + 1, Math.floor(((x + 1) / columns) * source.length));
          let max = 0;
          for (let i = start; i < end; i += 1) {
            const value = Math.abs(source[i]);
            if (value > max) max = value;
          }
          const peak = max * (height * 0.48);
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha * 0.45;
          ctx.fillRect(x, mid - peak, 1.4, peak * 2);
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, mid - peak);
          ctx.lineTo(x + 0.5, mid + peak);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };

      drawEnvelope(peaks, waveColor, 0.75);
    };

    resize();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [peaks, totalSteps, isActive, progress, highlightStep, highlightSliceIndex, sliceCount]);

  if (!peaks) {
    return <div className="waveform-placeholder" />;
  }

  return (
    <div ref={containerRef} className={`waveform ${isActive ? "active" : ""}`}>
      <canvas ref={canvasRef} />
    </div>
  );
};
