# AmenGrid (Phase 1)

Audio ingest & conversion pipeline for AmenGrid.

## Requirements
- Node.js 18+ and npm
- FFmpeg installed and available on your PATH (`ffmpeg -version`)

## Local development
```bash
export FFMPEG_PATH="$HOME/miniforge3/bin/ffmpeg"
npm install
npm run dev
```

This starts:
- Web app: http://localhost:3000
- API server: http://localhost:4000

## API
- `POST /api/upload`
  - Multipart form field: `file`
  - Saves original to `apps/server/storage/original/<id>.<ext>`
  - Converts to `apps/server/storage/converted/<id>.wav`
  - Returns JSON with original + converted file references
- `POST /api/analyze`
  - JSON body: `{ "id": "<uuid>" }`
  - Analyzes the canonical WAV at `apps/server/storage/converted/<id>.wav`
  - Caches results in `apps/server/storage/analysis/<id>.json`
- `POST /api/slice`
  - JSON body: `{ "id": "<uuid>", "startSec": number, "bars": 1|2|4|8|16, "bpm": number, "beatsPerBar": 4, "stepsPerBar": 16 }`
  - Backward compatible: can also send `{ "id": "<uuid>", "loop": { "startSec": number, "endSec": number, "bars": 1|2|4|8|16 }, "subdivision": 16 }`
  - Writes slice WAVs to `apps/server/storage/slices/<id>/<loopKey>/`
  - Writes pattern presets to `apps/server/storage/patterns/<id>-<loopKey>.json`
- `GET /health`

## Notes
- Max upload size: 200MB
- The API expects FFmpeg to be installed locally.
- Phase 2 analysis is heuristic (energy envelope + autocorrelation) and does not modify the canonical WAV.
- Phase 3 slicing reads the canonical WAV and generates 16th-note slices plus pattern presets without modifying the source file.
- Loop selection now happens in the web UI via the full waveform loop picker (bar-snapped).
