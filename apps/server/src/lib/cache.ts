import fs from "node:fs";
import { resolveAnalysisPath } from "./storage.js";

export const readAnalysisCache = <T>(id: string): T | null => {
  const cachePath = resolveAnalysisPath(id);
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  const raw = fs.readFileSync(cachePath, "utf-8");
  return JSON.parse(raw) as T;
};

export const writeAnalysisCache = (id: string, payload: unknown) => {
  const cachePath = resolveAnalysisPath(id);
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), "utf-8");
};
