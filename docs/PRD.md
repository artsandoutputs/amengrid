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
Planned (Feature-Flagged)
	•	YouTube URL import
	◦	Disabled by default
	◦	Gated behind disclaimer confirmation
	◦	Modular pipeline so it can be enabled/disabled per deployment

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
	2.	Transient Snap (Optional)
	◦	Onset detection
	◦	Snap to nearest grid position within tolerance
Slice Data
Each slice contains:
	•	Index
	•	Start time
	•	Duration
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
Preset Patterns (MVP)
	•	Early jungle / Amen-style patterns
	•	Rollers
	•	Minimal half-time patterns
	•	Experimental grid variations

11. Playback & Interaction
Playback Engine
	•	WebAudio-based
	•	Quantized scheduling
	•	Pattern changes occur only on bar boundaries
Keyboard Controls
	•	Number keys (1–9): switch between patterns
	•	Space: play / stop
	•	Arrow keys: cycle loop candidates
	•	Toggle slicing mode via keyboard shortcut
Keyboard-first interaction is a core design requirement.

12. Export
Export Formats (MVP)
	•	Rendered WAV file
	•	Loop length selectable
	•	Optional normalization
Future exports (non-MVP):
	•	Stems
	•	MIDI slice triggers

13. YouTube Import Pipeline (Planned)
Status
	•	Feature-flagged
	•	Disabled by default
Behavior
	•	Accept YouTube URLs
	•	Display ownership / rights disclaimer
	•	Validate URL
	•	Pipeline can extract audio only if feature is enabled
This pipeline must be modular and removable without affecting core functionality.

14. Architecture Overview
Frontend
	•	Web application (React / Next.js)
	•	WebAudio API for playback
	•	Keyboard event manager
	•	Waveform and grid visualization
Backend
	•	Node.js API
	•	FFmpeg for audio processing
	•	Optional Python microservice for audio analysis

15. Success Criteria
	•	User can upload audio and audition jungle-style patterns within 60 seconds.
	•	Loop detection produces musically usable results without manual alignment.
	•	Pattern switching feels musical and quantized.
	•	Output reflects authentic tracker-style rhythm and timing.

16. Out of Scope (MVP)
	•	Full DAW features
	•	Advanced synthesis
	•	Collaboration
	•	Social sharing
	•	Licensing enforcement beyond disclaimer
	•	Mobile UI optimization


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

	BPM detection or musical analysis

	Loop detection or bar segmentation

	Audio slicing or rearrangement

	Pattern playback or performance controls

	Export or sharing features

	Inputs

	Supported input sources:

	Direct user uploads (audio or video files)

	(Planned) YouTube imports via URL (behind legal disclaimer and explicit user confirmation of rights)

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

	Maximum file size enforced

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

	Users can upload supported media

	A canonical WAV is reliably produced

	The ingest API returns a stable ID and metadata

	Downstream phases can operate solely on the converted WAV using the ID