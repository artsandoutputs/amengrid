import fs from "node:fs";

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  durationSec: number;
};

const readChunkHeader = (fd: number, position: number) => {
  const header = Buffer.alloc(8);
  const bytes = fs.readSync(fd, header, 0, 8, position);
  if (bytes !== 8) {
    throw new Error("Invalid WAV: unexpected end of file while reading chunk header.");
  }
  const id = header.toString("ascii", 0, 4);
  const size = header.readUInt32LE(4);
  return { id, size };
};

export const readWavInfo = (filePath: string): WavInfo => {
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.statSync(filePath);
    const header = Buffer.alloc(12);
    const bytes = fs.readSync(fd, header, 0, 12, 0);
    if (bytes !== 12) {
      throw new Error("Invalid WAV: header too short.");
    }

    const riff = header.toString("ascii", 0, 4);
    const wave = header.toString("ascii", 8, 12);
    if (riff !== "RIFF" || wave !== "WAVE") {
      throw new Error("Invalid WAV: missing RIFF/WAVE headers.");
    }

    let position = 12;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let dataOffset = 0;
    let dataSize = 0;

    while (position + 8 <= stat.size) {
      const { id, size } = readChunkHeader(fd, position);
      const chunkStart = position + 8;

      if (id === "fmt ") {
        const fmtBuffer = Buffer.alloc(Math.min(size, 24));
        fs.readSync(fd, fmtBuffer, 0, fmtBuffer.length, chunkStart);
        const audioFormat = fmtBuffer.readUInt16LE(0);
        channels = fmtBuffer.readUInt16LE(2);
        sampleRate = fmtBuffer.readUInt32LE(4);
        bitsPerSample = fmtBuffer.readUInt16LE(14);
        if (audioFormat !== 1) {
          throw new Error("Unsupported WAV format: only PCM is supported.");
        }
      } else if (id === "data") {
        dataOffset = chunkStart;
        dataSize = size;
      }

      position = chunkStart + size + (size % 2);
      if (dataOffset && sampleRate) {
        break;
      }
    }

    if (!dataOffset || !dataSize || !sampleRate || !channels || !bitsPerSample) {
      throw new Error("Invalid WAV: missing fmt or data chunk.");
    }

    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = dataSize / (bytesPerSample * channels);
    const durationSec = totalSamples / sampleRate;

    return {
      sampleRate,
      channels,
      bitsPerSample,
      dataOffset,
      dataSize,
      durationSec
    };
  } finally {
    fs.closeSync(fd);
  }
};
