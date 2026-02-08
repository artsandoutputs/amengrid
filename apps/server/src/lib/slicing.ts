import fs from "node:fs";
import path from "node:path";
import { readWavInfo } from "./wav.js";

export type LoopSelection = {
  startSec: number;
  endSec: number;
  bars: 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;
};

export type SliceResult = {
  count: number;
  sliceStartsSec: number[];
  files: string[];
};

const WAV_HEADER_SIZE = 44;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const writeWavFile = (
  filePath: string,
  samples: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
) => {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = samples.length;
  const riffSize = 36 + dataSize;

  const header = Buffer.alloc(WAV_HEADER_SIZE);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(riffSize, 4);
  header.write("WAVE", 8, 4, "ascii");
  header.write("fmt ", 12, 4, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, 4, "ascii");
  header.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(filePath, Buffer.concat([header, samples]));
};

export const sliceLoopToWavs = (
  wavPath: string,
  loop: LoopSelection,
  subdivision: number,
  outputDir: string,
  bpm: number = 0,
  beatsPerBar: number = 4
): SliceResult => {
  const info = readWavInfo(wavPath);
  if (info.bitsPerSample !== 16) {
    throw new Error("Unsupported WAV: expected 16-bit PCM.");
  }

  const loopDurationSec = loop.endSec - loop.startSec;
  if (loopDurationSec <= 0) {
    throw new Error("Loop end must be greater than start.");
  }

  const sliceCount = Math.max(1, Math.round(loop.bars * subdivision));
  
  // Calculate step duration based on BPM and subdivision
  // Step duration = (60 / BPM) * (4 / subdivision) seconds per step
  let sliceDurationSec = loopDurationSec / sliceCount;
  if (bpm > 0) {
    const barDurationSec = (60 / bpm) * beatsPerBar;
    const stepDurationSec = barDurationSec / subdivision;
    sliceDurationSec = stepDurationSec;
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const bytesPerSample = info.bitsPerSample / 8;
  const frameSize = bytesPerSample * info.channels;
  const totalSamples = info.dataSize / frameSize;

  const startSample = clamp(Math.round(loop.startSec * info.sampleRate), 0, totalSamples);
  const endSample = clamp(Math.round(loop.endSec * info.sampleRate), 0, totalSamples);

  const fd = fs.openSync(wavPath, "r");
  const sliceStartsSec: number[] = [];
  const files: string[] = [];

  try {
    for (let i = 0; i < sliceCount; i += 1) {
      const sliceStartSec = loop.startSec + i * sliceDurationSec;
      const sliceEndSec = sliceStartSec + sliceDurationSec;
      const sliceStartSample = clamp(Math.round(sliceStartSec * info.sampleRate), startSample, endSample);
      const sliceEndSample = clamp(Math.round(sliceEndSec * info.sampleRate), startSample, endSample);
      const sliceSampleCount = Math.max(0, sliceEndSample - sliceStartSample);
      const sliceByteCount = sliceSampleCount * frameSize;

      const buffer = Buffer.alloc(sliceByteCount);
      if (sliceByteCount > 0) {
        const offset = info.dataOffset + sliceStartSample * frameSize;
        fs.readSync(fd, buffer, 0, sliceByteCount, offset);
      }

      const fileName = `slice-${String(i).padStart(2, "0")}.wav`;
      const filePath = path.join(outputDir, fileName);
      writeWavFile(filePath, buffer, info.sampleRate, info.channels, info.bitsPerSample);

      sliceStartsSec.push(Number(sliceStartSec.toFixed(4)));
      files.push(fileName);
    }
  } finally {
    fs.closeSync(fd);
  }

  return {
    count: sliceCount,
    sliceStartsSec,
    files
  };
};
