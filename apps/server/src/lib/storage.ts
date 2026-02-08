import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// Security: Path traversal prevention
export const validateStoragePath = (targetPath: string, baseDir: string): string => {
  const normalized = path.normalize(targetPath);
  const resolved = path.resolve(normalized);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error("Path traversal attempt detected");
  }
  return resolved;
};

export const STORAGE_DIR = path.resolve(process.cwd(), "storage");
export const ORIGINAL_DIR = path.join(STORAGE_DIR, "original");
export const CONVERTED_DIR = path.join(STORAGE_DIR, "converted");
export const ANALYSIS_DIR = path.join(STORAGE_DIR, "analysis");
export const SLICES_DIR = path.join(STORAGE_DIR, "slices");
export const PATTERNS_DIR = path.join(STORAGE_DIR, "patterns");

const MIME_EXTENSION_MAP: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/aiff": ".aiff",
  "audio/x-aiff": ".aiff",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov"
};

export const ensureStorageDirs = () => {
  for (const dir of [STORAGE_DIR, ORIGINAL_DIR, CONVERTED_DIR, ANALYSIS_DIR, SLICES_DIR, PATTERNS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const generateId = () => crypto.randomUUID();

export const resolveOriginalPath = (id: string, originalName: string, mime: string) => {
  const rawExt = path.extname(originalName).toLowerCase();
  const ext = rawExt || MIME_EXTENSION_MAP[mime] || ".bin";
  return path.join(ORIGINAL_DIR, `${id}${ext}`);
};

export const resolveConvertedPath = (id: string) => {
  return path.join(CONVERTED_DIR, `${id}.wav`);
};

export const resolveAnalysisPath = (id: string) => {
  return path.join(ANALYSIS_DIR, `${id}.json`);
};

export const resolveSlicesDir = (id: string, loopKey: string) => {
  return path.join(SLICES_DIR, id, loopKey);
};

export const resolvePatternsPath = (id: string, loopKey: string) => {
  return path.join(PATTERNS_DIR, `${id}-${loopKey}.json`);
};

export const toPublicPath = (filePath: string) => {
  const relative = path.relative(process.cwd(), filePath);
  return relative.split(path.sep).join("/");
};
