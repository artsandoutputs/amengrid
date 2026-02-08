PRD — AmenGrid
1. Product Overview
Product Name: AmenGrid
Description:AmenGrid is a web-based audio tool that automatically finds loopable musical regions from user-provided audio, slices them in classic tracker-style grids, and replays those slices using preset early jungle / drum & bass patterns that can be auditioned instantly via keyboard input.
The product recreates the early Amiga / tracker workflow (rigid grids, slice rearrangement, pattern switching) while adding modern conveniences such as automatic loop detection and instant playback.

2. Goals & Objectives
Primary Goals
	•	Enable users to quickly extract clean 4, 8, or 16-bar loops from audio.
	•	Slice loops into grid-based segments suitable for tracker-style playback.
	•	Allow instant auditioning of preset jungle/DnB patterns using number keys.
	•	Maintain an authentic early jungle / tracker feel.
Secondary Goals
	•	Reduce friction between raw audio and usable patterns.
	•	Make loop discovery easier than manual trimming.
	•	Deliver immediate, musical results within one minute of upload.

3. Target Platform
	•	Primary: Web (desktop browsers)
	•	Future: Desktop wrapper (Electron or Tauri)
Mobile is not a target for MVP.

4. Legal Disclaimer & Content Restrictions
Before any import action, users must acknowledge the following:
Users may only upload or import audio content that they own or have the legal right to use.By using AmenGrid, the user confirms that all imported media complies with applicable copyright laws.
This disclaimer must be shown clearly for:
	•	File uploads
	•	YouTube URL input

5. Supported Audio Sources
MVP (Enabled)
	•	User-uploaded audio files:
	◦	WAV
	◦	MP3
	◦	AIFF
	◦	FLAC
	◦	MP4 / MOV (audio extracted)
	•	YouTube URL import
	◦	Enabled for local development convenience
	◦	Gated behind disclaimer confirmation
	◦	Modular pipeline (can be disabled per deployment)
	◦	Guardrails: max duration (900s default), max size (100MB default)

6. Audio Conversion
All imported media is converted server-side to a standardized internal format:
	•	WAV
	•	44.1kHz
	•	16-bit
	•	Mono (analysis)
	•	Stereo preserved for export where available
FFmpeg is used for all conversions.

7. Audio Analysis
Required Analysis Outputs
	•	BPM (float)
	•	Downbeat timestamps
	•	Bar grid
	•	Candidate loop regions
Loop Candidate Generation
	•	Candidate regions are generated on bar boundaries.
	•	Supported lengths: 4 bars, 8 bars, 16 bars.
	•	Each candidate is assigned a loopability score.
Loop Scoring Factors (MVP)
	•	Seam similarity (end-to-start compatibility)
	•	Transient density (presence of drums/percussion)
	•	Energy consistency across bars
	•	Phrase completeness
The top N candidates (e.g., 10) are presented to the user for selection.

8. Loop Selection
Users can:
	•	Preview loop candidates
	•	Cycle through candidates
	•	Select a candidate as the active loop
	•	Perform minor trim adjustments if needed
Only one active loop is required for MVP.

9. Slicing System
Slice Modes
	1.	Grid Slicing (Default)
	◦	Fixed steps per bar: 16, 32, or 64
	◦	Optional BPM-based quantization for beat grid alignment
	◦	Grid-quantized mode aligns slices to beat boundaries for clean loop starts
	2.	Transient Snap (Optional)
	◦	Onset detection
	◦	Snap to nearest grid position within tolerance
Slice Data
Each slice contains:
	•	Index
	•	Start time
	•	Duration
	•	BPM and bar alignment metadata (when quantized)
Slices are non-overlapping and ordered.

10. Pattern Engine
Pattern Philosophy
	•	Step-based sequencing
	•	No time-stretching
	•	Pitch changes affect playback length
	•	Choke behavior similar to tracker channels
Pattern Structure
	•	Patterns are grid-based and bar-aligned.
	•	Each pattern defines which slice plays on which step.
	•	Optional per-step modifiers:
	◦	Gain
	◦	Pitch
	◦	Retrig
	◦	Choke group
Preset Pattern Packs (Implemented)
	•	DnB / Jungle — Classic tracker chops, back-jumps, retrigs
	•	House — Steady pump, loop-friendly repeats
	•	Trap — Sparse hits with aggressive hat rolls
	•	UK Garage / 2-Step — Skippy 2-step illusion
	•	Techno — Machine repetition, hypnotic loops
	•	Hip-Hop / Boom Bap — Laid-back repeats, head-nod pocket
	•	Breaks — Classic breakbeat rearrangements
	•	Dubstep — Half-time weight with aggressive stutters
	•	Liquid DnB — Smoother forward motion, gentle jumpbacks
	•	Neurofunk — Aggressive jumpbacks, tight stutters
	•	Hardcore / Rave — Break rush, brutal repeats
	•	Drill — Sliding pocket, sparse aggression
	•	Reggaeton / Dembow — Dembow pulse via repeated cells
	•	Footwork / Juke — Hyper jumpbacks, rapid 32nd jitters
	•	Funk / Disco — Bouncy syncopation illusion
	•	Ambient / Glitch — Minimal motion, gentle repeats
