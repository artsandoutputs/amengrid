import fs from "node:fs";
import { readWavInfo } from "./wav.js";

export type LoopCandidate = {
  bars: 1 | 2 | 4 | 8 | 16;
  startSec: number;
  endSec: number;
  score: number;
};

export type AnalysisResult = {
  durationSec: number;
  bpm: number;
  bars: {
    barDurationSec: number;
    barStartsSec: number[];
  };
  loopCandidates: LoopCandidate[];
};

const ANALYSIS_WINDOW_SAMPLES = 1024;
const MAX_ANALYSIS_SECONDS = 120;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const computeEnvelope = (filePath: string, durationLimitSec: number) => {
  const info = readWavInfo(filePath);
  if (info.bitsPerSample !== 16) {
    throw new Error("Unsupported WAV: expected 16-bit PCM.");
  }

  const bytesPerSample = info.bitsPerSample / 8;
  const frameSize = bytesPerSample * info.channels;
  const maxSamples = Math.min(
    Math.floor(info.sampleRate * durationLimitSec),
    Math.floor(info.dataSize / frameSize)
  );

  const envelope: number[] = [];
  const fd = fs.openSync(filePath, "r");
  const bufferSize = 65536 - (65536 % frameSize);
  const buffer = Buffer.alloc(bufferSize);

  let samplesProcessed = 0;
  let windowSum = 0;
  let windowCount = 0;
  let fileOffset = info.dataOffset;

  try {
    while (samplesProcessed < maxSamples) {
      const toRead = Math.min(bufferSize, (maxSamples - samplesProcessed) * frameSize);
      const bytesRead = fs.readSync(fd, buffer, 0, toRead, fileOffset);
      if (bytesRead <= 0) {
        break;
      }

      const framesRead = Math.floor(bytesRead / frameSize);
      for (let frame = 0; frame < framesRead && samplesProcessed < maxSamples; frame += 1) {
        let sampleSum = 0;
        const base = frame * frameSize;
        for (let channel = 0; channel < info.channels; channel += 1) {
          const offset = base + channel * bytesPerSample;
          sampleSum += buffer.readInt16LE(offset);
        }
        const sample = sampleSum / info.channels / 32768;
        windowSum += sample * sample;
        windowCount += 1;
        samplesProcessed += 1;

        if (windowCount >= ANALYSIS_WINDOW_SAMPLES) {
          envelope.push(Math.sqrt(windowSum / windowCount));
          windowSum = 0;
          windowCount = 0;
        }
      }

      fileOffset += bytesRead;
    }

    if (windowCount > 0) {
      envelope.push(Math.sqrt(windowSum / windowCount));
    }
  } finally {
    fs.closeSync(fd);
  }

  const frameDurationSec = ANALYSIS_WINDOW_SAMPLES / info.sampleRate;
  return { info, envelope, frameDurationSec };
};

const estimateBpm = (envelope: number[], frameDurationSec: number) => {
  if (envelope.length < 4) {
    return 120;
  }

  const mean = envelope.reduce((sum, value) => sum + value, 0) / envelope.length;
  const normalized = envelope.map((value) => value - mean);

  const minBpm = 60;
  const maxBpm = 210;
  const minLag = Math.round((60 / maxBpm) / frameDurationSec);
  const maxLag = Math.round((60 / minBpm) / frameDurationSec);

  let bestLag = minLag;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < normalized.length; i += 1) {
      sum += normalized[i] * normalized[i + lag];
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestLag = lag;
    }
  }

  let bpm = 60 / (bestLag * frameDurationSec);

  if (bpm < 110) {
    bpm *= 2;
  } else if (bpm > 220) {
    bpm /= 2;
  }

  return clamp(bpm, minBpm, maxBpm);
};

const computeBarStarts = (durationSec: number, barDurationSec: number) => {
  const limit = Math.min(durationSec, MAX_ANALYSIS_SECONDS);
  const starts: number[] = [];
  for (let t = 0; t + 1e-6 < limit; t += barDurationSec) {
    starts.push(Number(t.toFixed(4)));
  }
  return starts;
};

