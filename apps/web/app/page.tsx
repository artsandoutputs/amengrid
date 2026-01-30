"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { patternGroups, type PatternGroupId } from "./patterns/stylePacks";
import { LoopPicker } from "./components/LoopPicker";
import { Waveform } from "./components/Waveform";

const DISCLAIMER_KEY = "amengrid_disclaimer_accepted";

type UploadResponse = {
  id: string;
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
  phraseBars: number;
  activeMainId: string | null;
  mainBeforeFillId: string | null;
  queuedMainId: string | null;
  queuedLoop: { startBarIndex: number; bars: LoopBars } | null;
  playbackBpm: number;
  queuedPlaybackBpm: number | null;
  queuedFillId: string | null;
  activeFillId: string | null;
  fillUntilStep: number | null;
  fillStartStep: number | null;
  fillStepsRemaining: number | null;
  fillStepIndex: number | null;
  nextStep: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const expandOrder = (order: number[], totalSteps: number) => {
  if (order.length === totalSteps) return order;
  const expanded: number[] = [];
  for (let i = 0; i < totalSteps; i += 1) {
    expanded.push(order[i % order.length]);
  }
  return expanded;
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
  const [file, setFile] = useState<File | null>(null);
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
  const [patternGroup, setPatternGroup] = useState<PatternGroupId>("DNB");
  const [activeMainId, setActiveMainId] = useState<string | null>(null);
  const [queuedMainId, setQueuedMainId] = useState<string | null>(null);
  const [queuedFillId, setQueuedFillId] = useState<string | null>(null);
  const [activeFillId, setActiveFillId] = useState<string | null>(null);
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
  const [loopProgress, setLoopProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [currentSliceIndex, setCurrentSliceIndex] = useState<number | null>(null);
  const [patternProgress, setPatternProgress] = useState(0);

  const audioRef = useRef<{ ctx: AudioContext | null; timer: number | null }>({
    ctx: null,
    timer: null
  });
  const loopSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const transportRef = useRef<TransportState | null>(null);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const schedulerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(DISCLAIMER_KEY);
    if (stored === "true") {
      setAccepted(true);
    }
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
    if (!bpm) return;
    setPlaybackBpm(Math.round(bpm));
  }, [bpm]);

  const canUpload = accepted && file && !isUploading;

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

  const loopSliceCount = useMemo(() => Math.max(1, Math.round(displayLoopBars * 16)), [displayLoopBars]);

  const getLoopParams = (bars: LoopBars, startIndex: number) => {
    const startSec = downbeat0Sec + startIndex * barDuration;
    const endSec = Math.min(durationSec, startSec + bars * barDuration);
    const loopDuration = Math.max(0.001, endSec - startSec);
    const stepsPerBar = 16;
    const totalSteps = Math.max(1, Math.round(bars * stepsPerBar));
    const baseStepDuration = loopDuration / totalSteps;
    return { startSec, endSec, loopDuration, totalSteps, baseStepDuration, stepsPerBar };
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
    const totalSteps = Math.max(1, Math.round(selectedLoop.bars * 16));
    setSlicePeaks(buildSlicePeaksFromBuffer(fullBuffer, selectedLoop, totalSteps));
  }, [selectedLoop, fullBuffer]);

  const activeGroup = useMemo(
    () => patternGroups.find((group) => group.id === patternGroup) ?? patternGroups[0],
    [patternGroup]
  );
  const mainPatterns = useMemo(() => activeGroup.mains.slice(0, 8), [activeGroup]);
  const fillPatterns = useMemo(() => activeGroup.fills.slice(0, 8), [activeGroup]);
  const patternsById = useMemo(
    () => new Map([...activeGroup.mains, ...activeGroup.fills].map((p) => [p.id, p])),
    [activeGroup]
  );

  const displayPatternId = useMemo(() => {
    if (activeFillId) return activeFillId;
    if (activeMainId) return activeMainId;
    if (queuedMainId) return queuedMainId;
    return mainPatterns[0]?.id ?? null;
  }, [activeFillId, activeMainId, queuedMainId, mainPatterns]);

  const displayPattern = displayPatternId ? patternsById.get(displayPatternId) ?? null : null;

  const patternStepsTotal = useMemo(() => {
    if (!displayPattern) return loopSliceCount;
    if (displayPattern.kind === "fill") return 16;
    return loopSliceCount;
  }, [displayPattern, loopSliceCount]);

  const patternOrder = useMemo(() => {
    if (!displayPattern) return null;
    const order = displayPattern.order;
    return expandOrder(order, patternStepsTotal);
  }, [displayPattern, patternStepsTotal]);

  const patternPeaks = useMemo(() => {
    if (!slicePeaks || !patternOrder) return null;
    return reorderSlicePeaks(slicePeaks, patternOrder, POINTS_PER_SLICE);
  }, [slicePeaks, patternOrder]);

  const displayStep = useMemo(() => {
    if (currentStep === null) return null;
    return currentStep % patternStepsTotal;
  }, [currentStep, patternStepsTotal]);

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
      transportRef.current.queuedPlaybackBpm = queuedPlaybackBpm;
    }
  }, [queuedPlaybackBpm]);

  useEffect(() => {
    const nextMain = mainPatterns[0]?.id ?? null;
    setActiveMainId(nextMain);
    setQueuedMainId(null);
    setQueuedFillId(null);
    setActiveFillId(null);
    stopTransport();
  }, [patternGroup]);

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
  };

  const schedulePattern = (patternId: string) => {
    if (!fullBuffer || !selectedLoop) return;
    const pattern = patternsById.get(patternId);
    if (!pattern) return;
    const ctx = ensureAudioContext();

    const activeParams = getLoopParams(activeLoopBars, activeStartBarIndex);
    const stepsPerBar = activeParams.stepsPerBar;
    const totalSteps = activeParams.totalSteps;
    const loopDuration = activeParams.loopDuration;
    const baseStepDuration = activeParams.baseStepDuration;
    const playbackStepDuration = (60 / playbackBpm) / 4;
    const startTime = ctx.currentTime + 0.05;

    transportRef.current = {
      startTime,
      loopStartSec: activeParams.startSec,
      loopDurationSec: loopDuration,
      baseStepDuration,
      playbackStepDuration,
      stepsPerBar,
      totalSteps,
      phraseBars,
      activeMainId: patternId,
      mainBeforeFillId: null,
      queuedMainId: null,
      queuedLoop,
      playbackBpm,
      queuedPlaybackBpm,
      queuedFillId: null,
      activeFillId: null,
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

    schedulerRef.current = window.setInterval(() => {
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
        const stepInBar = stepIndex % transport.stepsPerBar;
        let when = transport.startTime + stepIndex * transport.playbackStepDuration;
        transport.nextStep += 1;

        if (transport.queuedLoop && loopBoundaryTime !== null && when >= loopBoundaryTime) {
          const nextLoop = transport.queuedLoop;
          const nextParams = getLoopParams(nextLoop.bars, nextLoop.startBarIndex);
          transport.loopStartSec = nextParams.startSec;
          transport.loopDurationSec = nextParams.loopDuration;
          transport.baseStepDuration = nextParams.baseStepDuration;
          transport.totalSteps = nextParams.totalSteps;
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
          setActiveMainId(transport.activeMainId);
          transport.queuedMainId = null;
          setQueuedMainId(null);
          mainBoundaryTime = null;
        }

        if (
          transport.queuedPlaybackBpm &&
          tempoBoundaryTime !== null &&
          tempoBoundaryStep !== null &&
          when >= tempoBoundaryTime
        ) {
          const nextTempo = transport.queuedPlaybackBpm;
          const nextStepDuration = (60 / nextTempo) / 4;
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
          setQueuedFillId(null);
          setActiveFillId(transport.activeFillId);
          fillBoundaryTime = null;
        }

        const activePattern = transport.activeFillId
          ? patternsById.get(transport.activeFillId)
          : transport.activeMainId
            ? patternsById.get(transport.activeMainId)
            : null;

        if (!activePattern) {
          continue;
        }

        let sliceIndex = 0;
        if (transport.activeFillId && transport.fillStepsRemaining !== null && transport.fillStepIndex !== null) {
          sliceIndex = activePattern.order[transport.fillStepIndex % activePattern.order.length] ?? 0;
          transport.fillStepIndex += 1;
          transport.fillStepsRemaining -= 1;
          if (transport.fillStepsRemaining <= 0) {
            transport.activeFillId = null;
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
          const order = expandOrder(activePattern.order, transport.totalSteps);
          sliceIndex = order[stepIndex % transport.totalSteps] ?? 0;
        }
        if (sliceIndex < 0) {
          continue;
        }
        const offset = transport.loopStartSec + (sliceIndex % transport.totalSteps) * transport.baseStepDuration;

        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = fullBuffer;
        source.connect(gain);
        gain.connect(ctx.destination);

        const dur = transport.playbackStepDuration;
        const fadeIn = Math.min(0.0005, dur * 0.25);
        const fadeOut = Math.min(0.002, dur * 0.25);
        const endTime = when + dur;

        if (gaplessEnabled) {
          gain.gain.setValueAtTime(0, when);
          gain.gain.linearRampToValueAtTime(1, when + fadeIn);
          gain.gain.setValueAtTime(1, endTime - fadeOut);
          gain.gain.linearRampToValueAtTime(0, endTime);
        } else {
          gain.gain.setValueAtTime(1, when);
        }

        source.start(when, offset, dur);
        source.stop(endTime + 0.01);
        scheduledSourcesRef.current.push(source);
      }
    }, lookaheadMs);
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
    setLoopProgress(0);
  };

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (loopPlayback && audioRef.current.ctx) {
        const duration = loopPlayback.endSec - loopPlayback.startSec;
        if (duration > 0) {
          const elapsed = (audioRef.current.ctx.currentTime - loopPlayback.startedAt) % duration;
          setLoopProgress(clamp(elapsed / duration, 0, 1));
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

          const activePattern = transport.activeFillId
            ? patternsById.get(transport.activeFillId)
            : transport.activeMainId
              ? patternsById.get(transport.activeMainId)
              : null;
          if (activePattern) {
            if (transport.activeFillId && transport.fillStartStep !== null) {
              const fillStepIndex = (step - transport.fillStartStep + transport.stepsPerBar) % transport.stepsPerBar;
              const nextIndex = activePattern.order[fillStepIndex % activePattern.order.length] ?? 0;
              setCurrentSliceIndex(nextIndex >= 0 ? nextIndex : null);
            } else {
              const order = expandOrder(activePattern.order, transport.totalSteps);
              const nextIndex = order[step] ?? 0;
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
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeMainId, mainPatterns, fillPatterns]);

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
          stepsPerBar: 16
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

        <div className="button-row">
          <button className="primary" onClick={uploadFile} disabled={!canUpload}>
            {isUploading ? "Uploading..." : "Upload"}
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
              const nextBars = bars as LoopBars;
              const nextMax = getMaxStartIndex(nextBars);
              const nextStart = Math.min(nextMax, displayStartBarIndex);
              if (isPlayingRef.current) {
                setQueuedLoop({ startBarIndex: nextStart, bars: nextBars });
              } else {
                setActiveLoopBars(nextBars);
                setActiveStartBarIndex(nextStart);
              }
              setHasSliced(false);
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
                value={patternGroup}
                onChange={(event) => setPatternGroup(event.target.value as PatternGroupId)}
              >
                {patternGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </div>
            <Waveform
              peaks={patternPeaks ?? slicePeaks}
              totalSteps={patternStepsTotal}
              isActive
              progress={isPlaying ? patternProgress : null}
              highlightStep={displayStep}
              highlightSliceIndex={currentSliceIndex}
              sliceCount={loopSliceCount}
            />

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
