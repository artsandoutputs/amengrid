import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response, NextFunction } from "express";
import { resolveConvertedPath, resolveSlicesDir, resolvePatternsPath } from "../lib/storage.js";
import { sliceLoopToWavs } from "../lib/slicing.js";
import { buildPatterns } from "../lib/patterns.js";

const isValidId = (id: string) => /^[a-f0-9-]{16,}$/i.test(id);

const makeLoopKey = (startSec: number, endSec: number, bars: number, subdivision: number) => {
  const start = startSec.toFixed(3).replace(/\./g, "p");
  const end = endSec.toFixed(3).replace(/\./g, "p");
  return `${bars}b_${subdivision}s_${start}_${end}`;
};

export const registerSliceRoutes = (app: Express) => {
  app.post("/api/slice", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body ?? {};
      const { id, loop } = body;
      if (!id || typeof id !== "string" || !isValidId(id)) {
        res.status(400).json({ error: "Invalid or missing id." });
        return;
      }
      const allowedBars = [0.25, 0.5, 1, 2, 4, 8, 16];

      let resolvedLoop = loop as { startSec: number; endSec: number; bars: number } | null;
      let subdivision = body.subdivision as number | undefined;

      if (!resolvedLoop) {
        const { startSec, bars, bpm, beatsPerBar, stepsPerBar } = body;
        if (typeof startSec !== "number") {
          res.status(400).json({ error: "Missing startSec." });
          return;
        }
        if (!allowedBars.includes(bars)) {
          res.status(400).json({ error: "Bars must be 1/4, 1/2, 1, 2, 4, 8, or 16." });
          return;
        }
        if (typeof bpm !== "number" || bpm <= 0) {
          res.status(400).json({ error: "Missing or invalid bpm." });
          return;
        }
        if (typeof beatsPerBar !== "number" || beatsPerBar <= 0) {
          res.status(400).json({ error: "Missing or invalid beatsPerBar." });
          return;
        }
        if (typeof stepsPerBar !== "number" || stepsPerBar <= 0) {
          res.status(400).json({ error: "Missing or invalid stepsPerBar." });
          return;
        }

        const barDuration = (60 / bpm) * beatsPerBar;
        const endSec = startSec + bars * barDuration;
        resolvedLoop = { startSec, endSec, bars };
        subdivision = stepsPerBar;
      }

      if (!resolvedLoop || typeof resolvedLoop !== "object") {
        res.status(400).json({ error: "Missing loop selection." });
        return;
      }
      if (!allowedBars.includes(resolvedLoop.bars)) {
        res.status(400).json({ error: "Loop bars must be 1/4, 1/2, 1, 2, 4, 8, or 16." });
        return;
      }
      if (typeof resolvedLoop.startSec !== "number" || typeof resolvedLoop.endSec !== "number") {
        res.status(400).json({ error: "Loop startSec/endSec must be numbers." });
        return;
      }
      if (resolvedLoop.endSec <= resolvedLoop.startSec) {
        res.status(400).json({ error: "Loop endSec must be greater than startSec." });
        return;
      }
      if (subdivision !== 16) {
        res.status(400).json({ error: "Only stepsPerBar/subdivision 16 is supported." });
        return;
      }

      const wavPath = resolveConvertedPath(id);
      if (!fs.existsSync(wavPath)) {
        res.status(404).json({ error: "Converted WAV not found." });
        return;
      }

      const loopKey = makeLoopKey(resolvedLoop.startSec, resolvedLoop.endSec, resolvedLoop.bars, subdivision);
      const outputDir = resolveSlicesDir(id, loopKey);
      const patternsPath = resolvePatternsPath(id, loopKey);

      const sliceResult = sliceLoopToWavs(wavPath, resolvedLoop, subdivision, outputDir);
      const patterns = buildPatterns(sliceResult.count, resolvedLoop, subdivision);
      fs.mkdirSync(path.dirname(patternsPath), { recursive: true });
      fs.writeFileSync(patternsPath, JSON.stringify(patterns, null, 2), "utf-8");

      res.json({
        id,
        loop: resolvedLoop,
        slices: {
          count: sliceResult.count,
          sliceStartsSec: sliceResult.sliceStartsSec,
          dir: `storage/slices/${id}/${loopKey}/`,
          files: sliceResult.files.map((file) => `storage/slices/${id}/${loopKey}/${file}`)
        },
        patterns
      });
    } catch (error) {
      next(error);
    }
  });
};
