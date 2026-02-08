# AmenGrid

Web-based audio tool that automatically finds loopable musical regions, slices them in classic tracker-style grids, and replays those slices using preset patterns that can be auditioned instantly via keyboard input.

## Features

- **Audio Ingest**: Upload audio files (WAV, MP3, AIFF, FLAC, MP4/MOV) or import from YouTube URLs
- **Automatic Analysis**: BPM detection, downbeat detection, and bar grid generation
- **Loop Selection**: Interactive waveform with bar-snapped loop selection (0.25, 0.5, 1, 2, 4, 8, 16 bars)
- **Grid-Quantized Slicing**: Beat grid-aligned slicing (8, 16, or 32 steps per bar) that snaps to BPM boundaries for clean loop starts
- **Pattern Playback**: 16 genre-based pattern packs (1,280 total patterns) with instant keyboard switching
- **Pattern Editing**: Interactive step editor to customize slice assignments
- **Export & Preview**: Download rendered loops and preview exported patterns with built-in playback
- **Gapless Playback**: Smooth pattern switching with automatic fade-out
- **Memory Management**: Automatic cleanup of audio resources to prevent memory leaks

## Requirements

- Node.js 18+ and npm
- FFmpeg installed and available on your PATH (`ffmpeg -version`)
- Optional: `yt-dlp` installed for YouTube ingest

## Local Development

```bash
export FFMPEG_PATH="$HOME/miniforge3/bin/ffmpeg"
# Optional: if yt-dlp is not on PATH
# export YT_DLP_PATH="/usr/local/bin/yt-dlp"
npm install
npm run dev
```

This starts:
- Web app: http://localhost:3000
- API server: http://localhost:4000

## Keyboard Controls

- **Number keys (1–8)**: Switch between main patterns
- **Shift + Number keys (1–8)**: Trigger fill patterns
- **Space**: Play / stop
- **Arrow keys**: Nudge loop start position
- **R key (hold)**: Repeat current slice
- **E key (hold)**: Reverse playback of current slice

## Pattern Packs

16 genre-based pattern packs are included, each with 8 main patterns and 8 fill patterns:

- DnB / Jungle — Classic tracker chops, back-jumps, retrigs
- House — Steady pump, loop-friendly repeats
- Trap — Sparse hits with aggressive hat rolls
- UK Garage / 2-Step — Skippy 2-step illusion
- Techno — Machine repetition, hypnotic loops
- Hip-Hop / Boom Bap — Laid-back repeats, head-nod pocket
- Breaks — Classic breakbeat rearrangements
- Dubstep — Half-time weight with aggressive stutters
- Liquid DnB — Smoother forward motion, gentle jumpbacks
- Neurofunk — Aggressive jumpbacks, tight stutters
- Hardcore / Rave — Break rush, brutal repeats
- Drill — Sliding pocket, sparse aggression
- Reggaeton / Dembow — Dembow pulse via repeated cells
- Footwork / Juke — Hyper jumpbacks, rapid 32nd jitters
- Funk / Disco — Bouncy syncopation illusion
- Ambient / Glitch — Minimal motion, gentle repeats

Patterns support 32nd-note retrigs for micro-timing variations.

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
- `POST /api/youtube`
  - JSON body: `{ "url": "https://www.youtube.com/watch?v=..." }`
  - Downloads best available audio using `yt-dlp`
  - Saves to `apps/server/storage/original/<id>.<ext>`
  - Converts to `apps/server/storage/converted/<id>.wav`
  - Returns JSON with original + converted references
  - Enforces guardrails: max duration (900s default), max size (100MB default)
- `POST /api/slice`
  - JSON body: `{ "id": "<uuid>", "startSec": number, "endSec": number, "bars": 0.25|0.5|1|2|4|8|16, "bpm": number, "beatsPerBar": 4, "subdivision": 8|16|32 }`
  - Optional: `bpm` and `beatsPerBar` enable grid-quantized slicing aligned to beat boundaries
  - Writes slice WAVs to `apps/server/storage/slices/<id>/<loopKey>/`
  - Writes pattern presets to `apps/server/storage/patterns/<id>-<loopKey>.json`
  - Returns JSON with slice count, slice start times, and pattern presets
- `GET /health`

## Notes

- **Max upload size**: 200MB
- **YouTube ingest**: Fully implemented with guardrails. Intended for local dev convenience; you must have rights to process the content.
  - `YOUTUBE_MAX_SECONDS` (default 900)
  - `YOUTUBE_MAX_MB` (default 100)
- **Audio Analysis**: Heuristic-based (energy envelope + autocorrelation) and does not modify the canonical WAV
- **Slicing**: Reads the canonical WAV and generates slices plus pattern presets without modifying the source file
- **Memory Management**: Automatic cleanup of finished audio sources and gain nodes prevents memory leaks during extended playback

## Implementation Status

**Completed Phases:**
- ✅ Phase 1: Audio Ingest & Conversion (including YouTube)
- ✅ Phase 2: Audio Analysis (BPM, downbeats, bar grid)
- ✅ Phase 3: Loop Selection UI
- ✅ Phase 4: Slicing Engine (with grid quantization)
- ✅ Phase 5: Pattern Engine (with memory leak fixes)
- ✅ Phase 6: Preset Pattern Packs (16 genres, 1,280 patterns)
- ✅ Phase 7: Export (render engine, WAV export, playback preview)
- ✅ Phase 8: YouTube Pipeline

**Status:** Feature-complete for MVP

For detailed documentation, see:
- [Product Requirements Document](docs/PRD.md)
- [TODO List](docs/TODO.md)
