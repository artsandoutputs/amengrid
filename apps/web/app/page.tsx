"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PATTERN_PACKS, type PatternPack, type StepEvent, resolveFillOffsets } from "./patternPacks";
import { LoopPicker } from "./components/LoopPicker";
import { Waveform } from "./components/Waveform";

const DISCLAIMER_KEY = "amengrid_disclaimer_accepted";

type UploadResponse = {
  id: string;
  source?: string;
  original: { path: string; mime: string; size: number };
  converted: { path: string; format: string; sampleRate: number; bitDepth: number; channels: number };
};

type AnalysisResponse = {
  id: string;
  analysis: {
    durationSec: number;
    bpm: number;
    downbeat0Sec?: number;
    bars: { barDurationSec: number; barStartsSec: number[] };
  };
};

type LoopBars = 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;
type LoopSelection = { startSec: number; endSec: number; bars: LoopBars };

type LoopPlaybackState = {
  startSec: number;
  endSec: number;
  startedAt: number;
};

type TransportState = {
  startTime: number;
  loopStartSec: number;
  loopDurationSec: number;
  baseStepDuration: number;
  playbackStepDuration: number;
  stepsPerBar: number;
  totalSteps: number;
  baseTotalSteps: number;
  phraseBars: number;
  activeMainId: string | null;
  activeMainSteps: StepEvent[] | null;
  mainBeforeFillId: string | null;
  queuedMainId: string | null;
  queuedStepsPerBar: number | null;
  queuedLoop: { startBarIndex: number; bars: LoopBars } | null;
  playbackBpm: number;
  queuedPlaybackBpm: number | null;
  queuedFillId: string | null;
  activeFillId: string | null;
  activeFillSteps: StepEvent[] | null;
  fillUntilStep: number | null;
  fillStartStep: number | null;
  fillStepsRemaining: number | null;
  fillStepIndex: number | null;
  nextStep: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const BASE_STEPS_PER_BAR = 16;

const computePeaksFromChannel = (data: Float32Array, points: number) => {
  const blockSize = Math.max(1, Math.floor(data.length / points));
  const peaks: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const start = i * blockSize;
    const end = Math.min(data.length, start + blockSize);
    let max = 0;
    for (let j = start; j < end; j += 1) {
      const value = Math.abs(data[j]);
      if (value > max) max = value;
    }
    peaks.push(max);
  }
  return peaks;
};

const computePeaksFromBuffer = (buffer: AudioBuffer, points = 700) => {
  const channel = buffer.getChannelData(0);
  return computePeaksFromChannel(channel, points);
};

const POINTS_PER_SLICE = 18;

const buildSlicePeaksFromBuffer = (
  buffer: AudioBuffer,
  loop: LoopSelection,
  totalSteps: number,
  pointsPerSlice = POINTS_PER_SLICE
) => {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(loop.startSec * sampleRate);
  const endSample = Math.min(channel.length, Math.floor(loop.endSec * sampleRate));
  const loopSamples = Math.max(1, endSample - startSample);
  const samplesPerStep = Math.max(1, Math.floor(loopSamples / totalSteps));
  const peaks: number[] = [];
  for (let step = 0; step < totalSteps; step += 1) {
    const stepStart = startSample + step * samplesPerStep;
    const stepEnd = Math.min(endSample, stepStart + samplesPerStep);
    const slice = channel.subarray(stepStart, stepEnd);
    peaks.push(...computePeaksFromChannel(slice, pointsPerSlice));
  }
  return peaks;
};

const expandOrder = (order: StepEvent[], totalSteps: number) => {
  if (order.length === totalSteps) return order;
  const expanded: StepEvent[] = [];
  for (let i = 0; i < totalSteps; i += 1) {
    expanded.push(order[i % order.length]);
  }
  return expanded;
};

const resolveStepEvent = (event: StepEvent | undefined) => {
  if (typeof event === "number") {
    return { index: event, retrig: 1 };
  }
  if (event == null) {
    return { index: -1, retrig: 1 };
  }
  return { index: event.i, retrig: event.r ?? 1, gain: event.g ?? 1 };
};

const toSliceIndex = (event: StepEvent | undefined, barOffset = 0) => {
  const resolved = resolveStepEvent(event);
  return resolved.index + barOffset;
};

const expandOrderToIndices = (order: StepEvent[], totalSteps: number) => {
  const expanded = expandOrder(order, totalSteps);
  return expanded.map((event) => toSliceIndex(event));
};

const reorderSlicePeaks = (peaks: number[], order: number[], pointsPerSlice: number) => {
  if (peaks.length === 0) return peaks;
  const slices = Math.floor(peaks.length / pointsPerSlice);
  if (slices <= 0) return peaks;
  const reordered: number[] = [];
  for (let i = 0; i < order.length; i += 1) {
    const rawIndex = order[i];
    if (rawIndex < 0) {
      reordered.push(...Array.from({ length: pointsPerSlice }, () => 0));
      continue;
    }
    const sliceIndex = ((rawIndex % slices) + slices) % slices;
    const start = sliceIndex * pointsPerSlice;
    const end = start + pointsPerSlice;
    reordered.push(...peaks.slice(start, end));
  }
  return reordered;
};

