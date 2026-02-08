import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ORIGINAL_DIR } from "./storage.js";

const YT_DLP = process.env.YT_DLP_PATH || "yt-dlp";
const MAX_SECONDS = Number(process.env.YOUTUBE_MAX_SECONDS ?? "900");
const MAX_MB = Number(process.env.YOUTUBE_MAX_MB ?? "100");

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be"
]);

type YouTubeMetadata = {
  duration?: number;
  filesize?: number;
  filesize_approx?: number;
  ext?: string;
  title?: string;
};

export class YouTubeError extends Error {
  status: number;
  hint?: string;
  details?: unknown;

  constructor(message: string, status = 400, hint?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.hint = hint;
    this.details = details;
  }
}

const runYtDlp = (args: string[], captureOutput = false) => {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(YT_DLP, args, {
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    let stdout = "";
    let stderr = "";

    if (proc.stdout) {
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (proc.stderr) {
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    proc.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new YouTubeError(
            "yt-dlp is not installed.",
            500,
            "Install yt-dlp and make sure it is available on your PATH or set YT_DLP_PATH."
          )
        );
        return;
      }
      reject(error);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new YouTubeError("yt-dlp failed to fetch the YouTube audio.", 500, stderr.trim() || undefined));
    });
  });
};

export const validateYouTubeUrl = (rawUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new YouTubeError("Invalid URL.", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new YouTubeError("URL must be http or https.", 400);
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new YouTubeError("URL must be a YouTube link.", 400);
  }

  return parsed.toString();
};

export const fetchYouTubeMetadata = async (url: string) => {
  const output = await runYtDlp(
    ["--dump-single-json", "--skip-download", "--no-playlist", "--no-warnings", "-f", "bestaudio/best", url],
    true
  );
  if (!output) {
    return {};
  }
  try {
    return JSON.parse(output) as YouTubeMetadata;
  } catch {
    return {};
  }
};

const findDownloadedFile = (id: string) => {
  const files = fs.readdirSync(ORIGINAL_DIR);
  const matches = files
    .filter((name) => name.startsWith(`${id}.`))
    .map((name) => path.join(ORIGINAL_DIR, name));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  let newest = matches[0];
  let newestTime = fs.statSync(newest).mtimeMs;
  for (const filePath of matches.slice(1)) {
    const mtime = fs.statSync(filePath).mtimeMs;
    if (mtime > newestTime) {
      newest = filePath;
      newestTime = mtime;
    }
  }
  return newest;
};

export const downloadYouTubeAudio = async (url: string, id: string) => {
  const outputTemplate = path.join(ORIGINAL_DIR, `${id}.%(ext)s`);
  await runYtDlp(["-f", "bestaudio/best", "--no-playlist", "--no-warnings", "-o", outputTemplate, url]);
  const filePath = findDownloadedFile(id);
  if (!filePath) {
    throw new YouTubeError("Downloaded file not found.", 500);
  }
  return filePath;
};

export const guardYouTubeLimits = (meta: YouTubeMetadata) => {
  if (Number.isFinite(MAX_SECONDS) && meta.duration && meta.duration > MAX_SECONDS) {
    throw new YouTubeError(
      `Video is too long (${Math.round(meta.duration)}s).`,
      413,
      `Max duration is ${MAX_SECONDS}s.`
    );
  }

  const maxBytes = MAX_MB * 1024 * 1024;
  const knownSize = meta.filesize ?? meta.filesize_approx;
  if (Number.isFinite(maxBytes) && knownSize && knownSize > maxBytes) {
    throw new YouTubeError(
      `Video is too large (${Math.round(knownSize / (1024 * 1024))}MB).`,
      413,
      `Max size is ${MAX_MB}MB.`
    );
  }
};

export const enforceDownloadedSize = (filePath: string) => {
  const maxBytes = MAX_MB * 1024 * 1024;
  const stats = fs.statSync(filePath);
  if (Number.isFinite(maxBytes) && stats.size > maxBytes) {
    fs.unlinkSync(filePath);
    throw new YouTubeError(
      `Downloaded file exceeds ${MAX_MB}MB limit.`,
      413,
      "Try a shorter video or reduce YOUTUBE_MAX_MB."
    );
  }
  return stats.size;
};

export const inferMimeFromPath = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".m4a":
      return "audio/mp4";
    case ".webm":
      return "audio/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
};

