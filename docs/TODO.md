AmenGrid — TODO (Authoritative)
This is the single source of truth task list.Everything else (PRD, prompts, code) maps back to this.

PHASE 0 — Repo & Guardrails
Project setup
	•	Create monorepo (amengrid/)
	•	Initialize apps/web (Next.js)
	•	Initialize apps/server (Node + API)
	•	Initialize services/analysis (Python)
	•	Add /docs/PRD.md
	•	Add /docs/DISCLAIMER.md
Legal
	•	Add disclaimer modal component
	•	Block import actions until accepted
	•	Store acceptance flag locally

PHASE 1 — Audio Ingest & Conversion ✅ COMPLETE
Server
	•	✅ Implement /api/upload
	•	✅ Accept file uploads (multipart)
	•	✅ Save original file
	•	✅ Convert to WAV via FFmpeg
	•	✅ Normalize sample rate / bit depth
	•	✅ Return file reference
	•	✅ Implement /api/youtube (YouTube URL ingest)
Client
	•	✅ Upload UI
	•	✅ Progress indicator
	•	✅ Error handling for invalid formats
	•	✅ YouTube URL input with disclaimer

PHASE 2 — Audio Analysis ✅ COMPLETE
Analysis Service
	•	✅ BPM detection
	•	✅ Downbeat detection
	•	✅ Bar grid generation
	•	✅ Loop candidate generator
	•	✅ Loop scoring heuristic
	•	✅ Return top N candidates
Server
	•	✅ /api/analyze
	•	✅ Invoke analysis service
	•	✅ Cache analysis results

PHASE 3 — Loop Selection UI ✅ COMPLETE
	•	✅ Display waveform
	•	✅ Overlay bar grid
	•	✅ Highlight loop candidates
	•	✅ Preview candidate playback
	•	✅ Keyboard navigation between candidates
	•	✅ Select active loop
	•	✅ Loop length selection (0.25, 0.5, 1, 2, 4, 8, 16 bars)
	•	✅ Start bar position adjustment

PHASE 4 — Slicing Engine ✅ COMPLETE
Server / Shared
	•	✅ Grid slicing (8 / 16 / 32 steps per bar)
	•	✅ BPM-based grid quantization for beat-aligned slicing
	•	✅ Slice data structure
	•	✅ /api/slice endpoint with BPM parameters
Client
	•	✅ Slice visualization
	•	✅ Pattern step overlay with slice indicators
	•	✅ Visual slice highlighting during playback
	•	✅ Pattern step editing (adjust slice indices)

PHASE 5 — Pattern Engine (Core Value) ✅ COMPLETE
Data
	•	✅ Pattern schema (StepEvent with retrigs, gain)
	•	✅ Step schema
	•	✅ Fill offset resolution system
Playback
	•	✅ WebAudio scheduler with lookahead
	•	✅ Quantized transport
	•	✅ Pattern switching at bar boundary
	•	✅ Slice retrigger logic (32nd note subdivisions)
	•	✅ Gapless playback mode
	•	✅ Memory leak fixes (automatic source cleanup)
	•	✅ Tempo changes (queued at boundaries)
	•	✅ Loop length changes (queued at boundaries)
UX
	•	✅ Number-key pattern switching (1-8 for mains, Shift+1-8 for fills)
	•	✅ Visual pattern indicator
	•	✅ Play / stop control
	•	✅ Pattern pack selector
	•	✅ Custom pattern editing (per-step slice adjustment)
	•	✅ Repeat hold (R key)
	•	✅ Reverse hold (E key)

PHASE 6 — Preset Packs ✅ COMPLETE
	•	✅ 16 genre-based pattern packs implemented:
		- DnB / Jungle
		- House
		- Trap
		- UK Garage / 2-Step
		- Techno
		- Hip-Hop / Boom Bap
		- Breaks
		- Dubstep
		- Liquid DnB
		- Neurofunk
		- Hardcore / Rave
		- Drill
		- Reggaeton / Dembow
		- Footwork / Juke
		- Funk / Disco
		- Ambient / Glitch
	•	✅ Each pack: 8 main patterns + 8 fill patterns
	•	✅ Patterns support 32nd-note retrigs
	•	✅ Pattern descriptions and default tempos

PHASE 7 — Export ✅ COMPLETE
Server
	•	✅ Render engine
	•	✅ Offline audio rendering
	•	✅ WAV export
Client
	•	✅ Export UI
	•	✅ Download handling
	•	✅ Export playback preview with WebAudio API
	•	✅ Play/stop buttons for rendered patterns

PHASE 8 — YouTube Pipeline ✅ COMPLETE
	•	✅ YouTube URL input
	•	✅ URL validation
	•	✅ Disclaimer confirmation (required checkbox)
	•	✅ yt-dlp integration for audio extraction
	•	✅ Guardrails: max duration (900s), max size (100MB)
	•	✅ Full pipeline integration (download → convert → analyze)
	•	✅ Progress tracking during download
	•	✅ Error handling with user-friendly messages


