"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  PATTERN_PACKS,
  type Pattern,
  type PatternPack,
  type StepEvent
} from "./patternPacks";
import { LoopPicker } from "./components/LoopPicker";
import { Waveform } from "./components/Waveform";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const DEFAULT_API_BASE_URL = "https://sliceloop.api.amengrid.com";
const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
const apiBaseUrl = (rawApiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
const buildApiUrl = (pathSegment: string) => {
  if (/^https?:\/\//i.test(pathSegment)) return pathSegment;
  return `${apiBaseUrl}/${pathSegment.replace(/^\/+/, "")}`;
};

const getPatternPhraseBars = (pattern: Pattern) => {
  return Math.max(1, Math.round(pattern.steps.length / BASE_STEPS_PER_BAR));
};

const getPatternTotalSteps = (pattern: Pattern) => pattern.steps.length;

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

type RoleSlices = {
  kick: number[];
  snare: number[];
  hat: number[];
  ghost: number[];
};

type SliceLoopPoint = {
  start: number;
  end: number;
} | null;

type ExportItem = {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  durationSec: number;
  sizeBytes: number;
  normalized: boolean;
  bars: LoopBars;
  bpm: number;
  stepsPerBar: number;
  patternName: string;
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
const LOCKED_STEPS_PER_BAR = 16;

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

const buildDefaultRoleSlices = (steps: number): RoleSlices => {
  const safe = (value: number) => Math.max(0, Math.min(steps - 1, value));
  const result: RoleSlices = { kick: [], snare: [], hat: [], ghost: [] };
  const bars = Math.max(1, Math.round(steps / BASE_STEPS_PER_BAR));
  for (let bar = 0; bar < bars; bar += 1) {
    const base = bar * BASE_STEPS_PER_BAR;
    result.kick.push(safe(base + 0), safe(base + 8));
    result.snare.push(safe(base + 4), safe(base + 12));
    result.hat.push(safe(base + 2), safe(base + 6), safe(base + 10), safe(base + 14));
    result.ghost.push(safe(base + 3), safe(base + 7), safe(base + 11), safe(base + 15));
  }
  return result;
};

const buildRoleSlicesFromSteps = (
  steps: StepEvent[],
  stepsPerBar: number,
  totalSteps: number,
  bars: number
) => {
  const result: RoleSlices = { kick: [], snare: [], hat: [], ghost: [] };
  const expanded = expandOrder(steps, totalSteps);
  for (let i = 0; i < totalSteps; i += 1) {
    const event = expanded[i];
    const resolved = resolveStepEvent(event);
    if (resolved.index < 0) continue;
    const barIndex = Math.floor(i / stepsPerBar);
    const barOffset = barIndex * BASE_STEPS_PER_BAR;
    const sliceIndex = resolved.index + barOffset;
    result.kick.push(sliceIndex);
    result.snare.push(sliceIndex);
    result.hat.push(sliceIndex);
    result.ghost.push(sliceIndex);
  }
  return result;
};

const mergeRoleSlices = (a: RoleSlices, b: RoleSlices): RoleSlices => {
  return {
    kick: [...a.kick, ...b.kick],
    snare: [...a.snare, ...b.snare],
    hat: [...a.hat, ...b.hat],
    ghost: [...a.ghost, ...b.ghost],
  };
};

const scheduleSlice = (
  context: AudioContext,
  buffer: AudioBuffer,
  loop: LoopSelection,
  sliceIndex: number,
  when: number,
  totalSteps: number,
  retrig: number,
  gain: number
) => {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(loop.startSec * sampleRate);
  const endSample = Math.min(buffer.length, Math.floor(loop.endSec * sampleRate));
  const loopSamples = Math.max(1, endSample - startSample);
  const samplesPerStep = Math.max(1, Math.floor(loopSamples / totalSteps));

  const safeIndex = ((sliceIndex % totalSteps) + totalSteps) % totalSteps;
  const sliceStart = startSample + safeIndex * samplesPerStep;
  const sliceEnd = Math.min(endSample, sliceStart + samplesPerStep);
  const sliceDuration = (sliceEnd - sliceStart) / sampleRate;

  const source = context.createBufferSource();
  source.buffer = buffer;

  const gainNode = context.createGain();
  gainNode.gain.value = gain;
  source.connect(gainNode);
  gainNode.connect(context.destination);

  const sliceStartSec = sliceStart / sampleRate;
  const sliceEndSec = sliceEnd / sampleRate;

  if (retrig > 1) {
    const retrigDuration = sliceDuration / retrig;
    for (let r = 0; r < retrig; r += 1) {
      const retrigSource = context.createBufferSource();
      retrigSource.buffer = buffer;
      const retrigGain = context.createGain();
      retrigGain.gain.value = gain;
      retrigSource.connect(retrigGain);
      retrigGain.connect(context.destination);
      retrigSource.start(when + r * retrigDuration, sliceStartSec, sliceEndSec - sliceStartSec);
    }
  } else {
    source.start(when, sliceStartSec, sliceEndSec - sliceStartSec);
  }
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Sync export metadata to Supabase (skip if config is missing)
const syncExportToCloud = async (item: ExportItem) => {
  if (!supabaseClient) {
    console.warn("Supabase client not configured; skipping export sync.");
    return;
  }

  const { error } = await supabaseClient
    .from("exports")
    .insert([
      {
        id: item.id,
        name: item.name,
        bpm: item.bpm,
        pattern_name: item.patternName,
        duration_sec: item.durationSec,
        bars: item.bars,
        size_bytes: item.sizeBytes,
        created_at: new Date(item.createdAt).toISOString(),
      },
    ]);

  if (error) {
    console.error("Supabase Sync Error:", error.message);
  }
};

export default function Page() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [convertedPath, setConvertedPath] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [selectedLoop, setSelectedLoop] = useState<LoopSelection | null>(null);
  const [loopBars, setLoopBars] = useState<LoopBars>(1);
  const [startBarIndex, setStartBarIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [selectedPatternPack, setSelectedPatternPack] = useState<PatternPack>(PATTERN_PACKS[0]);
  const [selectedMainPattern, setSelectedMainPattern] = useState<string | null>(null);
  const [activeMainId, setActiveMainId] = useState<string | null>(null);
  const [queuedMainId, setQueuedMainId] = useState<string | null>(null);
  const [queuedFillId, setQueuedFillId] = useState<string | null>(null);
  const [activeFillId, setActiveFillId] = useState<string | null>(null);
  const [playbackBpm, setPlaybackBpm] = useState<number>(120);
  const [queuedPlaybackBpm, setQueuedPlaybackBpm] = useState<number | null>(null);
  const [gaplessEnabled, setGaplessEnabled] = useState(false);
  const [exportsList, setExportsList] = useState<ExportItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [normalizeExport, setNormalizeExport] = useState(false);
  const [playingExportId, setPlayingExportId] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const loopPlaybackStateRef = useRef<LoopPlaybackState | null>(null);
  const schedulerIntervalRef = useRef<number | null>(null);
  const transportRef = useRef<TransportState | null>(null);
  const exportPlayerRef = useRef<AudioBufferSourceNode | null>(null);

  const tempoPresets = [60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];
  const clampTempo = (tempo: number) => clamp(tempo, 40, 200);

  useEffect(() => {
    const accepted = localStorage.getItem(DISCLAIMER_KEY);
    if (accepted === "true") {
      setDisclaimerAccepted(true);
    }
  }, []);

  const acceptDisclaimer = () => {
    localStorage.setItem(DISCLAIMER_KEY, "true");
    setDisclaimerAccepted(true);
  };

  useEffect(() => {
    if (!analysisData) {
      setStartBarIndex(0);
      return;
    }
    const bpm = analysisData.analysis.bpm;
    if (!bpm) return;
    const downbeatSec = analysisData.analysis.downbeat0Sec ?? 0;
    const durationSec = analysisData.analysis.durationSec;
    const secondsPerBar = (60 / bpm) * 4;
    const availableBars = Math.max(1, Math.floor((durationSec - downbeatSec) / secondsPerBar));
    const maxStartBar = Math.max(0, Math.floor(availableBars - loopBars));
    setStartBarIndex((prev) => (prev > maxStartBar ? maxStartBar : prev));
  }, [analysisData, loopBars]);

  useEffect(() => {
    if (!analysisData) {
      setSelectedLoop(null);
      return;
    }
    const bpm = analysisData.analysis.bpm;
    if (!bpm) {
      setSelectedLoop(null);
      return;
    }
    const downbeatSec = analysisData.analysis.downbeat0Sec ?? 0;
    const secondsPerBar = (60 / bpm) * 4;
    const loopDurationSec = loopBars * secondsPerBar;
    const startSec = downbeatSec + startBarIndex * secondsPerBar;
    const endSec = Math.min(analysisData.analysis.durationSec, startSec + loopDurationSec);
    setSelectedLoop({ startSec, endSec, bars: loopBars });
  }, [analysisData, startBarIndex, loopBars]);

  useEffect(() => {
    if (!analysisData) return;
    const bpm = analysisData.analysis.bpm;
    if (typeof bpm !== "number" || Number.isNaN(bpm)) return;
    if (isPlayingRef.current) return;
    const nextTempo = clampTempo(Math.round(bpm));
    setPlaybackBpm(nextTempo);
    setQueuedPlaybackBpm(null);
  }, [analysisData]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setUploadedId(null);
      setConvertedPath(null);
      setAnalysisData(null);
      setAudioBuffer(null);
      setSelectedLoop(null);
      setResponse(null);
    }
  };

  const uploadAudio = async () => {
    if (!audioFile) return;
    try {
      setResponse("Uploading...");
      const formData = new FormData();
      formData.append("audio", audioFile);

      const res = await fetch(buildApiUrl("upload"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Upload failed: ${res.status} ${res.statusText}\n${errorText}`);
      }

      const data: UploadResponse = await res.json();
      setUploadedId(data.id);
      setConvertedPath(data.converted.path);
      setResponse(`Uploaded: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const analyzeAudio = async () => {
    if (!uploadedId) return;
    try {
      setResponse("Analyzing...");
      const res = await fetch(buildApiUrl("analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: uploadedId,
          convertedUrl: convertedPath ?? undefined
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Analysis failed: ${res.status} ${res.statusText}\n${errorText}`);
      }

      const data: AnalysisResponse = await res.json();
      setAnalysisData(data);
      if (typeof data.analysis.bpm === "number" && !Number.isNaN(data.analysis.bpm)) {
        setPlaybackBpm(clampTempo(Math.round(data.analysis.bpm)));
      }
      setResponse(`Analysis: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const loadAudioBuffer = async () => {
    if (!convertedPath) return;
    try {
      setResponse("Loading audio buffer...");
      const url = buildApiUrl(convertedPath);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);

      const arrayBuffer = await res.arrayBuffer();
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(arrayBuffer);

      setAudioBuffer(buffer);
      audioContextRef.current = context;
      setResponse(`Audio buffer loaded: ${buffer.duration.toFixed(2)}s`);
    } catch (error) {
      setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleStartBarChange = (index: number) => {
    setStartBarIndex(Math.max(0, index));
    if (isPlaying) {
      stop();
    }
  };

  const handleLoopBarsChange = (bars: number) => {
    setLoopBars(bars as LoopBars);
    if (isPlaying) {
      stop();
    }
  };

  const toggleLoopPlayback = () => {
    if (isPlaying) {
      stop();
    } else if (selectedMainPattern) {
      startMain(selectedMainPattern);
    }
  };

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

  const startMain = (patternId: string) => {
    if (!audioBuffer || !selectedLoop || !audioContextRef.current) return;

    const pattern = selectedPatternPack.mains.find((p) => p.id === patternId);
    if (!pattern) return;

    stop();

    const context = audioContextRef.current;
    if (context.state === "suspended") {
      context.resume();
    }

    const stepsPerBar = LOCKED_STEPS_PER_BAR;
    const phraseBars = getPatternPhraseBars(pattern);
    const totalSteps = getPatternTotalSteps(pattern);
    const baseTotalSteps = BASE_STEPS_PER_BAR * phraseBars;

    const loopDurationSec = selectedLoop.endSec - selectedLoop.startSec;
    const baseStepDuration = loopDurationSec / baseTotalSteps;
    const playbackStepDuration = (60 / playbackBpm) * (BASE_STEPS_PER_BAR / stepsPerBar);

    const transport: TransportState = {
      startTime: context.currentTime,
      loopStartSec: selectedLoop.startSec,
      loopDurationSec,
      baseStepDuration,
      playbackStepDuration,
      stepsPerBar,
      totalSteps,
      baseTotalSteps,
      phraseBars,
      activeMainId: patternId,
      activeMainSteps: pattern.steps,
      mainBeforeFillId: null,
      queuedMainId: null,
      queuedStepsPerBar: null,
      queuedLoop: null,
      playbackBpm,
      queuedPlaybackBpm: null,
      queuedFillId: null,
      activeFillId: null,
      activeFillSteps: null,
      fillUntilStep: null,
      fillStartStep: null,
      fillStepsRemaining: null,
      fillStepIndex: null,
      nextStep: 0,
    };

    transportRef.current = transport;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setActiveMainId(patternId);
    setQueuedMainId(null);
    setActiveFillId(null);
    setQueuedFillId(null);

    const scheduleWindow = 0.1;
    let lastScheduledStep = -1;

    const scheduler = () => {
      const now = context.currentTime;
      const t = transportRef.current;
      if (!t || !isPlayingRef.current) return;

      while (true) {
        const stepTime = t.startTime + t.nextStep * t.playbackStepDuration;
        if (stepTime > now + scheduleWindow) break;

        const currentStep = t.nextStep % t.totalSteps;

        if (t.fillStepsRemaining !== null && t.fillStepsRemaining > 0) {
          if (t.activeFillSteps && t.fillStepIndex !== null) {
            const fillEvent = t.activeFillSteps[t.fillStepIndex % t.activeFillSteps.length];
            const resolved = resolveStepEvent(fillEvent);
            if (resolved.index >= 0) {
              const barIndex = Math.floor(t.nextStep / t.stepsPerBar);
              const barOffset = barIndex * BASE_STEPS_PER_BAR;
              const sliceIndex = resolved.index + barOffset;
              scheduleSlice(
                context,
                audioBuffer,
                selectedLoop,
                sliceIndex,
                stepTime,
                t.baseTotalSteps,
                resolved.retrig,
                resolved.gain ?? 1
              );
            }
            t.fillStepIndex += 1;
          }
          t.fillStepsRemaining -= 1;

          if (t.fillStepsRemaining === 0) {
            t.activeFillId = null;
            t.activeFillSteps = null;
            t.fillStepIndex = null;
            t.fillStartStep = null;
            t.fillUntilStep = null;
            t.fillStepsRemaining = null;
            setActiveFillId(null);

            if (t.mainBeforeFillId) {
              t.activeMainId = t.mainBeforeFillId;
              const restoredPattern = selectedPatternPack.mains.find((p) => p.id === t.mainBeforeFillId);
              if (restoredPattern) {
                t.activeMainSteps = restoredPattern.steps;
              }
              t.mainBeforeFillId = null;
              setActiveMainId(t.activeMainId);
            }
          }
        } else {
          if (t.activeMainSteps) {
            const mainEvent = t.activeMainSteps[currentStep % t.activeMainSteps.length];
            const resolved = resolveStepEvent(mainEvent);
            if (resolved.index >= 0) {
              const barIndex = Math.floor(t.nextStep / t.stepsPerBar);
              const barOffset = barIndex * BASE_STEPS_PER_BAR;
              const sliceIndex = resolved.index + barOffset;
              scheduleSlice(
                context,
                audioBuffer,
                selectedLoop,
                sliceIndex,
                stepTime,
                t.baseTotalSteps,
                resolved.retrig,
                resolved.gain ?? 1
              );
            }
          }
        }

        if (currentStep === 0 && t.nextStep > 0) {
          if (t.queuedMainId && t.queuedStepsPerBar) {
            const nextPattern = selectedPatternPack.mains.find((p) => p.id === t.queuedMainId);
            if (nextPattern) {
              t.activeMainId = t.queuedMainId;
              t.activeMainSteps = nextPattern.steps;
              t.stepsPerBar = t.queuedStepsPerBar;
              t.totalSteps = t.stepsPerBar * t.phraseBars;
              t.playbackStepDuration = (60 / t.playbackBpm) * (BASE_STEPS_PER_BAR / t.stepsPerBar);
              setActiveMainId(t.activeMainId);
            }
            t.queuedMainId = null;
            t.queuedStepsPerBar = null;
            setQueuedMainId(null);
          }

          if (t.queuedPlaybackBpm !== null) {
            t.playbackBpm = t.queuedPlaybackBpm;
            t.playbackStepDuration = (60 / t.playbackBpm) * (BASE_STEPS_PER_BAR / t.stepsPerBar);
            setPlaybackBpm(t.playbackBpm);
            t.queuedPlaybackBpm = null;
            setQueuedPlaybackBpm(null);
          }

          if (t.queuedFillId) {
            const fillPattern = selectedPatternPack.fills.find((p) => p.id === t.queuedFillId);
            if (fillPattern) {
              t.mainBeforeFillId = t.activeMainId;
              t.activeFillId = t.queuedFillId;
              t.activeFillSteps = fillPattern.steps;
              t.fillStartStep = t.nextStep;
              t.fillStepsRemaining = fillPattern.steps.length;
              t.fillUntilStep = t.nextStep + t.fillStepsRemaining;
              t.fillStepIndex = 0;
              setActiveFillId(t.activeFillId);
            }
            t.queuedFillId = null;
            setQueuedFillId(null);
          }
        }

        lastScheduledStep = t.nextStep;
        t.nextStep += 1;
      }

      const visualStep = Math.floor((now - t.startTime) / t.playbackStepDuration) % t.totalSteps;
      setActiveStep(visualStep);
    };

    scheduler();
    const interval = window.setInterval(scheduler, 25);
    schedulerIntervalRef.current = interval;
  };

  const stop = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setActiveStep(-1);
    setActiveMainId(null);
    setQueuedMainId(null);
    setActiveFillId(null);
    setQueuedFillId(null);
    setQueuedPlaybackBpm(null);

    if (schedulerIntervalRef.current !== null) {
      clearInterval(schedulerIntervalRef.current);
      schedulerIntervalRef.current = null;
    }

    transportRef.current = null;
  };

  const queueMain = (patternId: string) => {
    const pattern = selectedPatternPack.mains.find((p) => p.id === patternId);
    if (!pattern) return;

    setQueuedMainId(patternId);
    if (transportRef.current) {
      transportRef.current.queuedMainId = patternId;
      transportRef.current.queuedStepsPerBar = LOCKED_STEPS_PER_BAR;
    }
  };

  const startFill = (fillId: string) => {
    if (!isPlayingRef.current) return;

    setQueuedFillId(fillId);
    if (transportRef.current) {
      transportRef.current.queuedFillId = fillId;
    }
  };

  const peaks = useMemo(() => {
    if (!audioBuffer) return [];
    return computePeaksFromBuffer(audioBuffer);
  }, [audioBuffer]);

  const slicePeaks = useMemo(() => {
    if (!audioBuffer || !selectedLoop) return [];
    const stepsPerBar = LOCKED_STEPS_PER_BAR;
    const phraseBars = 1;
    const totalSteps = stepsPerBar * phraseBars;
    return buildSlicePeaksFromBuffer(audioBuffer, selectedLoop, totalSteps, POINTS_PER_SLICE);
  }, [audioBuffer, selectedLoop]);

  const displayPeaks = useMemo(() => {
    if (slicePeaks.length === 0) return slicePeaks;
    if (!activeMainId) return slicePeaks;

    const pattern = selectedPatternPack.mains.find((p) => p.id === activeMainId);
    if (!pattern) return slicePeaks;

    const stepsPerBar = LOCKED_STEPS_PER_BAR;
    const phraseBars = getPatternPhraseBars(pattern);
    const totalSteps = getPatternTotalSteps(pattern);
    const order = expandOrderToIndices(pattern.steps, totalSteps);
    return reorderSlicePeaks(slicePeaks, order, POINTS_PER_SLICE);
  }, [slicePeaks, activeMainId, selectedPatternPack]);

  const renderExport = async () => {
    if (!audioBuffer || !selectedLoop || !audioContextRef.current) return;
    if (!activeMainId) {
      setExportStatus("No active pattern");
      return;
    }

    const pattern = selectedPatternPack.mains.find((p) => p.id === activeMainId);
    if (!pattern) return;

    setIsExporting(true);
    setExportStatus("Rendering...");

    try {
      const stepsPerBar = LOCKED_STEPS_PER_BAR;
      const phraseBars = getPatternPhraseBars(pattern);
      const totalSteps = getPatternTotalSteps(pattern);
      const baseTotalSteps = BASE_STEPS_PER_BAR * phraseBars;

      const loopDurationSec = selectedLoop.endSec - selectedLoop.startSec;
      const baseStepDuration = loopDurationSec / baseTotalSteps;
      const playbackStepDuration = (60 / playbackBpm) * (BASE_STEPS_PER_BAR / stepsPerBar);
      const totalDuration = totalSteps * playbackStepDuration;

      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.ceil(totalDuration * audioBuffer.sampleRate),
        audioBuffer.sampleRate
      );

      for (let step = 0; step < totalSteps; step += 1) {
        const mainEvent = pattern.steps[step % pattern.steps.length];
        const resolved = resolveStepEvent(mainEvent);
        if (resolved.index >= 0) {
          const barIndex = Math.floor(step / stepsPerBar);
          const barOffset = barIndex * BASE_STEPS_PER_BAR;
          const sliceIndex = resolved.index + barOffset;
          const stepTime = step * playbackStepDuration;
          const gain = resolved.gain ?? 1;

          const sampleRate = audioBuffer.sampleRate;
          const startSample = Math.floor(selectedLoop.startSec * sampleRate);
          const endSample = Math.min(audioBuffer.length, Math.floor(selectedLoop.endSec * sampleRate));
          const loopSamples = Math.max(1, endSample - startSample);
          const samplesPerStep = Math.max(1, Math.floor(loopSamples / baseTotalSteps));

          const safeIndex = ((sliceIndex % baseTotalSteps) + baseTotalSteps) % baseTotalSteps;
          const sliceStart = startSample + safeIndex * samplesPerStep;
          const sliceEnd = Math.min(endSample, sliceStart + samplesPerStep);

          const source = offlineContext.createBufferSource();
          source.buffer = audioBuffer;

          const gainNode = offlineContext.createGain();
          gainNode.gain.value = gain;
          source.connect(gainNode);
          gainNode.connect(offlineContext.destination);

          const sliceStartSec = sliceStart / sampleRate;
          const sliceEndSec = sliceEnd / sampleRate;

          source.start(stepTime, sliceStartSec, sliceEndSec - sliceStartSec);
        }
      }

      let renderedBuffer = await offlineContext.startRendering();

      if (normalizeExport) {
        const channel = renderedBuffer.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < channel.length; i += 1) {
          const abs = Math.abs(channel[i]);
          if (abs > peak) peak = abs;
        }
        if (peak > 0) {
          const factor = 0.99 / peak;
          for (let ch = 0; ch < renderedBuffer.numberOfChannels; ch += 1) {
            const data = renderedBuffer.getChannelData(ch);
            for (let i = 0; i < data.length; i += 1) {
              data[i] *= factor;
            }
          }
        }
      }

      const wavBuffer = audioBufferToWav(renderedBuffer);
      const blob = new Blob([wavBuffer], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      const timestamp = Date.now();
      // Use /\s+/ instead of /\\s+/ to correctly replace whitespace
      const exportName = `AmenGrid_${pattern.name.replace(/\s+/g, "-")}_${selectedLoop.bars}bar_${playbackBpm}bpm.wav`;

      const exportItem: ExportItem = {
        id: crypto.randomUUID(), // Better than timestamp for DB primary keys
        name: exportName,
        url,
        createdAt: timestamp,
        durationSec: renderedBuffer.duration,
        sizeBytes: blob.size,
        normalized: normalizeExport,
        bars: selectedLoop.bars,
        bpm: playbackBpm,
        stepsPerBar,
        patternName: pattern.name,
      };

      // Update both local UI and Supabase
      setExportsList((prev) => [exportItem, ...prev]);
      syncExportToCloud(exportItem);
      
      setExportStatus("Export ready!");

      setTimeout(() => setExportStatus(null), 3000);
    } catch (error) {
      setExportStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  const audioBufferToWav = (buffer: AudioBuffer) => {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const data = new Float32Array(buffer.length * numberOfChannels);
    for (let ch = 0; ch < numberOfChannels; ch += 1) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < buffer.length; i += 1) {
        data[i * numberOfChannels + ch] = channelData[i];
      }
    }

    const dataLength = data.length * bytesPerSample;
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i += 1) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < data.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return arrayBuffer;
  };

  const playExport = (id: string, url: string) => {
    if (!audioContextRef.current) return;

    if (playingExportId === id) {
      if (exportPlayerRef.current) {
        exportPlayerRef.current.stop();
        exportPlayerRef.current = null;
      }
      setPlayingExportId(null);
      return;
    }

    if (exportPlayerRef.current) {
      exportPlayerRef.current.stop();
      exportPlayerRef.current = null;
    }

    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((arrayBuffer) => audioContextRef.current!.decodeAudioData(arrayBuffer))
      .then((buffer) => {
        const context = audioContextRef.current!;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => {
          setPlayingExportId(null);
          exportPlayerRef.current = null;
        };
        source.start();
        exportPlayerRef.current = source;
        setPlayingExportId(id);
      })
      .catch((error) => {
        console.error("Error playing export:", error);
        setPlayingExportId(null);
      });
  };

  const removeExport = (id: string) => {
    setExportsList((prev) => {
      const item = prev.find((e) => e.id === id);
      if (item) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((e) => e.id !== id);
    });

    if (playingExportId === id) {
      if (exportPlayerRef.current) {
        exportPlayerRef.current.stop();
        exportPlayerRef.current = null;
      }
      setPlayingExportId(null);
    }
  };

  const mainPatterns = selectedPatternPack.mains;
  const fillPatterns = selectedPatternPack.fills;

  if (!disclaimerAccepted) {
    return (
      <main className="container">
        <section className="disclaimer">
          <h1>Important Notice</h1>
          <p>
            This application processes audio files. By using this application, you confirm that you have the legal
            right to use and modify any audio files you upload. You are solely responsible for ensuring that your use
            of this application complies with all applicable copyright laws and other legal requirements.
          </p>
          <button className="primary" onClick={acceptDisclaimer}>
            I Understand and Accept
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="main-content">
        <h1>Slice Loop Sequencer</h1>

        <div className="upload-section">
          <input type="file" accept="audio/*" onChange={handleFileChange} />
          <button className="primary" onClick={uploadAudio} disabled={!audioFile}>
            Upload
          </button>
          <button className="primary" onClick={analyzeAudio} disabled={!uploadedId}>
            Analyze
          </button>
          <button className="primary" onClick={loadAudioBuffer} disabled={!convertedPath}>
            Load Buffer
          </button>
        </div>

        {analysisData && (
          <LoopPicker
            peaks={peaks}
            durationSec={analysisData.analysis.durationSec}
            bpm={analysisData.analysis.bpm}
            downbeat0Sec={analysisData.analysis.downbeat0Sec}
            loopBars={loopBars}
            startBarIndex={startBarIndex}
            onStartBarChange={handleStartBarChange}
            onLoopBarsChange={handleLoopBarsChange}
            onPlayToggle={toggleLoopPlayback}
            isPlaying={isPlaying}
          />
        )}

        {selectedLoop && (
          <section className="sequencer">
            <div className="waveform-container">
              <Waveform
                peaks={displayPeaks}
                totalSteps={LOCKED_STEPS_PER_BAR}
                isActive={isPlaying}
                progress={isPlaying ? activeStep / Math.max(1, LOCKED_STEPS_PER_BAR) : null}
                highlightStep={activeStep >= 0 ? activeStep : null}
              />
            </div>

            <div className="transport-controls">
              <button
                className={`control-button play ${isPlaying ? "stop" : "start"}`}
                onClick={() => {
                  if (isPlaying) {
                    stop();
                  } else if (selectedMainPattern) {
                    startMain(selectedMainPattern);
                  }
                }}
                disabled={!selectedMainPattern}
              >
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
                  </svg>
                )}
              </button>
            </div>

            <div className="pattern-pack-selector">
              <label htmlFor="pattern-pack-select">Pattern Pack:</label>
              <select
                id="pattern-pack-select"
                value={selectedPatternPack.id}
                onChange={(e) => {
                  const pack = PATTERN_PACKS.find((p) => p.id === e.target.value);
                  if (pack) {
                    setSelectedPatternPack(pack);
                    setSelectedMainPattern(null);
                    if (isPlaying) {
                      stop();
                    }
                  }
                }}
              >
                {PATTERN_PACKS.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
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
                          setSelectedMainPattern(pattern.id);
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
                        +
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
                      {!tempoPresets.includes(playbackBpm) && <option value="custom">{playbackBpm}</option>}
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

            <div className="exports-panel">
              <div className="exports-header">
                <div>
                  <h3>Exports</h3>
                  <p>Render the current loop and keep the WAVs here.</p>
                </div>
                <button className="primary" onClick={renderExport} disabled={isExporting || !selectedLoop}>
                  {isExporting ? "Rendering..." : "Render Export"}
                </button>
              </div>
              <div className="exports-controls">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={normalizeExport}
                    onChange={(event) => setNormalizeExport(event.target.checked)}
                  />
                  Normalize output
                </label>
                {exportStatus && <span className="status">{exportStatus}</span>}
              </div>
              {exportsList.length === 0 ? (
                <p className="exports-empty">No exports yet.</p>
              ) : (
                <div className="exports-list">
                  {exportsList.map((item) => (
                    <div key={item.id} className="export-item">
                      <div>
                        <h4>{item.name}</h4>
                        <div className="export-meta">
                          <span>{formatDuration(item.durationSec)}</span>
                          <span>{formatSize(item.sizeBytes)}</span>
                          <span>{item.bars} bars</span>
                          <span>{item.bpm} bpm</span>
                          <span>{item.stepsPerBar} steps/bar</span>
                          <span>{item.patternName}</span>
                          {item.normalized && <span>normalized</span>}
                        </div>
                      </div>
                      <div className="export-actions">
                        <button
                          type="button"
                          className={`control-button play ${playingExportId === item.id ? "stop" : "start"}`}
                          onClick={() => playExport(item.id, item.url)}
                          aria-label={playingExportId === item.id ? "Stop" : "Play"}
                          title={playingExportId === item.id ? "Stop" : "Play"}
                        >
                          {playingExportId === item.id ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
                            </svg>
                          )}
                        </button>
                        <a className="text-button" href={item.url} download={item.name}>
                          Download
                        </a>
                        <button type="button" className="text-button" onClick={() => removeExport(item.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
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