const computeBarRms = (envelope: number[], frameDurationSec: number, barDurationSec: number, barCount: number) => {
  const barRms: number[] = [];
  const framesPerBar = Math.max(1, Math.round(barDurationSec / frameDurationSec));

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const startFrame = barIndex * framesPerBar;
    const endFrame = Math.min(envelope.length, startFrame + framesPerBar);
    if (startFrame >= envelope.length) {
      break;
    }
    let sum = 0;
    for (let i = startFrame; i < endFrame; i += 1) {
      sum += envelope[i];
    }
    barRms.push(sum / Math.max(1, endFrame - startFrame));
  }

  return { barRms, framesPerBar };
};

const scoreCandidate = (
  barRms: number[],
  startBar: number,
  bars: number,
  envelope: number[],
  framesPerBar: number,
  maxRms: number
) => {
  const slice = barRms.slice(startBar, startBar + bars);
  const avg = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const variance = slice.reduce((sum, value) => sum + (value - avg) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance);
  const consistency = 1 - clamp(std / (avg + 1e-6), 0, 1);

  const startFrame = startBar * framesPerBar;
  const endFrame = Math.min(envelope.length, (startBar + bars) * framesPerBar);
  const boundaryFrames = Math.max(4, Math.floor(framesPerBar * 0.25));
  const startSlice = envelope.slice(startFrame, startFrame + boundaryFrames);
  const endSlice = envelope.slice(Math.max(startFrame, endFrame - boundaryFrames), endFrame);
  const startRms = startSlice.reduce((sum, value) => sum + value, 0) / Math.max(1, startSlice.length);
  const endRms = endSlice.reduce((sum, value) => sum + value, 0) / Math.max(1, endSlice.length);

  const boundaryScore = 1 - clamp(Math.abs(startRms - endRms) / (avg + 1e-6), 0, 1);
  const energyScore = clamp(avg / (maxRms + 1e-6), 0, 1);
  let score = 0.45 * consistency + 0.35 * boundaryScore + 0.2 * energyScore;

  const silenceThresh = maxRms * 0.1;
  if (avg < silenceThresh) {
    score *= 0.3;
  }
  if (Math.min(startRms, endRms) < silenceThresh) {
    score *= 0.6;
  }

  return clamp(score * 100, 0, 100);
};

const computeLoopCandidates = (
  barRms: number[],
  envelope: number[],
  framesPerBar: number,
  barDurationSec: number,
  durationSec: number
): LoopCandidate[] => {
  const candidates: LoopCandidate[] = [];
  const maxRms = barRms.reduce((max, value) => Math.max(max, value), 0);

  const lengths: Array<1 | 2 | 4 | 8 | 16> = [2, 4, 8, 16];

  for (const bars of lengths) {
    const local: LoopCandidate[] = [];
    for (let startBar = 0; startBar + bars <= barRms.length; startBar += 1) {
      const score = scoreCandidate(barRms, startBar, bars, envelope, framesPerBar, maxRms);
      const startSec = startBar * barDurationSec;
      const endSec = startSec + bars * barDurationSec;
      if (endSec > durationSec + 1e-6) {
        continue;
      }
      local.push({ bars, startSec, endSec, score: Number(score.toFixed(1)) });
    }

    local.sort((a, b) => b.score - a.score);
    candidates.push(...local.slice(0, 5));
  }

  return candidates.sort((a, b) => b.score - a.score);
};

export const analyzeWav = (filePath: string): AnalysisResult => {
  const { info, envelope, frameDurationSec } = computeEnvelope(filePath, MAX_ANALYSIS_SECONDS);
  const bpm = estimateBpm(envelope, frameDurationSec);
  const barDurationSec = (60 / bpm) * 4;
  const barStartsSec = computeBarStarts(info.durationSec, barDurationSec);

  const barCount = Math.min(barStartsSec.length, Math.floor(MAX_ANALYSIS_SECONDS / barDurationSec));
  const { barRms, framesPerBar } = computeBarRms(envelope, frameDurationSec, barDurationSec, barCount);

  const loopCandidates = computeLoopCandidates(
    barRms,
    envelope,
    framesPerBar,
    barDurationSec,
    info.durationSec
  );

  return {
    durationSec: Number(info.durationSec.toFixed(4)),
    bpm: Number(bpm.toFixed(2)),
    bars: {
      barDurationSec: Number(barDurationSec.toFixed(4)),
      barStartsSec
    },
    loopCandidates
  };
};
