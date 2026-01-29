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

PHASE 1 — Audio Ingest & Conversion
Server
	•	Implement /api/upload
	•	Accept file uploads (multipart)
	•	Save original file
	•	Convert to WAV via FFmpeg
	•	Normalize sample rate / bit depth
	•	Return file reference
Client
	•	Upload UI
	•	Progress indicator
	•	Error handling for invalid formats

PHASE 2 — Audio Analysis
Analysis Service
	•	BPM detection
	•	Downbeat detection
	•	Bar grid generation
	•	Loop candidate generator
	•	Loop scoring heuristic
	•	Return top N candidates
Server
	•	/api/analyze
	•	Invoke analysis service
	•	Cache analysis results

PHASE 3 — Loop Selection UI
	•	Display waveform
	•	Overlay bar grid
	•	Highlight loop candidates
	•	Preview candidate playback
	•	Keyboard navigation between candidates
	•	Select active loop

PHASE 4 — Slicing Engine
Server / Shared
	•	Grid slicing (16 / 32 / 64 steps per bar)
	•	Transient detection
	•	Snap-to-grid logic
	•	Slice data structure
Client
	•	Slice visualization
	•	Toggle slice mode
	•	Preview slices

PHASE 5 — Pattern Engine (Core Value)
Data
	•	Pattern schema
	•	Step schema
	•	Choke group logic
Playback
	•	WebAudio scheduler
	•	Quantized transport
	•	Pattern switching at bar boundary
	•	Slice retrigger logic
UX
	•	Number-key pattern switching
	•	Visual pattern indicator
	•	Play / stop control

PHASE 6 — Preset Packs
	•	Early jungle patterns
	•	Roller patterns
	•	Half-time patterns
	•	Experimental grids

PHASE 7 — Export
Server
	•	Render engine
	•	Offline audio rendering
	•	WAV export
Client
	•	Export UI
	•	Download handling

PHASE 8 — YouTube Pipeline (Disabled)
	•	YouTube URL input
	•	URL validation
	•	Disclaimer confirmation
	•	Feature flag gate
	•	Stub import handler (no extraction enabled)


