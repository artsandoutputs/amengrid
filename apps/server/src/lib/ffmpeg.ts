import { spawn } from "node:child_process";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

export const buildFfmpegArgs = (inputPath: string, outputPath: string) => {
  return [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "44100",
    "-sample_fmt",
    "s16",
    "-c:a",
    "pcm_s16le",
    outputPath
  ];
};

export const runFfmpeg = (args: string[]) => {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: "inherit" });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
};
