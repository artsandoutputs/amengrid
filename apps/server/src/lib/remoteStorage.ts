import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "amengrid";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

export const isSupabaseConfigured = () => Boolean(supabase);

export const uploadFileToSupabase = async (
  localPath: string,
  remotePath: string,
  contentType?: string
) => {
  if (!supabase) {
    throw new Error("Supabase storage not configured");
  }
  const data = fs.readFileSync(localPath);
  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(remotePath, data, {
      upsert: true,
      contentType
    });
  if (error) {
    throw error;
  }
  const { data: publicData } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(remotePath);
  return publicData.publicUrl;
};

export const downloadToFile = async (url: string, destPath: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buffer);
};