Each pack includes 8 main patterns and 8 fill patterns. Patterns support 32nd-note retrigs for micro-timing variations.

11. Playback & Interaction
Playback Engine
	•	WebAudio-based
	•	Quantized scheduling with lookahead
	•	Pattern changes occur only on bar boundaries
	•	Gapless playback mode with automatic fade-out
	•	Automatic cleanup of finished audio sources to prevent memory leaks
	•	Support for tempo changes (queued at bar boundaries)
	•	Support for loop length changes (queued at bar boundaries)
Keyboard Controls
	•	Number keys (1–8): switch between main patterns
	•	Shift + Number keys (1–8): trigger fill patterns
	•	Space: play / stop
	•	Arrow keys: nudge loop start position
	•	R key (hold): repeat current slice
	•	E key (hold): reverse playback of current slice
Keyboard-first interaction is a core design requirement.

12. Export
Export Formats (MVP)
	•	Rendered WAV file
	•	Loop length selectable
	•	Optional normalization
	•	Playback preview with WebAudio API
	•	In-browser playback before download
Future exports (non-MVP):
	•	Stems
	•	MIDI slice triggers

13. User Interface & Themes
Design System
	•	Two themes: Default (light) and Dark (high contrast)
	•	Dark theme with improved contrast for waveform visibility
	•	Responsive layout for desktop browsers
	•	Keyboard-first interaction model
Keyboard Controls
	•	Space: Play/Stop
	•	1-8: Switch patterns (main patterns)
	•	Shift+1-8: Trigger fills
	•	Arrow keys: Nudge loop position
	•	R key (hold): Repeat current slice
	•	E key (hold): Reverse playback

14. Security & Validation
Input Validation
	•	BPM validation: 20-300 range
	•	beatsPerBar validation: 1-16 range
	•	UUID format validation for file IDs
	•	Path traversal protection in file resolution
CORS & Access Control
	•	CORS enabled with configurable origin
	•	File uploads limited to 200MB
	•	YouTube downloads limited to 900 seconds / 100MB
	•	Support for standard HTTP methods (GET, POST, OPTIONS)

13. YouTube Import Pipeline (Implemented)
Status
	•	Implemented and enabled for local development
	•	Modular design allows disabling per deployment
Behavior
	•	Accept YouTube URLs via POST /api/youtube
	•	Display ownership / rights disclaimer (required checkbox)
	•	Validate URL format
	•	Extract best available audio using yt-dlp
	•	Enforce guardrails: max duration (YOUTUBE_MAX_SECONDS, default 900s), max size (YOUTUBE_MAX_MB, default 100MB)
	•	Process through same conversion pipeline as file uploads
	•	Returns same response format as /api/upload
This pipeline is modular and can be disabled without affecting core functionality.

14. Architecture Overview
Frontend
	•	Web application (React / Next.js)
	•	WebAudio API for playback with automatic resource cleanup
	•	Keyboard event manager
	•	Waveform and grid visualization
	•	Pattern step overlay with interactive editing
	•	Real-time playback state management
Backend
	•	Node.js API
	•	FFmpeg for audio processing
	•	yt-dlp for YouTube audio extraction (optional)
	•	Heuristic audio analysis (BPM, downbeats, bar grid)
	•	Slice generation engine

15. Success Criteria
	•	✅ User can upload audio and audition jungle-style patterns within 60 seconds.
	•	✅ Loop detection produces musically usable results without manual alignment.
	•	✅ Pattern switching feels musical and quantized.
	•	✅ Output reflects authentic tracker-style rhythm and timing.

16. Recent Improvements & Fixes
	•	✅ Fixed critical memory leaks in audio playback (automatic cleanup of finished sources and gain nodes)
	•	✅ Fixed type safety issues with fill pattern bar offset calculation
	•	✅ Added error handling around audio operations to prevent scheduler crashes
	•	✅ Improved audio resource management with proper disconnect/disposal
	•	✅ Enhanced pattern system with 16 genre-based packs (1,280 total patterns)
	•	✅ Added support for 32nd-note retrigs for micro-timing variations
	•	✅ Implemented gapless playback mode with automatic fade-out
	•	✅ Added tempo and loop length queuing for smooth transitions
	•	✅ YouTube ingest fully implemented with guardrails

