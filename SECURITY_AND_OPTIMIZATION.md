# AmenGrid Security & Optimization Analysis

## SECURITY FINDINGS & RECOMMENDATIONS

### 🔴 CRITICAL ISSUES

#### 1. Missing CORS Configuration
**Status:** Missing but commented  
**Risk:** Vulnerable to CSRF and unauthorized cross-origin requests  
**Location:** `apps/server/src/index.ts:37`

```typescript
// Uncomment when serving cross-origin clients.
// app.use(cors({ origin: "http://localhost:3000" }));
```

**Recommendation:** Enable CORS with proper configuration:
```typescript
import cors from "cors";
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
```

#### 2. Path Traversal Vulnerability in File Resolution
**Risk:** High - Attackers could access files outside storage directory  
**Location:** `apps/server/src/lib/storage.ts` and multiple route files  
**Issue:** No validation that resolved paths stay within storage boundaries

**Recommendation:** Add path validation:
```typescript
export const validateStoragePath = (targetPath: string, baseDir: string): string => {
  const normalized = path.normalize(targetPath);
  const resolved = path.resolve(normalized);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base)) {
    throw new Error("Path traversal attempt detected");
  }
  return resolved;
};
```

#### 3. No Rate Limiting
**Risk:** API open to DoS attacks  
**Impact:** CPU-intensive operations (FFmpeg, analysis) can be exploited  
**Recommendation:** Add express-rate-limit:
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests"
});

app.use("/api/", limiter);
```

#### 4. Command Injection in FFmpeg & yt-dlp
**Risk:** Medium - Arguments passed to child processes  
**Location:** `apps/server/src/lib/ffmpeg.ts`, `apps/server/src/lib/youtube.ts`  
**Status:** Partially safe (using `spawn` instead of `exec`), but needs validation

**Recommendation:** Validate and sanitize all user inputs before passing to external processes:
```typescript
const validateId = (id: string): string => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid ID");
  return id;
};
```

#### 5. No Input Validation on Numbers
**Risk:** Medium - Unbounded numeric values in analysis  
**Location:** `apps/server/src/routes/slice.ts:44-50`  
**Issue:** BPM, beatsPerBar could be extremely large or negative

**Recommendation:** Add bounds checking:
```typescript
if (typeof bpm !== "number" || bpm < 20 || bpm > 300) {
  res.status(400).json({ error: "BPM must be between 20 and 300" });
  return;
}
if (typeof beatsPerBar !== "number" || beatsPerBar < 1 || beatsPerBar > 16) {
  res.status(400).json({ error: "beatsPerBar must be 1-16" });
  return;
}
```

### 🟡 MEDIUM ISSUES

#### 6. Verbose Error Messages
**Risk:** Information disclosure  
**Status:** Some stack traces leaked in error responses  
**Recommendation:** Sanitize error messages:
```typescript
const formatError = (err: unknown) => {
  if (process.env.NODE_ENV === "production") {
    return { error: "An error occurred" };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { error: message };
};
```

#### 7. No Content Security Policy (CSP)
**Risk:** XSS attacks on web frontend  
**Location:** Web server doesn't set CSP headers

**Recommendation:** Add helmet.js and CSP:
```bash
npm install helmet
```

```typescript
// In Next.js config or middleware
import { headers } from 'next/headers';
export async function middleware() {
  const requestHeaders = new Headers();
  requestHeaders.set('Content-Security-Policy', 
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self' data:"
  );
}
```

#### 8. No File Type Validation
**Risk:** Medium - Accepting files without proper MIME validation  
**Location:** `apps/server/src/index.ts:63-64`

**Recommendation:** Add magic number validation:
```typescript
import FileType from 'file-type';

const file = req.file;
const type = await FileType.fromBuffer(fs.readFileSync(file.path));
if (!['audio/mpeg', 'audio/wav', 'video/mp4'].includes(type?.mime || '')) {
  throw new Error("Invalid file type");
}
```

#### 9. No Request Size Limits (HTTP Body)
**Risk:** Memory exhaustion  
**Status:** Partial - JSON limit set, but multipart not limited  
**Fix:** Adjust multer limits:
```typescript
const upload = multer({
  storage,
  limits: { 
    fileSize: MAX_FILE_SIZE_BYTES,
    fields: 10,
    files: 1
  }
});
```

#### 10. Missing Authentication/Authorization
**Risk:** Anyone can access/delete any audio file  
**Recommendation:** 
- Add session management or JWT tokens
- Implement user isolation with database
- Add permission checks before file operations

---

## PERFORMANCE OPTIMIZATION RECOMMENDATIONS

### 1. **Audio Processing Caching** ✅ ALREADY DONE
- Analysis results cached in `storage/analysis/`
- Slices cached in `storage/slices/`
- Status: Good practice, consider adding TTL for cleanup

### 2. **Implement Audio Streaming**
**Benefit:** Reduce memory usage during large file transfers  
**Location:** Static file serving in `index.ts:34`

```typescript
app.get("/storage/:type/:id", (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.type, req.params.id);
  // Add Range header support for streaming
  res.sendFile(filePath, { acceptRanges: true });
});
```

### 3. **Worker Threads for CPU-Intensive Tasks**
**Benefit:** Prevent blocking main thread during analysis  
**Location:** Could offload analysis to worker threads

```typescript
import { Worker } from 'node:worker_threads';

