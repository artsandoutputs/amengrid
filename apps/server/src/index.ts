import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import { buildFfmpegArgs, runFfmpeg } from "./lib/ffmpeg.js";
import {
  ensureStorageDirs,
  generateId,
  resolveConvertedPath,
  resolveOriginalPath,
  toPublicPath
} from "./lib/storage.js";
import {
  YouTubeError,
  downloadYouTubeAudio,
  enforceDownloadedSize,
  fetchYouTubeMetadata,
  guardYouTubeLimits,
  inferMimeFromPath,
  validateYouTubeUrl
} from "./lib/youtube.js";
import { registerAnalyzeRoutes } from "./routes/analyze.js";
import { registerSliceRoutes } from "./routes/slice.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

ensureStorageDirs();

const app = express();

// Security: CORS configuration
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));
app.use("/storage", express.static(path.resolve(process.cwd(), "storage")));

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, path.resolve(process.cwd(), "storage", "original"));
  },
  filename: (req, file, cb) => {
    const id = generateId();
    const originalPath = resolveOriginalPath(id, file.originalname, file.mimetype);
    req.uploadId = id;
    req.uploadOriginalPath = originalPath;
    cb(null, path.basename(originalPath));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/upload", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    if (req.file.size === 0) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Empty file upload." });
      return;
    }

    const id = req.uploadId ?? generateId();
    const originalPath = req.uploadOriginalPath ?? req.file.path;
    const convertedPath = resolveConvertedPath(id);

    const args = buildFfmpegArgs(originalPath, convertedPath);
    await runFfmpeg(args);

    res.json({
      id,
      original: {
        path: toPublicPath(originalPath),
        mime: req.file.mimetype,
        size: req.file.size
      },
      converted: {
        path: toPublicPath(convertedPath),
        format: "wav",
        sampleRate: 44100,
        bitDepth: 16,
        channels: 1
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/youtube", async (req, res, next) => {
  try {
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url) {
      res.status(400).json({ error: "Missing YouTube URL." });
      return;
    }

    const normalized = validateYouTubeUrl(url);
    const metadata = await fetchYouTubeMetadata(normalized);
    guardYouTubeLimits(metadata);

    const id = generateId();
    const originalPath = await downloadYouTubeAudio(normalized, id);
    const size = enforceDownloadedSize(originalPath);
    const convertedPath = resolveConvertedPath(id);

    const args = buildFfmpegArgs(originalPath, convertedPath);
    await runFfmpeg(args);

    res.json({
      id,
      source: "youtube",
      original: {
        path: toPublicPath(originalPath),
        mime: inferMimeFromPath(originalPath),
        size
      },
      converted: {
        path: toPublicPath(convertedPath),
        format: "wav",
        sampleRate: 44100,
        bitDepth: 16,
        channels: 1
      }
    });
  } catch (error) {
    if (error instanceof YouTubeError) {
      res.status(error.status).json({ error: error.message, hint: error.hint, details: error.details });
      return;
    }
    next(error);
  }
});

registerAnalyzeRoutes(app);
registerSliceRoutes(app);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large. Max 200MB." });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`AmenGrid server listening on http://localhost:${PORT}`);
});
