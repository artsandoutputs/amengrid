import "express";

declare module "express-serve-static-core" {
  interface Request {
    uploadId?: string;
    uploadOriginalPath?: string;
  }
}