export default function Home() {
  const [accepted, setAccepted] = useState(false);
  const [ingestMode, setIngestMode] = useState<"upload" | "youtube">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeConsent, setYoutubeConsent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeLoopBars, setActiveLoopBars] = useState<LoopBars>(2);
  const [activeStartBarIndex, setActiveStartBarIndex] = useState(0);
  const [queuedLoop, setQueuedLoop] = useState<{ startBarIndex: number; bars: LoopBars } | null>(null);
  const [sliceStatus, setSliceStatus] = useState<string | null>(null);
  const [isSlicing, setIsSlicing] = useState(false);
  const [hasSliced, setHasSliced] = useState(false);
  const [patternPackId, setPatternPackId] = useState<string>("dnb_jungle");
  const [activeMainId, setActiveMainId] = useState<string | null>(null);
  const [queuedMainId, setQueuedMainId] = useState<string | null>(null);
  const [queuedFillId, setQueuedFillId] = useState<string | null>(null);
  const [activeFillId, setActiveFillId] = useState<string | null>(null);
  const [customPatternSteps, setCustomPatternSteps] = useState<Record<string, StepEvent[]>>({});
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [stepsPerBar, setStepsPerBar] = useState<number>(16);
  const [queuedStepsPerBar, setQueuedStepsPerBar] = useState<number | null>(null);
  const [phraseBars] = useState<number>(4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gaplessEnabled, setGaplessEnabled] = useState(true);
  const [playbackBpm, setPlaybackBpm] = useState<number>(130);
  const [queuedPlaybackBpm, setQueuedPlaybackBpm] = useState<number | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [theme, setTheme] = useState<"default" | "vst">("default");
  const [fullBuffer, setFullBuffer] = useState<AudioBuffer | null>(null);
  const [fullPeaks, setFullPeaks] = useState<number[] | null>(null);
  const [slicePeaks, setSlicePeaks] = useState<number[] | null>(null);
  const [loopPlayback, setLoopPlayback] = useState<LoopPlaybackState | null>(null);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [currentSliceIndex, setCurrentSliceIndex] = useState<number | null>(null);
  const [patternProgress, setPatternProgress] = useState(0);
  const tempoPresets = useMemo(() => [87, 100, 126, 140, 155, 172], []);

  const audioRef = useRef<{ ctx: AudioContext | null; timer: number | null }>({
    ctx: null,
    timer: null
  });
  const customPatternStepsRef = useRef<Record<string, StepEvent[]>>({});
  const youtubeProgressRef = useRef<number | null>(null);
  const loopSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const transportRef = useRef<TransportState | null>(null);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const schedulerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const repeatHoldIndexRef = useRef<number | null>(null);
  const reverseHoldRef = useRef<{ active: boolean; startIndex: number; offset: number }>({
    active: false,
    startIndex: 0,
    offset: 0
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(DISCLAIMER_KEY);
    if (stored === "true") {
      setAccepted(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (youtubeProgressRef.current) {
        window.clearInterval(youtubeProgressRef.current);
        youtubeProgressRef.current = null;
      }
    };
  }, []);

  const bpm = analysisResult?.analysis.bpm ?? null;
  const downbeat0Sec = analysisResult?.analysis.downbeat0Sec ?? 0;
  const durationSec = analysisResult?.analysis.durationSec ?? 0;
  const secondsPerBeat = bpm ? 60 / bpm : 0;
  const barDuration = secondsPerBeat * 4;

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("amengrid_theme");
    if (storedTheme === "vst" || storedTheme === "default") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    setStatus(null);
    setResponse(null);
    setProgress(0);
    if (youtubeProgressRef.current) {
      window.clearInterval(youtubeProgressRef.current);
      youtubeProgressRef.current = null;
    }
  }, [ingestMode]);

  useEffect(() => {
    if (!bpm) return;
    setPlaybackBpm(Math.round(bpm));
  }, [bpm]);

  useEffect(() => {
    customPatternStepsRef.current = customPatternSteps;
    if (transportRef.current) {
      if (transportRef.current.activeMainId) {
        const steps = getPatternStepsById(transportRef.current.activeMainId);
        if (steps) {
          transportRef.current.activeMainSteps = steps;
        }
      }
      if (transportRef.current.activeFillId) {
        const steps = getPatternStepsById(transportRef.current.activeFillId);
        if (steps) {
          transportRef.current.activeFillSteps = steps;
        }
      }
    }
  }, [customPatternSteps]);

  const canUpload = accepted && file && !isUploading;
  const canIngest =
    ingestMode === "upload"
      ? canUpload
      : accepted && youtubeConsent && youtubeUrl.trim().length > 0 && !isUploading;

  const formattedProgress = useMemo(() => {
    if (!isUploading) return null;
    return `${progress}%`;
  }, [progress, isUploading]);

  const displayStartBarIndex = queuedLoop?.startBarIndex ?? activeStartBarIndex;
  const displayLoopBars = queuedLoop?.bars ?? activeLoopBars;

  const selectedLoop = useMemo<LoopSelection | null>(() => {
    if (!bpm) return null;
    const startSec = downbeat0Sec + displayStartBarIndex * barDuration;
    const endSec = Math.min(durationSec, startSec + displayLoopBars * barDuration);
    return { startSec, endSec, bars: displayLoopBars };
  }, [bpm, downbeat0Sec, displayStartBarIndex, barDuration, durationSec, displayLoopBars]);

  const loopSliceCount = useMemo(
    () => Math.max(1, Math.round(displayLoopBars * BASE_STEPS_PER_BAR)),
    [displayLoopBars]
  );

  const getLoopParams = (bars: LoopBars, startIndex: number, nextStepsPerBar = stepsPerBar) => {
    const startSec = downbeat0Sec + startIndex * barDuration;
    const endSec = Math.min(durationSec, startSec + bars * barDuration);
    const loopDuration = Math.max(0.001, endSec - startSec);
    const totalSteps = Math.max(1, Math.round(bars * nextStepsPerBar));
    const baseTotalSteps = Math.max(1, Math.round(bars * BASE_STEPS_PER_BAR));
    const baseStepDuration = loopDuration / baseTotalSteps;
    return {
      startSec,
      endSec,
      loopDuration,
      totalSteps,
      baseTotalSteps,
      baseStepDuration,
      stepsPerBar: nextStepsPerBar
    };
  };

  const getMaxStartIndex = (bars: LoopBars) => {
    if (!bpm) return 0;
    const barCount = Math.max(1, Math.floor((durationSec - downbeat0Sec) / barDuration));
    return Math.max(0, Math.floor(barCount - bars));
  };

  const maxStartBarIndex = useMemo(() => {
    if (!bpm) return 0;
    const barCount = Math.max(1, Math.floor((durationSec - downbeat0Sec) / barDuration));
    return Math.max(0, Math.floor(barCount - displayLoopBars));
  }, [bpm, durationSec, downbeat0Sec, barDuration, displayLoopBars]);

  useEffect(() => {
    if (queuedLoop) return;
    if (activeStartBarIndex > maxStartBarIndex) {
      setActiveStartBarIndex(maxStartBarIndex);
    }
  }, [activeStartBarIndex, maxStartBarIndex, queuedLoop]);

  useEffect(() => {
    if (!selectedLoop || !fullBuffer) {
      setSlicePeaks(null);
      return;
    }
    const totalSteps = Math.max(1, Math.round(selectedLoop.bars * BASE_STEPS_PER_BAR));
    setSlicePeaks(buildSlicePeaksFromBuffer(fullBuffer, selectedLoop, totalSteps));
  }, [selectedLoop, fullBuffer]);

  const activePack = useMemo<PatternPack>(
    () => PATTERN_PACKS.find((pack) => pack.id === patternPackId) ?? PATTERN_PACKS[0],
    [patternPackId]
  );
  const mainPatterns = useMemo(() => activePack.mains.slice(0, 8), [activePack]);
  const fillPatterns = useMemo(() => activePack.fills.slice(0, 8), [activePack]);
  const patternsById = useMemo(
    () => new Map([...activePack.mains, ...activePack.fills].map((p) => [p.id, p])),
    [activePack]
  );

  const getPatternStepsById = (patternId: string | null) => {
    if (!patternId) return null;
    const pattern = patternsById.get(patternId);
    if (!pattern) return null;
    return customPatternStepsRef.current[patternId] ?? pattern.steps;
  };

  const displayPatternId = useMemo(() => {
    if (activeFillId && patternsById.has(activeFillId)) return activeFillId;
    if (activeMainId && patternsById.has(activeMainId)) return activeMainId;
    if (queuedMainId) return queuedMainId;
    return mainPatterns[0]?.id ?? null;
  }, [activeFillId, activeMainId, queuedMainId, mainPatterns, patternsById]);

  const displayPattern = displayPatternId ? patternsById.get(displayPatternId) ?? null : null;

  const isFillPattern = useMemo(() => {
    if (!displayPattern) return false;
    return fillPatterns.some((pattern) => pattern.id === displayPattern.id);
  }, [displayPattern, fillPatterns]);

  const displayPatternSteps = useMemo(() => {
    if (!displayPattern) return null;
    const baseSteps = customPatternSteps[displayPattern.id] ?? displayPattern.steps;
    return isFillPattern ? resolveFillOffsets(baseSteps, 16) : baseSteps;
  }, [displayPattern, customPatternSteps, isFillPattern]);

  const patternStepsTotal = useMemo(() => {
    if (!displayPattern) return loopSliceCount;
    return isFillPattern ? stepsPerBar : Math.max(1, Math.round(displayLoopBars * stepsPerBar));
  }, [displayPattern, loopSliceCount, isFillPattern, stepsPerBar, displayLoopBars]);

  const patternOrder = useMemo(() => {
    if (!displayPatternSteps) return null;
    const baseTotalSteps = isFillPattern
      ? BASE_STEPS_PER_BAR
      : Math.max(1, Math.round(displayLoopBars * BASE_STEPS_PER_BAR));
    const expandedBase = expandOrderToIndices(displayPatternSteps, baseTotalSteps);
    const mapped: number[] = [];
    for (let step = 0; step < patternStepsTotal; step += 1) {
      const baseStepIndex = Math.floor((step / patternStepsTotal) * baseTotalSteps);
      mapped.push(expandedBase[baseStepIndex % expandedBase.length] ?? 0);
    }
    return mapped;
  }, [displayPatternSteps, patternStepsTotal, isFillPattern, displayLoopBars]);

  const patternPeaks = useMemo(() => {
    if (!slicePeaks || !patternOrder) return null;
    return reorderSlicePeaks(slicePeaks, patternOrder, POINTS_PER_SLICE);
  }, [slicePeaks, patternOrder]);

  const patternAccent = useMemo(() => {
    if (!displayPattern) return null;
    const makeColor = (h: number, s: number, l: number, a: number) =>
      `hsl(${h} ${s}% ${l}% / ${a})`;
    if (isFillPattern) {
      const index = fillPatterns.findIndex((pattern) => pattern.id === displayPattern.id);
      const hue = 200 + (index < 0 ? 0 : index * 8);
      return {
        fill: makeColor(hue, 70, 90, 0.28),
        strong: makeColor(hue, 70, 82, 0.55)
      };
    }
    const index = mainPatterns.findIndex((pattern) => pattern.id === displayPattern.id);
    const hue = 30 + (index < 0 ? 0 : index * 12);
    return {
      fill: makeColor(hue, 70, 88, 0.28),
      strong: makeColor(hue, 70, 78, 0.55)
    };
  }, [displayPattern, mainPatterns, fillPatterns, isFillPattern]);

  const displayStep = useMemo(() => {
    if (currentStep === null) return null;
    return currentStep % patternStepsTotal;
  }, [currentStep, patternStepsTotal]);

  const updatePatternStep = (stepIndex: number, delta: number) => {
    if (!displayPattern) return;
    const baseStepsLength = isFillPattern
      ? BASE_STEPS_PER_BAR
      : Math.max(1, Math.round(displayLoopBars * BASE_STEPS_PER_BAR));
    const mappedBaseIndex = Math.floor((stepIndex / patternStepsTotal) * baseStepsLength);
    const stepPos = ((mappedBaseIndex % baseStepsLength) + baseStepsLength) % baseStepsLength;
    const baseSteps = customPatternSteps[displayPattern.id] ?? displayPattern.steps;
    const nextSteps = [...baseSteps];
    const currentEvent = nextSteps[stepPos];
    const resolved = resolveStepEvent(currentEvent);
    const maxIndex = Math.max(1, isFillPattern ? BASE_STEPS_PER_BAR : loopSliceCount);
    const currentIndex = resolved.index >= 0 ? resolved.index : 0;
    const nextIndex = (currentIndex + delta + maxIndex) % maxIndex;
    if (typeof currentEvent === "number" || currentEvent == null) {
      nextSteps[stepPos] = nextIndex;
    } else {
      nextSteps[stepPos] = { ...currentEvent, i: nextIndex };
    }
    setCustomPatternSteps((prev) => ({ ...prev, [displayPattern.id]: nextSteps }));
  };

  const applyLoopBars = (bars: LoopBars) => {
    const nextMax = getMaxStartIndex(bars);
    const nextStart = Math.min(nextMax, displayStartBarIndex);
    if (isPlayingRef.current) {
      const queued = { startBarIndex: nextStart, bars };
      setQueuedLoop(queued);
      if (transportRef.current) {
        transportRef.current.queuedLoop = queued;
      }
    } else {
      setActiveLoopBars(bars);
      setActiveStartBarIndex(nextStart);
    }
    setHasSliced(false);
  };

  const applyStepsPerBar = (nextSteps: number) => {
    const safeSteps = clamp(nextSteps, 4, 64);
    if (isPlayingRef.current) {
      setStepsPerBar(safeSteps);
      setQueuedStepsPerBar(safeSteps);
      if (transportRef.current) {
        transportRef.current.queuedStepsPerBar = safeSteps;
      }
    } else {
      setStepsPerBar(safeSteps);
    }
  };

  useEffect(() => {
    if (!selectedLoop) return;
    const defaultMain = mainPatterns[0]?.id ?? null;
    setActiveMainId((prev) => prev ?? defaultMain);
    setQueuedMainId(null);
    setQueuedFillId(null);
    setHasSliced(false);
    stopPatternPlayback();
  }, [selectedLoop?.startSec, selectedLoop?.bars, mainPatterns]);

  useEffect(() => {
    if (transportRef.current) {
      transportRef.current.queuedLoop = queuedLoop;
    }
  }, [queuedLoop]);

  useEffect(() => {
    if (transportRef.current) {
      transportRef.current.queuedStepsPerBar = queuedStepsPerBar;
    }
  }, [queuedStepsPerBar]);

  useEffect(() => {
    if (transportRef.current) {
      transportRef.current.queuedPlaybackBpm = queuedPlaybackBpm;
    }
  }, [queuedPlaybackBpm]);

  useEffect(() => {
    const nextMain = mainPatterns[0]?.id ?? null;
    if (isPlayingRef.current && transportRef.current && nextMain) {
      transportRef.current.queuedMainId = nextMain;
      setQueuedMainId(nextMain);
    } else {
      setActiveMainId(nextMain);
      setQueuedMainId(null);
      setQueuedFillId(null);
      setActiveFillId(null);
      stopTransport();
    }
  }, [patternPackId]);

  useEffect(() => {
    setActiveStepIndex(null);
  }, [displayPatternId]);

  const handleAccept = () => {
    window.localStorage.setItem(DISCLAIMER_KEY, "true");
    setAccepted(true);
  };

  const handleThemeChange = (next: "default" | "vst") => {
    setTheme(next);
    window.localStorage.setItem("amengrid_theme", next);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setResponse(null);
    setStatus(null);
    setProgress(0);
    setUploadResult(null);
    setAnalysisResult(null);
    setAnalysisStatus(null);
    setActiveLoopBars(2);
    setActiveStartBarIndex(0);
    setQueuedLoop(null);
    setStepsPerBar(16);
    setQueuedStepsPerBar(null);
    setActiveMainId(null);
    setQueuedMainId(null);
    setQueuedFillId(null);
    setHasSliced(false);
    setIsPlaying(false);
    setPlaybackBpm(130);
    setQueuedPlaybackBpm(null);
    setFullBuffer(null);
    setFullPeaks(null);
    setSlicePeaks(null);
    stopPatternPlayback();
    stopLoopPlayback();
    const next = event.target.files?.[0];
    setFile(next ?? null);
  };

  const uploadFile = () => {
    if (!file) return;
    setIsUploading(true);
    setStatus("Uploading...");
    setResponse(null);
    setAnalysisStatus(null);

    const formData = new FormData();
    formData.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      setProgress(percent);
    };

    request.onload = () => {
      setIsUploading(false);
      setProgress(100);
      const ok = request.status >= 200 && request.status < 300;
      if (ok) {
        setStatus("Upload complete.");
      } else {
        setStatus(`Upload failed (${request.status}).`);
      }

      try {
        const json = JSON.parse(request.responseText || "{}");
        setResponse(JSON.stringify(json, null, 2));
        if (ok && json?.id) {
          setUploadResult(json);
          runAnalysis(json.id);
        }
      } catch {
        setResponse(request.responseText || "(no response body)");
      }
    };

    request.onerror = () => {
      setIsUploading(false);
      setStatus("Upload failed (network error).");
    };

    request.send(formData);
  };

  const ingestYouTube = async () => {
    const url = youtubeUrl.trim();
    if (!url) return;
    setIsUploading(true);
    setStatus("Downloading from YouTube...");
    setResponse(null);
    setAnalysisStatus(null);
    setProgress(0);

    if (youtubeProgressRef.current) {
      window.clearInterval(youtubeProgressRef.current);
    }
    youtubeProgressRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        return Math.min(95, prev + 3);
      });
    }, 1000);

    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const json = (await res.json().catch(() => ({}))) as UploadResponse & { error?: string; hint?: string };
      if (!res.ok) {
        const message = json.error || res.statusText;
        const hint = json.hint ? ` (${json.hint})` : "";
        throw new Error(`${message}${hint}`);
      }
      setStatus("YouTube ingest complete.");
      setResponse(JSON.stringify(json, null, 2));
      if (json?.id) {
        setUploadResult(json);
        runAnalysis(json.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`YouTube ingest failed: ${message}`);
    } finally {
      setIsUploading(false);
      if (youtubeProgressRef.current) {
        window.clearInterval(youtubeProgressRef.current);
        youtubeProgressRef.current = null;
      }
      setProgress(100);
    }
  };

  const runAnalysis = async (id: string) => {
    setIsAnalyzing(true);
    setAnalysisStatus("Analyzing audio...");
    setAnalysisResult(null);
    setActiveLoopBars(2);
    setActiveStartBarIndex(0);
    setQueuedLoop(null);
    setQueuedPlaybackBpm(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const json = (await res.json().catch(() => ({}))) as AnalysisResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || res.statusText);
      }
      setAnalysisResult(json);
      setAnalysisStatus("Analysis complete.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setAnalysisStatus(`Upload complete, analysis failed: ${message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const ensureAudioContext = () => {
    if (!audioRef.current.ctx) {
      audioRef.current.ctx = new AudioContext();
    }
    return audioRef.current.ctx;
  };

  useEffect(() => {
    const loadFullBuffer = async () => {
      if (!uploadResult?.converted?.path) return;
      setFullPeaks(null);
      setFullBuffer(null);
      try {
        const ctx = ensureAudioContext();
        const path = uploadResult.converted.path.startsWith("/")
          ? uploadResult.converted.path
          : `/${uploadResult.converted.path}`;
        const res = await fetch(path);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        setFullBuffer(buffer);
        setFullPeaks(computePeaksFromBuffer(buffer));
      } catch {
        setFullBuffer(null);
        setFullPeaks(null);
      }
    };

    loadFullBuffer();
  }, [uploadResult]);

  const stopPatternPlayback = () => {
    if (audioRef.current.timer) {
      window.clearTimeout(audioRef.current.timer);
      audioRef.current.timer = null;
    }
    if (schedulerRef.current) {
      window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    if (scheduledSourcesRef.current.length > 0) {
      for (const source of scheduledSourcesRef.current) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // ignore
        }
      }
      scheduledSourcesRef.current = [];
    }
    isPlayingRef.current = false;
    transportRef.current = null;
    setIsPlaying(false);
    setCurrentStep(null);
    setCurrentSliceIndex(null);
    setPatternProgress(0);
    setActiveFillId(null);
    setQueuedPlaybackBpm(null);
    repeatHoldIndexRef.current = null;
    reverseHoldRef.current = { active: false, startIndex: 0, offset: 0 };
  };

  const schedulePattern = (patternId: string) => {
    if (!fullBuffer || !selectedLoop) return;
    const pattern = patternsById.get(patternId);
    if (!pattern) return;
    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const activeParams = getLoopParams(activeLoopBars, activeStartBarIndex, stepsPerBar);
    const totalSteps = activeParams.totalSteps;
    const loopDuration = activeParams.loopDuration;
    const baseStepDuration = activeParams.baseStepDuration;
    const baseTotalSteps = activeParams.baseTotalSteps;
    const playbackStepDuration = (60 / playbackBpm) * (4 / stepsPerBar);
    const startTime = ctx.currentTime + 0.001;

    transportRef.current = {
      startTime,
      loopStartSec: activeParams.startSec,
      loopDurationSec: loopDuration,
      baseStepDuration,
      playbackStepDuration,
      stepsPerBar,
      totalSteps,
      baseTotalSteps,
      phraseBars,
      activeMainId: patternId,
      activeMainSteps: getPatternStepsById(patternId),
      mainBeforeFillId: null,
      queuedMainId: null,
      queuedStepsPerBar,
      queuedLoop,
      playbackBpm,
      queuedPlaybackBpm,
      queuedFillId: null,
      activeFillId: null,
      activeFillSteps: null,
      fillUntilStep: null,
      fillStartStep: null,
      fillStepsRemaining: null,
      fillStepIndex: null,
      nextStep: 0
    };

    const scheduleAheadSec = 0.2;
    const lookaheadMs = 25;

    if (schedulerRef.current) {
      window.clearInterval(schedulerRef.current);
    }

    const tick = () => {
      const transport = transportRef.current;
      if (!transport || !isPlayingRef.current) return;
      const now = ctx.currentTime;
      let loopBoundaryTime: number | null = null;
      if (transport.queuedLoop) {
        const currentStep = Math.floor((now - transport.startTime) / transport.playbackStepDuration);
        const nextBoundaryStep = Math.ceil((currentStep + 1) / transport.stepsPerBar) * transport.stepsPerBar;
        loopBoundaryTime = transport.startTime + nextBoundaryStep * transport.playbackStepDuration;
      }
      let mainBoundaryTime: number | null = null;
      if (transport.queuedMainId) {
        const currentStep = Math.floor((now - transport.startTime) / transport.playbackStepDuration);
        const stepsPerSwitch = transport.stepsPerBar * 2;
        const nextBoundaryStep = Math.ceil((currentStep + 1) / stepsPerSwitch) * stepsPerSwitch;
        mainBoundaryTime = transport.startTime + nextBoundaryStep * transport.playbackStepDuration;
      }
      let stepsBoundaryTime: number | null = null;
      if (transport.queuedStepsPerBar) {
        const currentStep = Math.floor((now - transport.startTime) / transport.playbackStepDuration);
        const nextBoundaryStep = Math.ceil((currentStep + 1) / transport.stepsPerBar) * transport.stepsPerBar;
        stepsBoundaryTime = transport.startTime + nextBoundaryStep * transport.playbackStepDuration;
      }
      let fillBoundaryTime: number | null = null;
      if (transport.queuedFillId) {
        const currentStep = Math.floor((now - transport.startTime) / transport.playbackStepDuration);
        const stepsPerSwitch = transport.stepsPerBar * 2;
        const nextBoundaryStep = Math.ceil((currentStep + 1) / stepsPerSwitch) * stepsPerSwitch;
        fillBoundaryTime = transport.startTime + nextBoundaryStep * transport.playbackStepDuration;
      }
      let tempoBoundaryTime: number | null = null;
      let tempoBoundaryStep: number | null = null;
      if (transport.queuedPlaybackBpm) {
        const currentStep = Math.floor((now - transport.startTime) / transport.playbackStepDuration);
        tempoBoundaryStep = currentStep + 1;
        tempoBoundaryTime = transport.startTime + tempoBoundaryStep * transport.playbackStepDuration;
      }
      while (transport.startTime + transport.nextStep * transport.playbackStepDuration < now + scheduleAheadSec) {
        const stepIndex = transport.nextStep;
        let when = transport.startTime + stepIndex * transport.playbackStepDuration;
        transport.nextStep += 1;

        if (transport.queuedLoop && loopBoundaryTime !== null && when >= loopBoundaryTime) {
          const nextLoop = transport.queuedLoop;
          const nextParams = getLoopParams(nextLoop.bars, nextLoop.startBarIndex, transport.stepsPerBar);
          transport.loopStartSec = nextParams.startSec;
          transport.loopDurationSec = nextParams.loopDuration;
          transport.baseStepDuration = nextParams.baseStepDuration;
          transport.totalSteps = nextParams.totalSteps;
          transport.baseTotalSteps = nextParams.baseTotalSteps;
          transport.stepsPerBar = nextParams.stepsPerBar;
          transport.startTime = loopBoundaryTime;
          transport.nextStep = 0;
          transport.queuedLoop = null;
          setActiveLoopBars(nextLoop.bars);
          setActiveStartBarIndex(nextLoop.startBarIndex);
          setQueuedLoop(null);
          loopBoundaryTime = null;
          continue;
        }

        if (!transport.activeFillId && transport.queuedMainId && mainBoundaryTime !== null && when >= mainBoundaryTime) {
          transport.activeMainId = transport.queuedMainId;
          transport.activeMainSteps = getPatternStepsById(transport.queuedMainId);
          setActiveMainId(transport.activeMainId);
          transport.queuedMainId = null;
          setQueuedMainId(null);
          mainBoundaryTime = null;
        }

        if (transport.queuedStepsPerBar && stepsBoundaryTime !== null && when >= stepsBoundaryTime) {
          const nextSteps = transport.queuedStepsPerBar;
          const nextParams = getLoopParams(activeLoopBars, activeStartBarIndex, nextSteps);
          transport.stepsPerBar = nextParams.stepsPerBar;
          transport.totalSteps = nextParams.totalSteps;
          transport.baseTotalSteps = nextParams.baseTotalSteps;
          transport.baseStepDuration = nextParams.baseStepDuration;
          transport.playbackStepDuration = (60 / transport.playbackBpm) * (4 / transport.stepsPerBar);
          transport.startTime = stepsBoundaryTime;
          transport.nextStep = 0;
          transport.queuedStepsPerBar = null;
          setStepsPerBar(nextSteps);
          setQueuedStepsPerBar(null);
          stepsBoundaryTime = null;
          continue;
        }

        if (
          transport.queuedPlaybackBpm &&
          tempoBoundaryTime !== null &&
          tempoBoundaryStep !== null &&
          when >= tempoBoundaryTime
        ) {
          const nextTempo = transport.queuedPlaybackBpm;
          const nextStepDuration = (60 / nextTempo) * (4 / transport.stepsPerBar);
          transport.playbackBpm = nextTempo;
          transport.playbackStepDuration = nextStepDuration;
          transport.startTime = tempoBoundaryTime - tempoBoundaryStep * nextStepDuration;
          transport.queuedPlaybackBpm = null;
          setPlaybackBpm(nextTempo);
          setQueuedPlaybackBpm(null);
          tempoBoundaryTime = null;
          tempoBoundaryStep = null;
          when = transport.startTime + stepIndex * transport.playbackStepDuration;
        }

        if (transport.queuedFillId && !transport.activeFillId && fillBoundaryTime !== null && when >= fillBoundaryTime) {
          transport.activeFillId = transport.queuedFillId;
          transport.queuedFillId = null;
          transport.mainBeforeFillId = transport.activeMainId;
          transport.fillStepsRemaining = transport.stepsPerBar;
          transport.fillStepIndex = 0;
          transport.fillStartStep = stepIndex;
          transport.fillUntilStep = stepIndex + transport.stepsPerBar;
          transport.activeFillSteps = getPatternStepsById(transport.activeFillId);
          setQueuedFillId(null);
          setActiveFillId(transport.activeFillId);
          fillBoundaryTime = null;
        }

        const activePatternId = transport.activeFillId ?? transport.activeMainId;
        const activeSteps =
          (transport.activeFillId ? transport.activeFillSteps : transport.activeMainSteps) ??
          getPatternStepsById(activePatternId);
        if (!activePatternId || !activeSteps) {
          continue;
        }

        let sliceIndex = 0;
        let retrigCount = 1;
        let gainScale = 1;
        if (transport.activeFillId && transport.fillStepsRemaining !== null && transport.fillStepIndex !== null) {
          const barsInLoop = Math.max(1, Math.round(transport.baseTotalSteps / BASE_STEPS_PER_BAR));
          const barOffset = Math.min(1, barsInLoop - 1) * BASE_STEPS_PER_BAR;
          const fillSteps = resolveFillOffsets(activeSteps, 16);
          const baseIndex = Math.floor(
            (transport.fillStepIndex / transport.stepsPerBar) * BASE_STEPS_PER_BAR
          );
          const stepEvent = fillSteps[baseIndex % fillSteps.length];
          const resolved = resolveStepEvent(stepEvent);
          sliceIndex = resolved.index + barOffset;
          retrigCount = resolved.retrig;
          gainScale = resolved.gain ?? 1;
          transport.fillStepIndex += 1;
          transport.fillStepsRemaining -= 1;
          if (transport.fillStepsRemaining <= 0) {
            transport.activeFillId = null;
            transport.activeFillSteps = null;
            transport.fillStepsRemaining = null;
            transport.fillStepIndex = null;
            transport.fillStartStep = null;
            transport.fillUntilStep = null;
            setActiveFillId(null);
            if (transport.mainBeforeFillId) {
              transport.activeMainId = transport.mainBeforeFillId;
              setActiveMainId(transport.mainBeforeFillId);
              transport.mainBeforeFillId = null;
            }
          }
        } else {
          const order = expandOrder(activeSteps, transport.baseTotalSteps);
          const baseStepIndex = Math.floor(
            ((stepIndex % transport.totalSteps) / transport.totalSteps) * transport.baseTotalSteps
          );
          const stepEvent = order[baseStepIndex % transport.baseTotalSteps];
          const resolved = resolveStepEvent(stepEvent);
          sliceIndex = resolved.index;
          retrigCount = resolved.retrig;
          gainScale = resolved.gain ?? 1;
        }
        if (sliceIndex < 0) {
          continue;
        }
        if (repeatHoldIndexRef.current !== null) {
          sliceIndex = repeatHoldIndexRef.current;
        } else if (reverseHoldRef.current.active) {
          const baseSteps = transport.baseTotalSteps;
          const rawIndex = reverseHoldRef.current.startIndex - reverseHoldRef.current.offset;
          sliceIndex = ((rawIndex % baseSteps) + baseSteps) % baseSteps;
          reverseHoldRef.current.offset += 1;
        }
        const offset = transport.loopStartSec + (sliceIndex % transport.baseTotalSteps) * transport.baseStepDuration;
        const dur = transport.playbackStepDuration;
        const subCount = Math.max(1, retrigCount);
        const subDur = dur / subCount;

        for (let sub = 0; sub < subCount; sub += 1) {
          const subStart = when + sub * subDur;
          const subEnd = subStart + subDur;
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = fullBuffer;
          source.connect(gain);
          gain.connect(ctx.destination);

          if (gaplessEnabled) {
            const fadeOut = Math.min(0.008, subDur * 0.25);
            gain.gain.setValueAtTime(gainScale, subStart);
            if (fadeOut > 0) {
              gain.gain.setValueAtTime(gainScale, subEnd - fadeOut);
              gain.gain.linearRampToValueAtTime(0, subEnd);
            }
          } else {
            gain.gain.setValueAtTime(gainScale, subStart);
          }

          source.start(subStart, offset, subDur);
          source.stop(subEnd + 0.01);
          scheduledSourcesRef.current.push(source);
        }
      }
    };

    tick();
    schedulerRef.current = window.setInterval(tick, lookaheadMs);
  };

  const startMain = (patternId: string) => {
    if (!selectedLoop || !fullBuffer) return;
    stopLoopPlayback();
    stopPatternPlayback();
    setActiveMainId(patternId);
    setQueuedMainId(null);
    setQueuedFillId(null);
    setQueuedPlaybackBpm(null);
    isPlayingRef.current = true;
    setIsPlaying(true);
    schedulePattern(patternId);
  };

  const queueMain = (patternId: string) => {
    setQueuedMainId(patternId);
    if (transportRef.current) {
      transportRef.current.queuedMainId = patternId;
    }
  };

  const queueFill = (patternId: string) => {
    setQueuedFillId(patternId);
    if (transportRef.current) {
      transportRef.current.queuedFillId = patternId;
    }
  };

  const startFill = (patternId: string) => {
    const fallback = activeMainId ?? mainPatterns[0]?.id ?? null;
    if (!fallback) return;
    if (!isPlayingRef.current) {
      startMain(fallback);
      const transport = transportRef.current;
      if (transport) {
        transport.mainBeforeFillId = transport.activeMainId ?? fallback;
        transport.activeFillId = patternId;
        transport.activeFillSteps = getPatternStepsById(patternId);
        transport.fillStepsRemaining = transport.stepsPerBar;
        transport.fillStepIndex = 0;
        transport.fillStartStep = transport.nextStep;
        transport.fillUntilStep = transport.nextStep + transport.stepsPerBar;
        setActiveFillId(patternId);
        setQueuedFillId(null);
      }
      return;
    }
    queueFill(patternId);
  };

  const clampTempo = (value: number) => clamp(Math.round(value), 60, 220);
  const requestTempoChange = (delta: number) => {
    const nextTempo = clampTempo(playbackBpm + delta);
    if (isPlayingRef.current) {
      setQueuedPlaybackBpm(nextTempo);
      if (transportRef.current) {
        transportRef.current.queuedPlaybackBpm = nextTempo;
      }
    } else {
      setPlaybackBpm(nextTempo);
    }
  };

  const stopTransport = () => {
    stopPatternPlayback();
    setQueuedMainId(null);
    setQueuedFillId(null);
    setQueuedPlaybackBpm(null);
    setQueuedStepsPerBar(null);
  };

  const stopAllPlayback = () => {
    stopLoopPlayback();
    stopTransport();
  };

  const toggleLoopPlayback = () => {
    if (!fullBuffer || !selectedLoop) return;
    const ctx = ensureAudioContext();

    if (loopPlayback) {
      stopLoopPlayback();
      return;
    }

    stopLoopPlayback();
    stopPatternPlayback();
    const source = ctx.createBufferSource();
    source.buffer = fullBuffer;
    source.loop = true;
    source.loopStart = selectedLoop.startSec;
    source.loopEnd = selectedLoop.endSec;
    source.connect(ctx.destination);
    const startAt = ctx.currentTime + 0.03;
    source.start(startAt, selectedLoop.startSec);
    loopSourceRef.current = source;
    setLoopPlayback({ startSec: selectedLoop.startSec, endSec: selectedLoop.endSec, startedAt: startAt });
  };

  const stopLoopPlayback = () => {
    if (loopSourceRef.current) {
      loopSourceRef.current.stop();
      loopSourceRef.current.disconnect();
      loopSourceRef.current = null;
    }
    setLoopPlayback(null);
  };

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (loopPlayback && audioRef.current.ctx) {
        const duration = loopPlayback.endSec - loopPlayback.startSec;
        if (duration > 0) {
          const elapsed = (audioRef.current.ctx.currentTime - loopPlayback.startedAt) % duration;
        }
      }

      if (isPlayingRef.current && transportRef.current && audioRef.current.ctx) {
        const transport = transportRef.current;
        const elapsed = audioRef.current.ctx.currentTime - transport.startTime;
        if (elapsed >= 0) {
          const step = Math.floor(elapsed / transport.playbackStepDuration) % transport.totalSteps;
          setCurrentStep(step);
          const playbackLoopDuration = transport.totalSteps * transport.playbackStepDuration;
          setPatternProgress(clamp((elapsed % playbackLoopDuration) / playbackLoopDuration, 0, 1));

          const activePatternId = transport.activeFillId ?? transport.activeMainId;
          const activeSteps =
            (transport.activeFillId ? transport.activeFillSteps : transport.activeMainSteps) ??
            getPatternStepsById(activePatternId);
          if (activePatternId && activeSteps) {
            if (transport.activeFillId && transport.fillStartStep !== null) {
              const fillStepIndex = (step - transport.fillStartStep + transport.stepsPerBar) % transport.stepsPerBar;
              const barsInLoop = Math.max(1, Math.round(transport.baseTotalSteps / BASE_STEPS_PER_BAR));
              const barOffset = Math.min(1, barsInLoop - 1) * BASE_STEPS_PER_BAR;
              const fillSteps = resolveFillOffsets(activeSteps, 16);
              const baseIndex = Math.floor((fillStepIndex / transport.stepsPerBar) * BASE_STEPS_PER_BAR);
              const stepEvent = fillSteps[baseIndex % fillSteps.length];
              const nextIndex = toSliceIndex(stepEvent, barOffset);
              setCurrentSliceIndex(nextIndex >= 0 ? nextIndex : null);
            } else {
              const order = expandOrder(activeSteps, transport.baseTotalSteps);
              const baseStepIndex = Math.floor(
                ((step % transport.totalSteps) / transport.totalSteps) * transport.baseTotalSteps
              );
              const stepEvent = order[baseStepIndex % transport.baseTotalSteps];
              const nextIndex = toSliceIndex(stepEvent);
              setCurrentSliceIndex(nextIndex >= 0 ? nextIndex : null);
            }
          } else {
            setCurrentSliceIndex(null);
          }
        }
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [loopPlayback]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        if (isPlayingRef.current) {
          stopTransport();
        } else if (activeMainId) {
          startMain(activeMainId);
        }
        return;
      }

      if (event.key.toLowerCase() === "r") {
        if (event.repeat) return;
        if (currentSliceIndex !== null) {
          repeatHoldIndexRef.current = currentSliceIndex;
        }
        return;
      }

      if (event.key.toLowerCase() === "e") {
        if (event.repeat) return;
        if (currentSliceIndex !== null) {
          reverseHoldRef.current = { active: true, startIndex: currentSliceIndex, offset: 0 };
        }
        return;
      }

      const num = Number(event.key);
      if (Number.isNaN(num) || num < 1 || num > 8) return;
      if (event.shiftKey) {
        const fill = fillPatterns[num - 1];
        if (!fill) return;
        startFill(fill.id);
        return;
      }
      const main = mainPatterns[num - 1];
      if (!main) return;
      if (isPlayingRef.current) {
        queueMain(main.id);
      } else {
        startMain(main.id);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        repeatHoldIndexRef.current = null;
      }
      if (event.key.toLowerCase() === "e") {
        reverseHoldRef.current = { active: false, startIndex: 0, offset: 0 };
      }
    };

    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [activeMainId, mainPatterns, fillPatterns, currentSliceIndex]);

  const handleSlice = async () => {
    if (!uploadResult || !selectedLoop || !bpm) return;
    stopAllPlayback();
    setIsSlicing(true);
    setSliceStatus("Slicing loop...");
    setHasSliced(false);

    try {
      const res = await fetch("/api/slice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: uploadResult.id,
          startSec: selectedLoop.startSec,
          bars: selectedLoop.bars,
          bpm,
          beatsPerBar: 4,
          stepsPerBar
        })
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || res.statusText);
      }
      setSliceStatus("Slices ready.");
      setHasSliced(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setSliceStatus(`Slicing failed: ${message}`);
    } finally {
      setIsSlicing(false);
    }
  };

  return (
    <main className="page" data-theme={theme}>
      {!accepted && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Before you upload</h2>
            <p>
              You may only upload audio or video content that you own or have the
              legal right to use. By using AmenGrid, you confirm all uploaded
              media complies with applicable copyright laws.
            </p>
            <button className="primary" onClick={handleAccept}>
              I Understand &amp; Accept
            </button>
          </div>
        </div>
      )}

      <section className="card">
        <header>
          <img className="logo" src="/amengrid_logo_black.png" alt="AmenGrid" />
          <p>Phase 4 — Jungle Pattern Packs</p>
          <div className="theme-toggle">
            <span>Style</span>
            <div className="theme-buttons">
              <button
                className={`theme-button ${theme === "default" ? "active" : ""}`}
                onClick={() => handleThemeChange("default")}
                type="button"
              >
                Default
              </button>
              <button
                className={`theme-button ${theme === "vst" ? "active" : ""}`}
                onClick={() => handleThemeChange("vst")}
                type="button"
              >
                VST
              </button>
            </div>
          </div>
        </header>

        <div className="ingest-toggle">
          <button
            type="button"
            className={`segment ${ingestMode === "upload" ? "active" : ""}`}
            onClick={() => setIngestMode("upload")}
          >
            Upload file
          </button>
          <button
            type="button"
            className={`segment ${ingestMode === "youtube" ? "active" : ""}`}
            onClick={() => setIngestMode("youtube")}
          >
            YouTube URL
          </button>
        </div>

        {ingestMode === "upload" ? (
          <div className="field">
            <label htmlFor="file">Audio or video file</label>
            <input
              id="file"
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileChange}
              disabled={!accepted}
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="youtube-url">YouTube URL</label>
              <input
                id="youtube-url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                disabled={!accepted || isUploading}
              />
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={youtubeConsent}
                onChange={(event) => setYoutubeConsent(event.target.checked)}
                disabled={!accepted || isUploading}
              />
              I confirm I have the rights to process this YouTube content.
            </label>
          </>
        )}

        <div className="button-row">
          <button
            className="primary"
            onClick={ingestMode === "upload" ? uploadFile : ingestYouTube}
            disabled={!canIngest}
          >
            {isUploading ? "Working..." : ingestMode === "upload" ? "Upload" : "Fetch & Convert"}
          </button>
        </div>

        {isUploading && (
          <div className="progress">
            <div className="bar" style={{ width: formattedProgress ?? "0%" }} />
            <span>{formattedProgress}</span>
          </div>
        )}

        {status && <p className="status">{status}</p>}
        {analysisStatus && (
          <div className="status-row">
            <p className="status">{analysisStatus}</p>
            {!isAnalyzing &&
              uploadResult &&
              analysisStatus.startsWith("Upload complete, analysis failed") && (
                <button className="text-button" onClick={() => runAnalysis(uploadResult.id)}>
                  Retry analyze
                </button>
              )}
          </div>
        )}

        {analysisResult && (
          <LoopPicker
            peaks={fullPeaks}
            durationSec={durationSec}
            bpm={bpm}
            downbeat0Sec={downbeat0Sec}
            loopBars={displayLoopBars}
            startBarIndex={displayStartBarIndex}
            onStartBarChange={(index) => {
              if (isPlayingRef.current) {
                setQueuedLoop({ startBarIndex: clamp(index, 0, maxStartBarIndex), bars: activeLoopBars });
              } else {
                setActiveStartBarIndex(clamp(index, 0, maxStartBarIndex));
              }
              setHasSliced(false);
            }}
            onLoopBarsChange={(bars) => {
              applyLoopBars(bars as LoopBars);
            }}
            onPlayToggle={toggleLoopPlayback}
            isPlaying={!!loopPlayback}
          />
        )}

        {analysisResult && selectedLoop && (
          <div className="loop-picker-actions">
            <button className="primary" onClick={handleSlice} disabled={isSlicing || !bpm}>
              {isSlicing ? "Slicing..." : "Slice This Loop"}
            </button>
            {sliceStatus && <p className="status">{sliceStatus}</p>}
          </div>
        )}

        {(hasSliced || sliceStatus === "Slices ready.") && selectedLoop && (
      <section className="analysis">
            <div className="transport">
              <div>
                <h2>Pattern Pack</h2>
                <p>Phrase: {phraseBars} bars</p>
              </div>
              <button
                className="control-button play stop"
                onClick={stopTransport}
                disabled={!isPlaying}
                aria-label="Stop"
                title="Stop"
                type="button"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                </svg>
              </button>
            </div>
            <div className="pattern-group">
              <label htmlFor="pattern-group">Pattern Group</label>
              <select
                id="pattern-group"
                value={patternPackId}
                onChange={(event) => setPatternPackId(event.target.value)}
              >
                {PATTERN_PACKS.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pattern-controls">
              <div>
                <label htmlFor="pattern-length">Pattern length</label>
                <select
                  id="pattern-length"
                  value={displayLoopBars}
                  onChange={(event) => applyLoopBars(Number(event.target.value) as LoopBars)}
                >
                  {[1, 2, 4, 8, 16].map((bars) => (
                    <option key={bars} value={bars}>
                      {bars} bars
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="slice-resolution">Slice resolution</label>
                <select
                  id="slice-resolution"
                  value={stepsPerBar}
                  onChange={(event) => applyStepsPerBar(Number(event.target.value))}
                >
                  {[8, 16, 32].map((steps) => (
                    <option key={steps} value={steps}>
                      {steps} / bar
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pattern-waveform">
              <Waveform
                peaks={patternPeaks ?? slicePeaks}
                totalSteps={patternStepsTotal}
                isActive
                progress={isPlaying ? patternProgress : null}
                highlightStep={displayStep}
                highlightSliceIndex={currentSliceIndex}
                sliceCount={loopSliceCount}
                accentFill={patternAccent?.fill ?? null}
                accentStrong={patternAccent?.strong ?? null}
              />
              {patternOrder && (
                <div
                  className="pattern-step-overlay"
                  style={{ gridTemplateColumns: `repeat(${patternStepsTotal}, 1fr)` }}
                >
                  {patternOrder.slice(0, patternStepsTotal).map((sliceIndex, index) => {
                    const isActiveStep = activeStepIndex === index;
                    const isPlayingStep = displayStep === index;
                  const label =
                      sliceIndex >= 0 ? String((sliceIndex % loopSliceCount) + 1) : "--";
                  return (
                    <div
                        key={`${index}-${sliceIndex}`}
                        className={`pattern-step ${isActiveStep ? "active" : ""} ${
                          isPlayingStep ? "playing" : ""
                        }`}
                      onClick={() => setActiveStepIndex(index)}
                      style={{
                        background: isActiveStep ? patternAccent?.fill ?? "rgba(120, 170, 255, 0.25)" : "transparent"
                      }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveStepIndex(index);
                          }
                        }}
                      >
                        {isActiveStep && (
                          <>
                            <button
                              type="button"
                              className="pattern-step-arrow up"
                              aria-label="Increase slice index"
                              onClick={(event) => {
                                event.stopPropagation();
                                updatePatternStep(index, 1);
                              }}
                            >
                              ▲
                            </button>
                            <span className="pattern-step-label">{label}</span>
                            <button
                              type="button"
                              className="pattern-step-arrow down"
                              aria-label="Decrease slice index"
                              onClick={(event) => {
                                event.stopPropagation();
                                updatePatternStep(index, -1);
                              }}
                            >
                              ▼
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pad-section">
              <h3>MAINS</h3>
              <div className="pad-grid">
                {mainPatterns.map((pattern, index) => {
                  const isActive = isPlaying && activeMainId === pattern.id;
                  const isQueued = queuedMainId === pattern.id;
                  const background = `hsl(${30 + index * 12} 70% 88%)`;
                  return (
                    <button
                      key={pattern.id}
                      className={`pad ${isActive ? "active" : ""} ${isQueued ? "queued" : ""}`}
                      style={{ backgroundColor: background }}
                      onClick={() => {
                        if (isPlayingRef.current) {
                          queueMain(pattern.id);
                        } else {
                          startMain(pattern.id);
                        }
                      }}
                    >
                      <span>{pattern.name}</span>
                      {isActive && <span className="pad-badge">ACTIVE</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pad-section">
              <h3>FILLS</h3>
              <div className="pad-grid">
                {fillPatterns.map((pattern, index) => {
                  const isActive = activeFillId === pattern.id;
                  const isQueued = queuedFillId === pattern.id;
                  const background = `hsl(${200 + index * 8} 70% 90%)`;
                  return (
                    <button
                      key={pattern.id}
                      className={`pad ${isActive ? "active" : ""} ${isQueued ? "queued" : ""}`}
                      style={{ backgroundColor: background }}
                      onClick={() => startFill(pattern.id)}
                    >
                      <span>{pattern.name}</span>
                      {isActive && <span className="pad-badge">ACTIVE</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`controls-panel ${controlsOpen ? "open" : "closed"}`}>
              <button className="controls-header" onClick={() => setControlsOpen((prev) => !prev)} type="button">
                <span>Controls</span>
                <span className="caret">{controlsOpen ? "▾" : "▸"}</span>
              </button>
              {controlsOpen && (
                <div className="controls-body">
                <div className="tempo-control">
                  <span className="control-label">Tempo</span>
                  <div className="tempo-buttons">
                    <button className="control-button loop" onClick={() => requestTempoChange(-1)}>
                      −
                    </button>
                    <span className="tempo-value">{playbackBpm}</span>
                    <button className="control-button loop" onClick={() => requestTempoChange(1)}>
                      ＋
                    </button>
                  </div>
                  <select
                    className="tempo-select"
                    value={tempoPresets.includes(playbackBpm) ? playbackBpm : "custom"}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "custom") return;
                      const nextTempo = clampTempo(Number(value));
                      if (Number.isNaN(nextTempo)) return;
                      if (isPlayingRef.current) {
                        setQueuedPlaybackBpm(nextTempo);
                        if (transportRef.current) {
                          transportRef.current.queuedPlaybackBpm = nextTempo;
                        }
                      } else {
                        setPlaybackBpm(nextTempo);
                      }
                    }}
                  >
                    {!tempoPresets.includes(playbackBpm) && (
                      <option value="custom">{playbackBpm}</option>
                    )}
                    {tempoPresets.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                  {queuedPlaybackBpm !== null && queuedPlaybackBpm !== playbackBpm && (
                    <span className="tempo-queued">Queued {queuedPlaybackBpm}</span>
                  )}
                </div>
                  <div className="control-placeholder">
                    <span>Parameters (soon): swing, humanize, ratchet depth, fill length</span>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={gaplessEnabled}
                      onChange={(event) => setGaplessEnabled(event.target.checked)}
                    />
                    Gapless mode
                  </label>
                </div>
              )}
            </div>
          </section>
        )}

        {response && (
          <pre className="response">
            <code>{response}</code>
          </pre>
        )}
      </section>
    </main>
  );
}