17. Out of Scope (MVP)
	•	Full DAW features
	•	Advanced synthesis
	•	Collaboration
	•	Social sharing
	•	Licensing enforcement beyond disclaimer
	•	Mobile UI optimization
	•	Real-time audio effects (reverb, delay, etc.)
	•	MIDI export (future consideration)


## System Architecture & Phases	

Phase 1: Audio Ingest Stack
	Purpose

	Phase 1 defines the Audio Ingest Stack, a foundational system responsible for accepting user-provided media and producing a canonical audio asset that all downstream phases depend on.

	This phase establishes a hard boundary in the system:
	all analysis, slicing, patterning, and playback features operate only on the outputs of this stack and never on raw user media.

	Scope

	Phase 1 includes:

	User-facing upload UI with legal disclaimer

	Server-side media validation and storage

	Media conversion and normalization into a canonical WAV format

	Stable ID-based asset referencing

	Phase 1 explicitly does not include:

	BPM detection or musical analysis (Phase 2)

	Loop detection or bar segmentation (Phase 2)

	Audio slicing or rearrangement (Phase 3)

	Pattern playback or performance controls (Phase 4)

	Export or sharing features (Phase 7)

	Inputs

	Supported input sources:

	Direct user uploads (audio or video files)

	YouTube imports via URL (behind legal disclaimer and explicit user confirmation of rights)

	Supported media types may include:

	Audio: MP3, WAV, AIFF, FLAC, M4A

	Video: MP4, MOV (audio track extracted)

	All inputs must pass validation before processing.

	Legal & Disclaimer Requirements

	Before upload or import, the user must explicitly confirm:

	They own the content or

	They have legal rights to use and process the content

	This confirmation is required per session and is enforced at the UI layer.

	Processing Guarantees (Canonical Output)

	Every successful ingest operation produces exactly one canonical audio asset with the following guarantees:

	Format: WAV

	Codec: PCM 16-bit (pcm_s16le)

	Sample Rate: 44.1 kHz

	Channels: Mono (1 channel)

	This canonical WAV is the only audio format used by Phases 2+.

	Storage Model

	Phase 1 defines a fixed storage layout:

	storage/original/<id>.<ext>
	Original uploaded or extracted media (unchanged)

	storage/converted/<id>.wav
	Canonical WAV produced by Phase 1

	Where <id> is a globally unique identifier (UUID) generated at ingest time.

	API Contract
	Upload Endpoint

	POST /api/upload

	Input

	multipart/form-data

	File field name: file

	Validation

	Maximum file size enforced (200MB)

	Empty or invalid files rejected

	Unsupported formats rejected

	Response

	{
	"id": "<uuid>",
	"original": {
		"path": "storage/original/<id>.<ext>",
		"mime": "<mime-type>",
		"size": <bytes>
	},
	"converted": {
		"path": "storage/converted/<id>.wav",
		"format": "wav",
		"sampleRate": 44100,
		"bitDepth": 16,
		"channels": 1
	}
	}

	YouTube Ingest Endpoint

	POST /api/youtube

	Input

	JSON body: { "url": "https://www.youtube.com/watch?v=..." }

	Validation

	URL format validation

	Duration limits (YOUTUBE_MAX_SECONDS, default 900s)

	File size limits (YOUTUBE_MAX_MB, default 100MB)

	Response

	Same format as /api/upload, with additional "source": "youtube" field

	This response constitutes the ingest contract for all downstream phases.

	Phase Boundary Rules

	All downstream phases (analysis, slicing, pattern playback, export) must reference audio assets by id.

	No downstream phase may:

	Accept raw media files

	Re-run format conversion

	Modify or replace the canonical WAV

	Any feature requiring audio input must first pass through Phase 1.

	Rationale

	Separating audio ingest into its own stack:

	Simplifies downstream feature development

	Ensures consistent audio quality and format

	Prevents duplicated conversion logic

	Enables future reuse (desktop app, batch processing, cloud scaling)

	Phase 1 is designed to be stable, minimal, and reusable, forming the backbone of the AmenGrid system.

	Completion Criteria

	Phase 1 is considered complete when:

	✅ Users can upload supported media

	✅ A canonical WAV is reliably produced

	✅ The ingest API returns a stable ID and metadata

	✅ Downstream phases can operate solely on the converted WAV using the ID

	✅ YouTube ingest implemented and functional

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

**Status:** MVP Complete - Feature-ready for production deployment

**Technical Improvements:**
- ✅ Fixed critical memory leaks in audio playback
- ✅ Improved audio resource management
- ✅ Enhanced error handling
- ✅ Type safety improvements
- ✅ Performance optimizations