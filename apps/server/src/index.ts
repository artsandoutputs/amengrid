import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import { buildFfmpegArgs, runFfmpeg } from "./lib/ffmpeg.js";
import { isSupabaseConfigured, uploadFileToSupabase } from "./lib/remoteStorage.js";
import {
  ANALYSIS_DIR,
  CONVERTED_DIR,
  ensureStorageDirs,
  generateId,
  ORIGINAL_DIR,
  STORAGE_DIR,
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

// --- RENDER COMPATIBILITY UPDATES ---
// 1. Use dynamic PORT provided by Render, fallback to 3001 locally
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// 2. Configure CORS to allow your deployed frontend(s)
const DEFAULT_ORIGINS = ["http://localhost:3000"];
const configuredOrigins = (process.env.CORS_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);
const allowedOrigins = [...new Set([...DEFAULT_ORIGINS, ...configuredOrigins])];
const isVercelPreview = (origin: string) => /^https:\/\/.+\.vercel\.app$/i.test(origin);

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

ensureStorageDirs();

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true); // allow server-to-server requests that lack Origin
      return;
    }
    if (allowedOrigins.includes(origin) || isVercelPreview(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));
app.use("/storage", express.static(STORAGE_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ORIGINAL_DIR);
  },
  filename: (_req, file, cb) => {
    const id = generateId();
    const ext = path.extname(file.originalname) || ".bin";
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
});

app.post("/upload", upload.single("audio"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const id = path.parse(req.file.filename).name;
    const originalPath = req.file.path;
    const convertedPath = resolveConvertedPath(id);

    const args = buildFfmpegArgs(originalPath, convertedPath);
    await runFfmpeg(args);

    let originalPublicPath = toPublicPath(originalPath);
    let convertedPublicPath = toPublicPath(convertedPath);

    if (isSupabaseConfigured()) {
      const originalRemotePath = `original/${req.file.filename}`;
      const convertedRemotePath = `converted/${id}.wav`;
      originalPublicPath = await uploadFileToSupabase(
        originalPath,
        originalRemotePath,
        req.file.mimetype
      );
      convertedPublicPath = await uploadFileToSupabase(
        convertedPath,
        convertedRemotePath,
        "audio/wav"
      );
    }

    res.json({
      id,
      source: "upload",
      original: {
        path: originalPublicPath,
        mime: req.file.mimetype,
        size: req.file.size
      },
      converted: {
        path: convertedPublicPath,
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

app.post("/youtube", async (req, res, next) => {
  try {
    const { url } = req.body;
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
  console.error("Server Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 3. Bind to 0.0.0.0 as required by Render for public traffic
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
