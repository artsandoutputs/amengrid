import fs from "node:fs";
import type { Express, Request, Response, NextFunction } from "express";
import { analyzeWav } from "../lib/analyze.js";
import { readAnalysisCache, writeAnalysisCache } from "../lib/cache.js";
import { resolveConvertedPath } from "../lib/storage.js";
import { downloadToFile } from "../lib/remoteStorage.js";

const isValidId = (id: string) => /^[a-f0-9-]{16,}$/i.test(id);
const ANALYSIS_VERSION = 2;

export const registerAnalyzeRoutes = (app: Express) => {
  app.post(["/api/analyze", "/analyze"], async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.body?.id ?? req.body?.uploadId;
      const convertedUrl = req.body?.convertedUrl ?? req.body?.convertedPath;
      if (!id || typeof id !== "string" || !isValidId(id)) {
        res.status(400).json({ error: "Invalid or missing id." });
        return;
      }

      const wavPath = resolveConvertedPath(id);
      if (!fs.existsSync(wavPath)) {
        if (convertedUrl && typeof convertedUrl === "string" && /^https?:\/\//i.test(convertedUrl)) {
          await downloadToFile(convertedUrl, wavPath);
        } else {
          res.status(404).json({ error: "Converted WAV not found." });
          return;
        }
      }

      const cached = readAnalysisCache<{
        id: string;
        analysisVersion?: number;
        analysis: ReturnType<typeof analyzeWav>;
      }>(id);
      if (cached && cached.analysisVersion === ANALYSIS_VERSION) {
        res.json(cached);
        return;
      }

      const analysis = analyzeWav(wavPath);
      const payload = { id, analysisVersion: ANALYSIS_VERSION, analysis };
      writeAnalysisCache(id, payload);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });
};