const analyzeWithWorker = (wavPath: string) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./analyze-worker.ts');
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.postMessage({ wavPath });
  });
};
```

### 4. **Implement Storage Cleanup**
**Benefit:** Prevent disk fill from old files  

```typescript
const cleanupOldFiles = () => {
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  const now = Date.now();
  
  fs.readdirSync(CONVERTED_DIR).forEach(file => {
    const filePath = path.join(CONVERTED_DIR, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtime.getTime() > MAX_AGE) {
      fs.unlinkSync(filePath);
    }
  });
};

// Run daily
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);
```

### 5. **Compression for Static Assets**
**Benefit:** Reduce bandwidth  
**Location:** Web server

```bash
npm install compression
```

```typescript
import compression from 'compression';
app.use(compression());
```

### 6. **WebAudio Pooling in Frontend**
**Status:** Already implemented well in `apps/web/app/page.tsx`  
**Benefit:** Reusing audio nodes prevents memory leaks  
**Keep existing approach:** `exportPlaybackRef` pattern is good

### 7. **Database Instead of File-Based Storage**
**Current:** All analysis stored as JSON files  
**Improvement:** Use SQLite for better querying
```bash
npm install better-sqlite3
```

### 8. **Lazy Loading in Frontend**
**Status:** Next.js already handles code splitting  
**Could improve:** Pattern picker and waveform component lazy load

```typescript
const PatternPicker = dynamic(() => import('./PatternPicker'), { loading: () => <div>Loading...</div> });
```

---

## IMPLEMENTATION PRIORITY

### P0 (Critical - Do Immediately)
1. Enable CORS with environment variable
2. Add rate limiting to API
3. Add numeric bounds validation
4. Add path traversal protection

### P1 (High - Do This Week)
5. Add helmet.js for security headers
6. Implement file type validation
7. Add error message sanitization
8. Implement storage cleanup job

### P2 (Medium - Do This Month)
9. Add authentication/authorization
10. Worker threads for analysis
11. Stream responses for large files
12. Add database for metadata

### P3 (Nice to Have)
13. Implement compression
14. Add monitoring/logging
15. Database schema for better queries

---

## ENVIRONMENT VARIABLES TO ADD

```bash
# Security
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Limits
MAX_FILE_SIZE_BYTES=209715200  # 200MB
YOUTUBE_MAX_SECONDS=900
YOUTUBE_MAX_MB=100

# Cleanup
FILE_RETENTION_DAYS=7
CLEANUP_INTERVAL_HOURS=24
```

---

## Security Checklist

- [ ] CORS configured with environment variable
- [ ] Rate limiting implemented
- [ ] Path traversal validation added
- [ ] Input validation with bounds on all numeric fields
- [ ] File type validation (magic numbers)
- [ ] Error messages sanitized for production
- [ ] HTTP security headers (helmet.js)
- [ ] Storage cleanup job scheduled
- [ ] Request size limits configured
- [ ] Authentication/authorization (planned for v2)
- [ ] Logging and monitoring (planned for v2)
- [ ] Database for persistence (planned for v2)

