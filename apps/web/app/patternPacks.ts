// AmenGrid Pattern Packs — Phase 4+
//
// Assumes:
// - loop = 2 bars
// - 16th grid => 32 steps (0..31)
// - fills are 1 bar => 16 steps (offsets 0..15)
// - StepEvent supports micro re-trigs (32nds) without changing step length.
//
// Runtime model suggestion:
// - Mains: StepEvent[] length 32
// - Fills: StepEvent[] length 16 (offsets)
// - When applying a fill on barStart (0 or 16), convert offsets -> absolute by adding barStart.

export type Retrig = 2 | 3 | 4 | 6 | 8;

export type StepEvent =
  | number
  | {
      i: number; // slice index 0..31 (absolute for mains, offset for fills)
      r: Retrig; // number of sub-hits inside the step (usually 2 or 4 for 32nds)
      g?: number; // optional gain scalar (0..1)
    }
  | null; // rest (silence) if you ever allow it

export type Pattern = {
  id: string;
  name: string;
  description?: string;
  steps: StepEvent[]; // 32 for mains OR 16 offsets for fills
};

export type PatternPack = {
  id: string;
  name: string;
  vibe: string;
  defaultTempoBpm?: number;
  stepGrid: "16ths";
  allowRetrig32nds: true;
  mains: Pattern[]; // exactly 8
  fills: Pattern[]; // exactly 8 (1 bar offsets)
};

// ---------- helpers ----------
const r = (i: number, rr: Retrig, g?: number): StepEvent => ({ i, r: rr, g });
const clamp32 = (n: number) => Math.max(0, Math.min(31, n));
const A = (...xs: StepEvent[]) => xs;

export const ROLE_BASE = 1000;
export const ROLE_KICK = ROLE_BASE;
export const ROLE_SNARE = ROLE_BASE + 1;
export const ROLE_HAT = ROLE_BASE + 2;
export const ROLE_GHOST = ROLE_BASE + 3;

const STRAIGHT_32: StepEvent[] = Array.from({ length: 32 }, (_, i) => i);

const repeatCell = (cell: StepEvent[], times: number) => {
  const out: StepEvent[] = [];
  for (let t = 0; t < times; t++) out.push(...cell);
  return out;
};

const off = (n: number) => Math.max(0, Math.min(15, n));

// Fill helper: repeat a 16-step offset cell N times then cut to 16
const repeatFillCell = (cell: StepEvent[], times: number) => {
  const out: StepEvent[] = [];
  for (let t = 0; t < times; t++) out.push(...cell);
  return out.slice(0, 16);
};

type BarHits = {
  kicks?: number[];
  snares?: number[];
  hats?: number[];
  ghosts?: number[];
  hatRetrig?: Retrig;
  ghostGain?: number;
  extras?: Array<{ step: number; slice?: number; retrig?: Retrig; gain?: number }>;
};

const makeEvent = (slice: number, opts?: { retrig?: Retrig; gain?: number }): StepEvent => {
  const gain = opts?.gain;
  if (opts?.retrig) return r(slice, opts.retrig, gain);
  if (gain != null && gain !== 1) return { i: slice, r: 2, g: gain };
  return slice;
};

const makeBar = (hits: BarHits, offset = 0, useBase = true): StepEvent[] => {
  const bar: StepEvent[] = useBase
    ? Array.from({ length: 16 }, (_, i) => i + offset)
    : Array.from({ length: 16 }, () => null);
  const roleSlice = {
    kick: ROLE_KICK,
    snare: ROLE_SNARE,
    hat: ROLE_HAT,
    ghost: ROLE_GHOST
  };
  const add = (steps: number[] | undefined, slice: number, opts?: { retrig?: Retrig; gain?: number }) => {
    if (!steps) return;
    for (const step of steps) {
      bar[off(step)] = makeEvent(slice, opts);
    }
  };
  add(hits.hats, roleSlice.hat, hits.hatRetrig ? { retrig: hits.hatRetrig } : undefined);
  add(hits.ghosts, roleSlice.ghost, { gain: hits.ghostGain ?? 0.45 });
  add(hits.kicks, roleSlice.kick);
  add(hits.snares, roleSlice.snare);
  if (hits.extras) {
    for (const extra of hits.extras) {
      const slice = extra.slice ?? offset + extra.step;
      bar[off(extra.step)] = makeEvent(slice, { retrig: extra.retrig, gain: extra.gain });
    }
  }
  return bar;
};

const makePattern = (bar1: BarHits, bar2?: BarHits): StepEvent[] => [
  ...makeBar(bar1, 0, true),
  ...makeBar(bar2 ?? bar1, 16, true)
];

const makeChopPattern = (bar1: BarHits, bar2?: BarHits): StepEvent[] => [
  ...makeBar(bar1, 0, true),
  ...makeBar(bar2 ?? bar1, 16, false)
];

const makeFill = (bar: BarHits): StepEvent[] => makeBar(bar, 0, false);

// ---------- DnB / Jungle ----------
const DNB_JUNGLE: PatternPack = {
  id: "dnb_jungle",
  name: "DnB / Jungle",
  vibe: "Tracker chops, back-jumps, retrigs, and amen momentum.",
  defaultTempoBpm: 170,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    {
      id: "dnb_amen_core",
      name: "Amen Core",
      description: "Amen break backbone (classic 1-2 bars).",
      steps: makeChopPattern(
        {
          kicks: [0, 2, 10, 11],
          snares: [4, 7, 9, 12, 15],
          hats: [0, 2, 4, 6, 8, 10, 12, 14]
        }
      )
    },
    {
      id: "dnb_amen_variant",
      name: "Amen Variant",
      description: "Amen bar-3 variation.",
      steps: makeChopPattern(
        {
          kicks: [0, 2, 10, 11],
          snares: [4, 7, 9, 12, 15],
          hats: [0, 2, 4, 6, 8, 10, 12, 14]
        },
        {
          kicks: [0, 2, 10],
          snares: [4, 7, 9, 14],
          hats: [0, 2, 4, 6, 8, 10, 12, 14]
        }
      )
    },
    {
      id: "dnb_two_step",
      name: "Two-Step Roller",
      description: "Kick on 1 and 3&, snares on 2 and 4.",
      steps: makeChopPattern(
        { kicks: [0, 10], snares: [4, 12], hats: [0, 2, 4, 6, 8, 9, 10, 12, 14], ghosts: [7, 15] }
      )
    },
    {
      id: "dnb_steppers",
      name: "Steppers",
      description: "Four-on-floor DnB drive.",
      steps: makeChopPattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] }
      )
    },
    {
      id: "dnb_skank",
      name: "Skank Ride",
      description: "Skanking hats with pushy kicks.",
      steps: makeChopPattern(
        { kicks: [0, 7, 8, 10], snares: [4, 12], hats: [1, 3, 5, 7, 9, 11, 13, 15], ghosts: [2, 6, 10, 14] }
      )
    },
    {
      id: "dnb_halftime",
      name: "Half-Time Stomp",
      description: "Half-time weight with a heavy backbeat.",
      steps: makeChopPattern(
        { kicks: [0, 8], snares: [12], hats: [2, 10, 14], ghosts: [7, 15] }
      )
    },
    {
      id: "dnb_hat_roll",
      name: "Hat Roll",
      description: "Rolling hats with steady kicks.",
      steps: makeChopPattern(
        { kicks: [0, 6, 8, 10], snares: [4, 12], hats: [2, 6, 10, 14], hatRetrig: 2 }
      )
    },
    {
      id: "dnb_reload",
      name: "Reload Push",
      description: "Late-bar push and retrig.",
      steps: makeChopPattern(
        { kicks: [0, 7, 8, 10], snares: [4, 12], hats: [2, 6, 10, 14], extras: [{ step: 15, retrig: 4 }] },
        { kicks: [0, 7, 8, 14], snares: [4, 12], hats: [2, 6, 10, 14], extras: [{ step: 15, retrig: 4 }] }
      )
    }
  ],
  fills: [
    {
      id: "dnb_snare_rush",
      name: "Snare Rush (32nds)",
      description: "Fast 32nd chatter across the snare zone (offsets).",
      steps: makeFill({
        snares: [8, 9, 10, 11, 12, 13, 14, 15],
        extras: [{ step: 12, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "dnb_hat_stutter",
      name: "Hat Stutter Grid",
      description: "Alternating retrig hats (offsets).",
      steps: makeFill({
        hats: [0, 2, 4, 6, 8, 10, 12, 14],
        extras: [
          { step: 1, retrig: 2 },
          { step: 3, retrig: 2 },
          { step: 5, retrig: 2 },
          { step: 7, retrig: 2 },
          { step: 9, retrig: 2 },
          { step: 11, retrig: 2 },
          { step: 13, retrig: 2 },
          { step: 15, retrig: 2 }
        ]
      })
    },
    {
      id: "dnb_backspin_quarter",
      name: "Backspin Quarter",
      description: "Rewind blocks (offsets).",
      steps: makeFill({
        kicks: [12, 13, 14, 15],
        ghosts: [8, 9, 10, 11],
        ghostGain: 0.6
      })
    },
    {
      id: "dnb_roll_last4",
      name: "Roll Last Beat",
      description: "Escalating retrigs into last beat (offsets).",
      steps: makeFill({
        hats: [0, 2, 4, 6, 8, 10],
        extras: [
          { step: 12, retrig: 2 },
          { step: 13, retrig: 2 },
          { step: 14, retrig: 2 },
          { step: 15, retrig: 4 }
        ]
      })
    },
    {
      id: "dnb_tumble",
      name: "Tumble",
      description: "Retrig groupings (offsets).",
      steps: makeFill({
        kicks: [8, 10, 12, 14],
        extras: [{ step: 8, retrig: 2 }, { step: 12, retrig: 2 }, { step: 15, retrig: 2 }]
      })
    },
    {
      id: "dnb_stop_hit",
      name: "Stop Hit",
      description: "Air-feel then slam (offsets).",
      steps: makeFill({
        snares: [12],
        extras: [{ step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "dnb_micro_tail",
      name: "Micro Tail",
      description: "Tail chatter into the last beat (offsets).",
      steps: makeFill({
        hats: [8, 9, 10, 11],
        extras: [
          { step: 12, retrig: 2 },
          { step: 13, retrig: 2 },
          { step: 14, retrig: 2 },
          { step: 15, retrig: 4 }
        ]
      })
    },
    {
      id: "dnb_reverse_jump",
      name: "Reverse Jump",
      description: "Tail to mid jumps (offsets).",
      steps: makeFill({
        kicks: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4],
        ghostGain: 0.6
      })
    }
  ]
};

// ---------- House ----------
const HOUSE: PatternPack = {
  id: "house",
  name: "House",
  vibe: "Steady pump, loop-friendly repeats, minimal but driving reshuffles.",
  defaultTempoBpm: 128,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    {
      id: "house_fourfloor",
      name: "Four On Floor",
      description: "Classic 4/4 kick with clap on 2 and 4.",
      steps: makePattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [2, 6, 10, 14], ghosts: [7, 15] }
      )
    },
    {
      id: "house_jack",
      name: "Jacking Pump",
      description: "Jacking hats with steady kick.",
      steps: makePattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [1, 3, 5, 7, 9, 11, 13, 15] }
      )
    },
    {
      id: "house_shuffle",
      name: "Shuffle Swing",
      description: "Tight shuffle on hats.",
      steps: makePattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [2, 5, 6, 9, 10, 13, 14], ghosts: [3, 7, 11, 15] }
      )
    },
    {
      id: "house_filter_bounce",
      name: "Filter Bounce",
      description: "Filter-house bounce with late lift.",
      steps: makePattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [2, 6, 10, 14], ghosts: [5, 13], extras: [{ step: 15, retrig: 2 }] }
      )
    },
    {
      id: "house_clap_room",
      name: "Clap Room",
      description: "Clap-heavy groove with small kick pickup.",
      steps: makePattern(
        { kicks: [0, 8, 12], snares: [4, 12], hats: [2, 6, 10, 14], ghosts: [7, 15] }
      )
    },
    {
      id: "house_piano_stab",
      name: "Piano Stabs",
      description: "Stab-like accents in the pocket.",
      steps: makePattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [2, 6, 10, 14], extras: [{ step: 11, retrig: 2 }] }
      )
    },
    {
      id: "house_dropback",
      name: "Dropback Hook",
      description: "Kick dropback mid-bar for hook.",
      steps: makePattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [2, 6, 10, 14], ghosts: [3, 15], extras: [{ step: 8, retrig: 2 }] }
      )
    },
    {
      id: "house_build_lift",
      name: "Build Lift",
      description: "End-of-bar lift with quick hats.",
      steps: makePattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [2, 6, 10, 14], extras: [{ step: 15, retrig: 4 }] }
      )
    }
  ],
  fills: [
    {
      id: "house_clap_roll",
      name: "Clap Roll",
      description: "Clap roll into the downbeat (offsets).",
      steps: makeFill({
        snares: [8, 10, 12, 14],
        extras: [{ step: 15, retrig: 4 }]
      })
    },
    {
      id: "house_hat_build",
      name: "Hat Build",
      description: "Rising hats (offsets).",
      steps: makeFill({
        hats: [0, 2, 4, 6, 8, 10, 12, 14],
        extras: [{ step: 12, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "house_snare_rush",
      name: "Snare Rush",
      description: "Snare rush (offsets).",
      steps: makeFill({
        snares: [12, 13, 14, 15],
        extras: [{ step: 12, retrig: 2 }, { step: 13, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "house_kick_drop",
      name: "Kick Drop",
      description: "Heavy kick drop (offsets).",
      steps: makeFill({
        kicks: [0, 4, 8, 12],
        extras: [{ step: 12, retrig: 2 }]
      })
    },
    {
      id: "house_gate_flicker",
      name: "Gate Flicker",
      description: "Gatey flicker (offsets).",
      steps: makeFill({
        hats: [0, 1, 2, 3, 4, 5, 6, 7],
        ghostGain: 0.5
      })
    },
    {
      id: "house_backspin",
      name: "Backspin",
      description: "Backspin feel (offsets).",
      steps: makeFill({
        kicks: [15, 14, 13, 12, 11, 10, 9, 8],
        ghostGain: 0.6
      })
    },
    {
      id: "house_turnaround",
      name: "Turnaround",
      description: "Turnaround phrase (offsets).",
      steps: makeFill({
        kicks: [8, 10, 12, 14],
        hats: [9, 11, 13, 15]
      })
    },
    {
      id: "house_slam",
      name: "Slam Hit",
      description: "Hard hit (offsets).",
      steps: makeFill({
        snares: [12],
        extras: [{ step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    }
]
};

// ---------- Trap ----------
const TRAP: PatternPack = {
  id: "trap",
  name: "Trap",
  vibe: "Sparse hits + aggressive hat rolls; micro retrigs carry the groove.",
  defaultTempoBpm: 140,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    {
      id: "trap_half_time",
      name: "Half-Time Core",
      description: "Kick on 1, snare on 3, sparse hats.",
      steps: makePattern(
        { kicks: [0, 7], snares: [12], hats: [2, 6, 10, 14], ghosts: [3, 15] }
      )
    },
    {
      id: "trap_808_bounce",
      name: "808 Bounce",
      description: "Bouncy 808 kicks with sparse snare.",
      steps: makePattern(
        { kicks: [0, 3, 8, 10], snares: [12], hats: [2, 6, 10, 14], ghosts: [7] }
      )
    },
    {
      id: "trap_sparse",
      name: "Sparse Pocket",
      description: "Minimal kick and hat pattern.",
      steps: makePattern(
        { kicks: [0, 8], snares: [12], hats: [6, 14], ghosts: [3, 11] }
      )
    },
    {
      id: "trap_hat_rolls",
      name: "Hat Rolls",
      description: "Rolled hats with light kick.",
      steps: makePattern(
        { kicks: [0, 8], snares: [12], hats: [2, 6, 10, 14], hatRetrig: 2 }
      )
    },
    {
      id: "trap_triplet",
      name: "Triplet Hats",
      description: "Triplet hat feel.",
      steps: makePattern(
        { kicks: [0, 8], snares: [12], hats: [2, 6, 10, 14], extras: [{ step: 14, retrig: 3 }] }
      )
    },
    {
      id: "trap_late_pickup",
      name: "Late Pickup",
      description: "Late kick pickup into snare.",
      steps: makePattern(
        { kicks: [0, 7, 11], snares: [12], hats: [2, 6, 10, 14], ghosts: [15] }
      )
    },
    {
      id: "trap_stabbed",
      name: "Stabbed",
      description: "Short stabs and late roll.",
      steps: makePattern(
        { kicks: [0, 3, 8], snares: [12], hats: [2, 6, 10, 14], extras: [{ step: 15, retrig: 4 }] }
      )
    },
    {
      id: "trap_bar_flip",
      name: "Bar Flip",
      description: "Bar 2 kick swap.",
      steps: makePattern(
        { kicks: [0, 8], snares: [12], hats: [2, 6, 10, 14] },
        { kicks: [0, 6, 10], snares: [12], hats: [2, 6, 10, 14], ghosts: [7, 15] }
      )
    }
],
  fills: [
    {
      id: "trap_hat_spray",
      name: "Hat Spray",
      description: "Continuous hat spray (offsets).",
      steps: makeFill({
        hats: [0, 2, 4, 6, 8, 10, 12, 14],
        extras: [{ step: 1, retrig: 2 }, { step: 3, retrig: 2 }, { step: 5, retrig: 2 }, { step: 7, retrig: 2 }, { step: 9, retrig: 2 }, { step: 11, retrig: 2 }, { step: 13, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "trap_snare_roll",
      name: "Snare Roll",
      description: "Snare roll into the drop (offsets).",
      steps: makeFill({
        snares: [12, 13, 14, 15],
        extras: [{ step: 12, retrig: 2 }, { step: 13, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "trap_808_rake",
      name: "808 Rake",
      description: "Heavy low rake (offsets).",
      steps: makeFill({
        kicks: [0, 4, 8, 12],
        extras: [{ step: 12, retrig: 2 }]
      })
    },
    {
      id: "trap_stop_hit",
      name: "Stop Hit",
      description: "Air-feel then slam (offsets).",
      steps: makeFill({
        snares: [12],
        extras: [{ step: 15, retrig: 4 }]
      })
    },
    {
      id: "trap_tail_roll",
      name: "Tail Roll",
      description: "Last-beat roll (offsets).",
      steps: makeFill({
        hats: [8, 9, 10, 11],
        extras: [{ step: 12, retrig: 2 }, { step: 13, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 8 }]
      })
    },
    {
      id: "trap_glitch_back",
      name: "Glitch Back",
      description: "Back-jump glitch (offsets).",
      steps: makeFill({
        kicks: [12, 11, 10, 9, 12, 11, 10, 9, 15, 14, 13, 12],
        ghostGain: 0.6
      })
    },
    {
      id: "trap_trip_run",
      name: "Trip Run",
      description: "Triplet run (offsets).",
      steps: makeFill({
        hats: [8, 10, 12, 14],
        extras: [{ step: 8, retrig: 3 }, { step: 10, retrig: 3 }, { step: 12, retrig: 3 }, { step: 14, retrig: 6 }]
      })
    },
    {
      id: "trap_glide_out",
      name: "Glide Out",
      description: "Smooth tail (offsets).",
      steps: makeFill({
        hats: [8, 9, 10, 11, 12, 13, 14, 15],
        ghostGain: 0.5
      })
    }
]
};

// ---------- UK Garage / 2-Step ----------
const UKG: PatternPack = {
  id: "ukg",
  name: "UK Garage / 2-Step",
  vibe: "Skippy 2-step illusion via off-beat repeats and playful back-jumps.",
  defaultTempoBpm: 132,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "ukg_straight", name: "Straight Cut", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "ukg_two_step", name: "2-Step Skip", description: "Skippy feel via repeated off-beats.", steps: A(
      0,1,2,1, 4,5,6,5, 8,9,10,9, 12,13,14,13,
      16,17,18,17, 20,21,22,21, 24,25,26,25, 28,29,30,29
    )},
    { id: "ukg_swingy", name: "Swingy Shuffle", description: "Swing illusion via near-step repeats.", steps: A(
      0,1,1,2, 4,5,5,6, 8,9,9,10, 12,13,13,14,
      16,17,17,18, 20,21,21,22, 24,25,25,26, 28,29,29,30
    )},
    { id: "ukg_chop_chirp", name: "Chop Chirp", description: "Micro retrigs for chirps.", steps: A(
      0,1,2,3, 4,5,6,7, 8,r(9,2),10,11, 12,13,14,15,
      16,17,18,19, 20,21,22,23, 24,r(25,2),26,27, 28,29,30,31
    )},
    { id: "ukg_backgrid", name: "Backgrid Hook", description: "Jump back on the 3rd beat area.", steps: A(
      0,1,2,3, 8,9,10,11, 8,9,10,11, 12,13,14,15,
      16,17,18,19, 24,25,26,27, 24,25,26,27, 28,29,30,31
    )},
    { id: "ukg_bass_pulse", name: "Bass Pulse (gesture)", description: "Downbeat emphasis via repeats.", steps: A(
      0,0,1,1, 4,4,5,5, 8,8,9,9, 12,12,13,13,
      16,16,17,17, 20,20,21,21, 24,24,25,25, 28,28,29,29
    )},
    { id: "ukg_stutter_turn", name: "Stutter Turnaround", description: "Retrig into bar transitions.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, r(12,2),r(13,2),14,15,
      16,17,18,19, 20,21,22,23, 24,25,26,27, r(28,2),r(29,2),30,31
    )},
    { id: "ukg_late_flip", name: "Late Flip", description: "Second bar flips the first bar\u2019s second half.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      24,25,26,27, 20,21,22,23, 28,29,30,31, 16,17,18,19
    )}
  ],
  fills: [
    { id: "ukg_click_roll", name: "Click Roll", description: "Tight roll (offsets).", steps: A(
      off(12),r(off(12),2),off(13),r(off(13),2), off(14),r(off(14),2),off(15),r(off(15),4),
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15)
    )},
    { id: "ukg_backpop", name: "Backpop", description: "Quick back-jump pop (offsets).", steps: A(
      off(8),off(9),off(10),off(11), off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15)
    )},
    { id: "ukg_swingfill", name: "Swing Fill", description: "Swing feel (offsets).", steps: A(
      off(0),off(1),off(1),off(2), off(4),off(5),off(5),off(6),
      off(8),off(9),off(9),off(10), off(12),off(13),off(13),off(14)
    )},
    { id: "ukg_zipper", name: "Zipper (32nds)", description: "Zipper retrigs (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      off(12),off(13),off(14),off(15), off(12),off(13),off(14),off(15)
    )},
    { id: "ukg_stop_hit", name: "Stop Hit", description: "Air-feel then slam (offsets).", steps: A(
      off(8),off(8),off(8),off(8), off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15), off(12),off(13),off(14),off(15)
    )},
    { id: "ukg_turn", name: "Turn", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7), off(8),off(9),off(10),off(11)
    )},
    { id: "ukg_retrip_tail", name: "Retrig Tail", description: "Last beat retrig (offsets).", steps: A(
      off(0),off(1),off(2),off(3), off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11), r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4)
    )},
    { id: "ukg_reverse_vibe", name: "Reverse-Vibe", description: "Tail\u2192mid jumps (offsets).", steps: A(
      off(15),off(14),off(13),off(12), off(11),off(10),off(9),off(8),
      off(15),off(14),off(13),off(12), off(7),off(6),off(5),off(4)
    )}
  ]
};

// ---------- Techno ----------
const TECHNO: PatternPack = {
  id: "techno",
  name: "Techno",
  vibe: "Machine repetition, hypnotic loops, subtle stutters and turnarounds.",
  defaultTempoBpm: 132,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "tech_straight", name: "Straight Machine", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "tech_piston", name: "Piston Pump", description: "Motorik repeats every 2 steps.", steps: repeatCell([0,1,0,1], 8).map((x, idx) => typeof x === "number" ? clamp32(x + (idx >= 16 ? 16 : 0)) : x) },
    { id: "tech_hypno4", name: "Hypno 4-Cell", description: "Repeats a 4-step cell.", steps: repeatCell([0,1,2,1], 8).map((x, idx) => typeof x === "number" ? clamp32(x + (idx >= 16 ? 16 : 0)) : x) },
    { id: "tech_gate", name: "Gate Grid", description: "Gated illusion via repeats.", steps: A(
      0,1,0,1, 2,3,2,3, 8,9,8,9, 10,11,10,11,
      16,17,16,17, 18,19,18,19, 24,25,24,25, 26,27,26,27
    )},
    { id: "tech_backpulse", name: "Backpulse Hook", description: "Mid-bar snapback for hypnotic hook.", steps: A(
      0,1,2,3, 4,5,6,7, 0,1,2,3, 8,9,10,11,
      16,17,18,19, 20,21,22,23, 16,17,18,19, 24,25,26,27
    )},
    { id: "tech_tick_stut", name: "Tick Stutter", description: "Stutters on 2 and 4 zones.", steps: A(
      0,1,2,3, r(4,2),5,r(6,2),7, 8,9,10,11, r(12,2),13,r(14,2),15,
      16,17,18,19, r(20,2),21,r(22,2),23, 24,25,26,27, r(28,2),29,r(30,2),31
    )},
    { id: "tech_ramp", name: "Ramp & Reset", description: "Repeats last half, then resets.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 8,9,10,11,
      16,17,18,19, 20,21,22,23, 24,25,26,27, 16,17,18,19
    )},
    { id: "tech_reloaded", name: "Reload Loop", description: "Restart cell frequently.", steps: A(
      0,1,2,3, 0,1,2,3, 4,5,6,7, 4,5,6,7,
      16,17,18,19, 16,17,18,19, 20,21,22,23, 20,21,22,23
    )}
  ],
  fills: [
    { id: "tech_riser", name: "Riser Retrig", description: "Escalating retrig (offsets).", steps: A(
      off(12),r(off(12),2),r(off(13),2),r(off(13),2), r(off(14),2),r(off(14),2),r(off(15),2),r(off(15),8),
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15)
    )},
    { id: "tech_backspin", name: "Micro Backspin", description: "Rewind gesture (offsets).", steps: A(
      off(15),off(14),off(13),off(12), off(11),off(10),off(9),off(8),
      off(15),off(14),off(13),off(12), off(7),off(6),off(5),off(4)
    )},
    { id: "tech_roll_last", name: "Roll Last Beat", description: "Last beat roll (offsets).", steps: A(
      off(0),off(1),off(2),off(3), off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11), r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4)
    )},
    { id: "tech_tick", name: "Tick Fill", description: "Repeat tick (offsets).", steps: A(
      off(0),off(1),off(0),off(1), off(2),off(3),off(2),off(3),
      off(4),off(5),off(4),off(5), off(6),off(7),off(6),off(7)
    )},
    { id: "tech_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7), off(8),off(9),off(10),off(11)
    )},
    { id: "tech_gatey", name: "Gatey Flicker", description: "Gate flicker (offsets).", steps: A(
      off(0),off(0),off(1),off(1), off(2),off(2),off(3),off(3),
      off(4),off(4),off(5),off(5), off(6),off(6),off(7),off(7)
    )},
    { id: "tech_slam", name: "Slam Reset", description: "Hard reset (offsets).", steps: A(
      off(8),off(8),off(8),off(8), off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15), off(12),off(13),off(14),off(15)
    )},
    { id: "tech_zip", name: "Zip (32nds)", description: "Fast zipper retrigs (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )}
  ]
};

// ---------- Hip-Hop / Boom Bap ----------
const HIPHOP: PatternPack = {
  id: "hiphop",
  name: "Hip-Hop / Boom Bap",
  vibe: "Laid-back repeats, head-nod pocket, simple turnarounds and scratches.",
  defaultTempoBpm: 92,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "hh_straight", name: "Straight Tape", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "hh_pocket", name: "Pocket Nod", description: "Head-nod pocket via repeats.", steps: A(
      0,0,1,1, 2,2,3,3, 8,8,9,9, 10,10,11,11,
      16,16,17,17, 18,18,19,19, 24,24,25,25, 26,26,27,27
    )},
    { id: "hh_chop4", name: "Chop Phrase", description: "Repeats 4-step phrases.", steps: A(
      0,1,2,3, 0,1,2,3, 4,5,6,7, 4,5,6,7,
      16,17,18,19, 16,17,18,19, 20,21,22,23, 20,21,22,23
    )},
    { id: "hh_hookback", name: "Hook Back", description: "Mid-bar jump-back for hook.", steps: A(
      0,1,2,3, 4,5,6,7, 0,1,2,3, 12,13,14,15,
      16,17,18,19, 20,21,22,23, 16,17,18,19, 28,29,30,31
    )},
    { id: "hh_scratchy", name: "Scratch Jabs", description: "Quick repeats like record jabs.", steps: A(
      0,1,2,3, 4,5,6,7, 8,8,9,9, 10,10,11,11,
      16,17,18,19, 20,21,22,23, 24,24,25,25, 26,26,27,27
    )},
    { id: "hh_stutter", name: "Stutter Accent", description: "Small retrig accents.", steps: A(
      0,1,2,3, 4,5,6,7, 8,r(8,2),9,10, 11,12,13,14,
      16,17,18,19, 20,21,22,23, 24,r(24,2),25,26, 27,28,29,30
    )},
    { id: "hh_lateflip", name: "Late Flip", description: "Second bar swaps halves.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      24,25,26,27, 20,21,22,23, 28,29,30,31, 16,17,18,19
    )},
    { id: "hh_refrain", name: "Refrain Repeat", description: "Repeats same 1-bar motif twice.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15
    )}
  ],
  fills: [
    { id: "hh_turnaround", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7), off(8),off(9),off(10),off(11)
    )},
    { id: "hh_jab_jab", name: "Jab-Jab", description: "Record jab repeats (offsets).", steps: A(
      off(8),off(8),off(9),off(9), off(10),off(10),off(11),off(11),
      off(12),off(12),off(13),off(13), off(14),off(14),off(15),off(15)
    )},
    { id: "hh_roll_last", name: "Roll Last Beat", description: "Last beat roll (offsets).", steps: A(
      off(0),off(1),off(2),off(3), off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11), r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4)
    )},
    { id: "hh_stutter_tail", name: "Stutter Tail", description: "End stutter (offsets).", steps: A(
      off(12),off(12),off(12),off(12), r(off(12),2),r(off(12),2),r(off(12),2),r(off(12),2),
      off(14),off(14),off(14),off(14), r(off(15),2),r(off(15),2),r(off(15),2),r(off(15),4)
    )},
    { id: "hh_backspin", name: "Backspin Gesture", description: "Tail\u2192mid jumps (offsets).", steps: A(
      off(15),off(14),off(13),off(12), off(11),off(10),off(9),off(8),
      off(15),off(14),off(13),off(12), off(7),off(6),off(5),off(4)
    )},
    { id: "hh_zipper", name: "Zipper (32nds)", description: "Fast retrigs (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      off(12),off(13),off(14),off(15), off(12),off(13),off(14),off(15)
    )},
    { id: "hh_refrain", name: "Refrain Fill", description: "Repeats first half for hook (offsets).", steps: A(
      off(0),off(1),off(2),off(3), off(4),off(5),off(6),off(7),
      off(0),off(1),off(2),off(3), off(12),off(13),off(14),off(15)
    )},
    { id: "hh_slam", name: "Slam Hit", description: "Hard hit (offsets).", steps: A(
      off(8),off(8),off(8),off(8), off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15), off(12),off(13),off(14),off(15)
    )}
  ]
};

// ---------- Breaks ----------
const BREAKS: PatternPack = {
  id: "breaks",
  name: "Breaks",
  vibe: "Classic breakbeat rearrangements; jumpbacks and snare flips.",
  defaultTempoBpm: 138,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    {
      id: "breaks_funky",
      name: "Funky Groove",
      description: "Classic breakbeat backbone.",
      steps: makeChopPattern(
        {
          kicks: [0, 8],
          snares: [4, 12],
          hats: [0, 2, 4, 6, 8, 10, 12, 14]
        },
        {
          kicks: [0, 8],
          snares: [4, 12, 15],
          hats: [0, 2, 4, 6, 8, 10, 12, 14]
        }
      )
    },
    {
      id: "breaks_amen",
      name: "Amen Flip",
      description: "Amen-style breakbeat.",
      steps: makeChopPattern(
        {
          kicks: [0, 2, 10, 11],
          snares: [4, 7, 9, 12, 15],
          hats: [0, 2, 4, 6, 8, 10, 12, 14]
        },
        {
          kicks: [0, 2, 10],
          snares: [4, 7, 9, 14],
          hats: [0, 2, 4, 6, 8, 10, 12, 14]
        }
      )
    },
    {
      id: "breaks_nuskool",
      name: "Nu-Skool",
      description: "Modern breakbeat pocket.",
      steps: makeChopPattern(
        { kicks: [0, 5, 8, 11], snares: [4, 12], hats: [2, 6, 10, 14], ghosts: [3, 7, 15] }
      )
    },
    {
      id: "breaks_shuffle",
      name: "Shuffle Break",
      description: "Shuffle hats with syncopated kicks.",
      steps: makeChopPattern(
        { kicks: [0, 6, 8, 10], snares: [4, 12], hats: [1, 3, 5, 7, 9, 11, 13, 15], ghosts: [2, 6, 10, 14] }
      )
    },
    {
      id: "breaks_electro",
      name: "Electro Break",
      description: "Electro-flavored breakbeat.",
      steps: makeChopPattern(
        { kicks: [0, 4, 8, 12], snares: [4, 12], hats: [2, 6, 10, 14], ghosts: [7, 15] }
      )
    },
    {
      id: "breaks_half_time",
      name: "Half-Time Break",
      description: "Half-time break feel.",
      steps: makeChopPattern(
        { kicks: [0, 8], snares: [12], hats: [2, 10, 14], ghosts: [7, 15] }
      )
    },
    {
      id: "breaks_backjump",
      name: "Backjump",
      description: "Kick resets for break movement.",
      steps: makeChopPattern(
        { kicks: [0, 3, 8, 11], snares: [4, 12], hats: [2, 6, 10, 14], ghosts: [15] }
      )
    },
    {
      id: "breaks_tail",
      name: "Tail Rush",
      description: "Tail push into the end of the bar.",
      steps: makeChopPattern(
        { kicks: [0, 6, 8, 10], snares: [4, 12], hats: [2, 6, 10, 14], extras: [{ step: 15, retrig: 4 }] }
      )
    }
  ],
  fills: [
    {
      id: "breaks_snare_roll",
      name: "Snare Roll",
      description: "Snare roll (offsets).",
      steps: makeFill({
        snares: [12, 13, 14, 15],
        extras: [{ step: 12, retrig: 2 }, { step: 13, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "breaks_hat_roll",
      name: "Hat Roll",
      description: "Hat roll (offsets).",
      steps: makeFill({
        hats: [8, 9, 10, 11],
        extras: [{ step: 12, retrig: 2 }, { step: 13, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    },
    {
      id: "breaks_kick_drop",
      name: "Kick Drop",
      description: "Kick drop (offsets).",
      steps: makeFill({
        kicks: [0, 4, 8, 12],
        extras: [{ step: 12, retrig: 2 }]
      })
    },
    {
      id: "breaks_backspin",
      name: "Backspin",
      description: "Backspin feel (offsets).",
      steps: makeFill({
        kicks: [15, 14, 13, 12, 11, 10, 9, 8],
        ghostGain: 0.6
      })
    },
    {
      id: "breaks_turnaround",
      name: "Turnaround",
      description: "Turnaround phrase (offsets).",
      steps: makeFill({
        kicks: [8, 10, 12, 14],
        hats: [9, 11, 13, 15]
      })
    },
    {
      id: "breaks_ghosts",
      name: "Ghost Run",
      description: "Ghosted fill (offsets).",
      steps: makeFill({
        ghosts: [8, 9, 10, 11, 12, 13, 14, 15],
        ghostGain: 0.4
      })
    },
    {
      id: "breaks_slam",
      name: "Slam Hit",
      description: "Hard hit (offsets).",
      steps: makeFill({
        snares: [12],
        extras: [{ step: 15, retrig: 4 }]
      })
    },
    {
      id: "breaks_stutter",
      name: "Stutter Tail",
      description: "Stutter tail (offsets).",
      steps: makeFill({
        hats: [12, 13, 14, 15],
        extras: [{ step: 12, retrig: 2 }, { step: 13, retrig: 2 }, { step: 14, retrig: 2 }, { step: 15, retrig: 4 }]
      })
    }
  ]
};

// ---------- Dubstep ----------
const DUBSTEP: PatternPack = {
  id: "dubstep",
  name: "Dubstep",
  vibe: "Half-time weight with aggressive stutters and reload gestures.",
  defaultTempoBpm: 140,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "ds_straight", name: "Straight Weight", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "ds_halftime", name: "Half-Time Crusher", description: "Heavy doubled steps.", steps: A(
      0,0,1,1, 2,2,3,3, 4,4,5,5, 6,6,7,7,
      16,16,17,17, 18,18,19,19, 20,20,21,21, 22,22,23,23
    )},
    { id: "ds_wobble_stut", name: "Wobble Stutter", description: "Retrigs like wobble gating.", steps: A(
      0,r(1,2),2,r(3,2), 4,r(5,2),6,r(7,2),
      8,r(9,2),10,r(11,2), 12,r(13,2),14,r(15,2),
      16,r(17,4),18,r(19,4), 20,r(21,4),22,r(23,4),
      24,r(25,4),26,r(27,4), 28,r(29,4),30,r(31,4)
    )},
    { id: "ds_reload", name: "Reload Slam", description: "Repeats bar start then slams.", steps: A(
      0,1,2,3, 0,1,2,3, 8,9,10,11, 12,13,14,15,
      16,17,18,19, 16,17,18,19, 24,25,26,27, 28,29,30,31
    )},
    { id: "ds_backjump", name: "BackJump Growl", description: "Chops by snapping back repeatedly.", steps: A(
      0,1,4,1, 8,9,4,12, 0,1,4,1, 12,13,14,15,
      16,17,20,17, 24,25,20,28, 16,17,20,17, 28,29,30,31
    )},
    { id: "ds_gate", name: "Gate Pressure", description: "Gated illusion via repeats.", steps: A(
      0,1,0,1, 2,3,2,3, 8,9,8,9, 10,11,10,11,
      16,17,16,17, 18,19,18,19, 24,25,24,25, 26,27,26,27
    )},
    { id: "ds_crush_turn", name: "Crush Turn", description: "End-of-bar retrig build.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, r(12,2),r(13,2),r(14,2),r(15,4),
      16,17,18,19, 20,21,22,23, 24,25,26,27, r(28,2),r(29,2),r(30,2),r(31,4)
    )},
    { id: "ds_callresp", name: "Call / Response Growl", description: "Motif then answer.", steps: A(
      0,1,2,3, 8,9,10,11, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 24,25,26,27, 20,21,22,23, 28,29,30,31
    )}
  ],
  fills: [
    { id: "ds_roll", name: "Roll Last Beat", description: "Dubstep roll (offsets).", steps: A(
      off(0),off(1),off(2),off(3), off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11), r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8)
    )},
    { id: "ds_wobble_zip", name: "Wobble Zipper", description: "Dense retrigs (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )},
    { id: "ds_backspin", name: "Backspin Slam", description: "Rewind gesture (offsets).", steps: A(
      off(15),off(14),off(13),off(12), off(11),off(10),off(9),off(8),
      off(15),off(14),off(13),off(12), off(7),off(6),off(5),off(4)
    )},
    { id: "ds_stop_hit", name: "Stop + Hit", description: "Air then slam (offsets).", steps: A(
      off(8),off(8),off(8),off(8), off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15), off(12),off(13),off(14),off(15)
    )},
    { id: "ds_crush", name: "Crush Retrig", description: "Hard retrig crush (offsets).", steps: A(
      off(12),off(12),off(12),off(12),
      r(off(12),2),r(off(12),2),r(off(12),2),r(off(12),2),
      off(14),off(14),off(14),off(14),
      r(off(15),2),r(off(15),2),r(off(15),4),r(off(15),8)
    )},
    { id: "ds_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7), off(8),off(9),off(10),off(11)
    )},
    { id: "ds_rake", name: "Low Rake (gesture)", description: "Downbeat-ish repeats (offsets).", steps: A(
      off(0),off(0),off(0),off(0),
      off(4),off(4),off(4),off(4),
      off(8),off(8),off(8),off(8),
      off(12),off(12),r(off(13),2),r(off(15),2)
    )},
    { id: "ds_tail", name: "Tail Chatter", description: "Tail retrig chatter (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )}
  ]
};

// ============================================================================
// EXTENDED PACKS (added)
// ============================================================================

// ---------- Liquid DnB ----------
const LIQUID_DNB: PatternPack = {
  id: "liquid_dnb",
  name: "Liquid DnB",
  vibe: "Smoother forward motion, gentle jumpbacks, tasteful micro rolls.",
  defaultTempoBpm: 174,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "liq_straight", name: "Silk Straight", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "liq_glide", name: "Glide Step", description: "Repeats mild zones for a rolling glide.", steps: A(
      0,1,2,3, 4,5,4,5, 8,9,10,11, 12,13,12,13,
      16,17,18,19, 20,21,20,21, 24,25,26,27, 28,29,28,29
    )},
    { id: "liq_soft_jump", name: "Soft Jumpback", description: "Small rewind gestures (subtle).", steps: A(
      0,1,2,3, 4,5,6,7, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 20,21,22,23, 20,21,22,23, 28,29,30,31
    )},
    { id: "liq_call", name: "Warm Call/Answer", description: "Motif then answer; less aggressive.", steps: A(
      0,1,2,3, 8,9,10,11, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 24,25,26,27, 20,21,22,23, 28,29,30,31
    )},
    { id: "liq_roll_touch", name: "Roll Touch", description: "Tiny retrigs on transitions.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,r(11,2), 12,13,14,15,
      16,17,18,19, 20,21,22,23, 24,25,26,r(27,2), 28,29,30,31
    )},
    { id: "liq_shuffle", name: "Liquid Shuffle", description: "Gentle skitter without chopping the life out.", steps: A(
      0,1,2,1, 4,5,6,5, 8,9,10,9, 12,13,14,13,
      16,17,18,17, 20,21,22,21, 24,25,26,25, 28,29,30,29
    )},
    { id: "liq_refrain", name: "Refrain Bloom", description: "Repeats a 1-bar phrase to lock a vibe.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15
    )},
    { id: "liq_mid_reload", name: "Mid Reload", description: "Repeats first half then flows out.", steps: A(
      0,1,2,3, 4,5,6,7, 0,1,2,3, 12,13,14,15,
      16,17,18,19, 20,21,22,23, 24,25,26,27, 28,29,30,31
    )}
  ],
  fills: [
    { id: "liq_roll", name: "Velvet Roll", description: "Soft last beat roll (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )},
    { id: "liq_turn", name: "Gentle Turn", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7), off(8),off(9),off(10),off(11)
    )},
    { id: "liq_swish", name: "Swish Retrig", description: "Light zipper retrigs (offsets).", steps: A(
      off(8),r(off(9),2),off(10),r(off(11),2),
      off(12),r(off(13),2),off(14),r(off(15),4),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "liq_back_hint", name: "Back Hint", description: "Small backspin hint (offsets).", steps: A(
      off(15),off(14),off(13),off(12),
      off(12),off(13),off(14),off(15),
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15)
    )},
    { id: "liq_chatter", name: "Tail Chatter", description: "Tasteful tail chatter (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(14),2),r(off(15),2),r(off(15),4),off(15),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "liq_gate", name: "Soft Gate", description: "Gate flicker (offsets).", steps: A(
      off(0),off(1),off(0),off(1),
      off(2),off(3),off(2),off(3),
      off(4),off(5),off(4),off(5),
      off(6),off(7),off(6),off(7)
    )},
    { id: "liq_stop", name: "Air & Return", description: "Air-feel then return (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "liq_lift", name: "Lift Into 1", description: "Lift into downbeat (offsets).", steps: A(
      off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )}
  ]
};

// ---------- Neurofunk ----------
const NEUROFUNK: PatternPack = {
  id: "neurofunk",
  name: "Neurofunk",
  vibe: "Aggressive jumpbacks, tight stutters, machine-gun retrigs.",
  defaultTempoBpm: 172,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "neu_straight", name: "Steel Straight", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "neu_chopgrid", name: "Chop Grid", description: "Hard 2-step cell chops.", steps: A(
      0,1,0,1, 4,5,4,5, 8,9,8,9, 12,13,12,13,
      16,17,16,17, 20,21,20,21, 24,25,24,25, 28,29,28,29
    )},
    { id: "neu_backhammer", name: "BackHammer", description: "Frequent rewind strikes.", steps: A(
      0,1,4,1, 8,9,4,12, 0,1,4,1, 14,15,12,8,
      16,17,20,17, 24,25,20,28, 16,17,20,17, 30,31,28,24
    )},
    { id: "neu_machine", name: "Machine Run", description: "Relentless forward + stutter accents.", steps: A(
      0,1,2,3, 4,5,6,7, r(8,2),9,r(10,2),11, 12,13,14,15,
      16,17,18,19, 20,21,22,23, r(24,2),25,r(26,2),27, 28,29,30,31
    )},
    { id: "neu_reload", name: "Reload Clamp", description: "Clamp on the first half, then punch out.", steps: A(
      0,1,2,3, 4,5,6,7, 0,1,2,3, 4,5,6,7,
      16,17,20,17, 24,25,20,28, 24,25,26,27, 28,29,30,31
    )},
    { id: "neu_stutterlane", name: "Stutter Lane", description: "Lane-based retrigs for \u201cneuro\u201d chatter.", steps: A(
      0, r(1,2), 2, r(3,2), 4, r(5,2), 6, r(7,2),
      8, r(9,2), 10, r(11,2), 12, r(13,2), 14, r(15,2),
      16, r(17,4), 18, r(19,4), 20, r(21,4), 22, r(23,4),
      24, r(25,4), 26, r(27,4), 28, r(29,4), 30, r(31,4)
    )},
    { id: "neu_flip", name: "Half Flip Brutal", description: "Flips halves for brutal rearrangement.", steps: A(
      8,9,10,11, 12,13,14,15, 0,1,2,3, 4,5,6,7,
      24,25,26,27, 28,29,30,31, 16,17,18,19, 20,21,22,23
    )},
    { id: "neu_skitter", name: "Skitter Attack", description: "Skittery repeats; feels like frantic hats.", steps: A(
      0,1,2,1, 4,5,4,7, 8,9,8,11, 12,13,12,15,
      16,17,18,17, 20,21,20,23, 24,25,24,27, 28,29,28,31
    )}
  ],
  fills: [
    { id: "neu_gun", name: "Machine Gun (32nds)", description: "Dense retrigs (offsets).", steps: A(
      r(off(8),2),r(off(8),2),r(off(9),2),r(off(9),2),
      r(off(10),2),r(off(10),2),r(off(11),2),r(off(11),2),
      r(off(12),2),r(off(12),2),r(off(13),2),r(off(13),2),
      r(off(14),2),r(off(14),2),r(off(15),4),r(off(15),8)
    )},
    { id: "neu_backspin", name: "Backspin Rake", description: "Rewind gesture (offsets).", steps: A(
      off(15),off(14),off(13),off(12),
      off(11),off(10),off(9),off(8),
      off(15),off(14),off(13),off(12),
      off(7),off(6),off(5),off(4)
    )},
    { id: "neu_roll", name: "Roll Last Beat", description: "Last beat roll (offsets).", steps: A(
      off(0),off(1),off(2),off(3), off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11), r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8)
    )},
    { id: "neu_zipper", name: "Zipper Blast", description: "Fast zipper (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )},
    { id: "neu_crush", name: "Crush Clamp", description: "Clamp repeats then slam (offsets).", steps: A(
      off(12),off(12),off(12),off(12),
      r(off(12),2),r(off(12),2),r(off(12),2),r(off(12),2),
      off(14),off(14),off(14),off(14),
      r(off(15),2),r(off(15),2),r(off(15),4),r(off(15),8)
    )},
    { id: "neu_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11), off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7), off(8),off(9),off(10),off(11)
    )},
    { id: "neu_stop", name: "Stop + Hit", description: "Air-feel then hit (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "neu_tail", name: "Tail Shred", description: "Tail shredding retrigs (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(14),2),r(off(15),2),r(off(15),4),r(off(15),8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )}
  ]
};

// ---------- Hardcore / Rave ----------
const HARDCORE_RAVE: PatternPack = {
  id: "hardcore_rave",
  name: "Hardcore / Rave",
  vibe: "Break rush + brutal repeats; old-school rave chop energy.",
  defaultTempoBpm: 165,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "rave_straight", name: "Rave Straight", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "rave_piano_chop", name: "Piano Chop (gesture)", description: "Fast cell repeats, rave-y.", steps: A(
      0,1,0,1, 2,3,2,3, 4,5,4,5, 6,7,6,7,
      16,17,16,17, 18,19,18,19, 20,21,20,21, 22,23,22,23
    )},
    { id: "rave_backrush", name: "Backrush", description: "Heavy back-jumps for break rush.", steps: A(
      0,1,4,1, 8,9,4,12, 0,1,4,1, 12,13,14,15,
      16,17,20,17, 24,25,20,28, 16,17,20,17, 28,29,30,31
    )},
    { id: "rave_flip", name: "Half Flip Rave", description: "Flip halves for big change-ups.", steps: A(
      8,9,10,11, 12,13,14,15, 0,1,2,3, 4,5,6,7,
      24,25,26,27, 28,29,30,31, 16,17,18,19, 20,21,22,23
    )},
    { id: "rave_stut", name: "Stut Stabs", description: "Stutter stabs across bars.", steps: A(
      0,r(1,2),2,r(3,2), 4,r(5,2),6,r(7,2),
      8,9,10,11, 12,13,r(14,2),15,
      16,r(17,2),18,r(19,2), 20,r(21,2),22,r(23,2),
      24,25,26,27, 28,29,r(30,2),31
    )},
    { id: "rave_reload", name: "Reload & Smash", description: "Reload first bar then smash forward.", steps: A(
      0,1,2,3, 0,1,2,3, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 16,17,18,19, 24,25,26,27, 28,29,30,31
    )},
    { id: "rave_train", name: "Train Roll", description: "Rolling train feel via 2-step repeats.", steps: A(
      0,1,0,1, 4,5,4,5, 8,9,8,9, 12,13,12,13,
      16,17,16,17, 20,21,20,21, 24,25,24,25, 28,29,28,29
    )},
    { id: "rave_airdrop", name: "Air Drop", description: "Repeated \u201cair\u201d gesture then return.", steps: A(
      8,8,8,8, 8,8,8,8, 12,13,14,15, 0,1,2,3,
      24,24,24,24, 24,24,24,24, 28,29,30,31, 16,17,18,19
    )}
  ],
  fills: [
    { id: "rave_roll", name: "Rave Roll", description: "Classic roll-up (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      off(12),off(13),off(14),off(15)
    )},
    { id: "rave_zip", name: "Zipper Up", description: "Zipper retrigs (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "rave_backspin", name: "Backspin", description: "Rewind gesture (offsets).", steps: A(
      off(15),off(14),off(13),off(12),
      off(11),off(10),off(9),off(8),
      off(15),off(14),off(13),off(12),
      off(7),off(6),off(5),off(4)
    )},
    { id: "rave_stab", name: "Stab Repeat", description: "Stab repeats (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(12),off(12),off(12),off(12),
      r(off(12),2),r(off(12),2),r(off(12),2),r(off(12),2),
      off(14),off(14),r(off(15),2),r(off(15),4)
    )},
    { id: "rave_stop", name: "Stop + Hit", description: "Air then hit (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "rave_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11)
    )},
    { id: "rave_chatter", name: "Tail Chatter", description: "Tail chatter (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(14),2),r(off(15),2),r(off(15),4),r(off(15),8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "rave_gate", name: "Gate Flicker", description: "Gate flicker (offsets).", steps: repeatFillCell(
      [off(0),off(1),off(0),off(1)], 4
    )}
  ]
};

// ---------- Drill ----------
const DRILL: PatternPack = {
  id: "drill",
  name: "Drill",
  vibe: "Sliding pocket, sparse aggression, triplet-ish hat grammar + stutters.",
  defaultTempoBpm: 142,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "drill_straight", name: "Straight Pocket", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "drill_sparse", name: "Sparse Pressure", description: "Repeats downbeat zones for sparse feel.", steps: A(
      0,0,0,0, 4,4,4,4, 8,8,8,8, 12,12,12,12,
      16,16,16,16, 20,20,20,20, 24,24,24,24, 28,28,28,28
    )},
    { id: "drill_trip_hats", name: "Trip Hats", description: "Triplet-ish retrig grammar.", steps: A(
      0, r(1,3), 2, r(3,3), 4, r(5,3), 6, r(7,3),
      8, r(9,3), 10, r(11,3), 12, r(13,3), 14, r(15,3),
      16, r(17,6), 18, r(19,6), 20, r(21,6), 22, r(23,6),
      24, r(25,6), 26, r(27,6), 28, r(29,6), 30, r(31,6)
    )},
    { id: "drill_hookback", name: "Hookback Bite", description: "Snaps back for hook emphasis.", steps: A(
      0,1,2,3, 0,1,2,3, 8,9,10,11, 8,9,10,11,
      16,17,18,19, 16,17,18,19, 24,25,26,27, 24,25,26,27
    )},
    { id: "drill_stutter", name: "Stutter Threat", description: "Stutters at phrase points.", steps: A(
      0,1,2,3, 4,5,6,7, 8,r(8,2),9,10, 11,12,13,14,
      16,17,18,19, 20,21,22,23, 24,r(24,2),25,26, 27,28,29,30
    )},
    { id: "drill_lateflip", name: "Late Flip", description: "Second bar swaps halves for variation.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      24,25,26,27, 20,21,22,23, 28,29,30,31, 16,17,18,19
    )},
    { id: "drill_gated", name: "Gated Tension", description: "Gate illusion via repeats.", steps: A(
      0,1,0,1, 2,3,2,3, 8,9,8,9, 10,11,10,11,
      16,17,16,17, 18,19,18,19, 24,25,24,25, 26,27,26,27
    )},
    { id: "drill_tailroll", name: "Tail Roll Setup", description: "Sets up fills with tail retrigs.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, r(12,2),r(13,2),r(14,2),r(15,4),
      16,17,18,19, 20,21,22,23, 24,25,26,27, r(28,2),r(29,2),r(30,2),r(31,4)
    )}
  ],
  fills: [
    { id: "drill_hat_spray", name: "Hat Spray", description: "Hat spray (offsets).", steps: A(
      r(off(0),2),r(off(1),2),r(off(2),2),r(off(3),2),
      r(off(4),2),r(off(5),2),r(off(6),2),r(off(7),2),
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4)
    )},
    { id: "drill_trip_run", name: "Trip Run", description: "Trip run (offsets).", steps: A(
      r(off(8),3),r(off(9),3),r(off(10),3),r(off(11),3),
      r(off(12),3),r(off(13),3),r(off(14),3),r(off(15),6),
      off(12),off(13),off(14),off(15), r(off(15),2),r(off(15),2),r(off(15),2),r(off(15),4)
    )},
    { id: "drill_backglitch", name: "Backglitch", description: "Back-jump glitch (offsets).", steps: A(
      off(12),off(11),off(10),off(9),
      off(12),off(11),off(10),off(9),
      off(15),off(14),off(13),off(12),
      r(off(15),2),r(off(15),2),r(off(15),2),r(off(15),4)
    )},
    { id: "drill_roll", name: "Roll Last Beat", description: "Roll last beat (offsets).", steps: A(
      off(0),off(1),off(2),off(3), off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11), r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8)
    )},
    { id: "drill_stop", name: "Stop + Hit", description: "Air then hit (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "drill_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11)
    )},
    { id: "drill_stutter_tail", name: "Stutter Tail", description: "Stutter tail (offsets).", steps: A(
      off(12),off(12),off(12),off(12),
      r(off(12),2),r(off(12),2),r(off(12),2),r(off(12),2),
      off(14),off(14),off(14),off(14),
      r(off(15),2),r(off(15),2),r(off(15),4),r(off(15),8)
    )},
    { id: "drill_zipper", name: "Zipper", description: "Zipper (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )}
  ]
};

// ---------- Reggaeton / Dembow ----------
const REGGAETON: PatternPack = {
  id: "reggaeton_dembow",
  name: "Reggaeton / Dembow",
  vibe: "Dembow pulse via repeated cells; fills are rolls + turnaround taps.",
  defaultTempoBpm: 95,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "dem_straight", name: "Straight Dembow", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "dem_pulse", name: "Dembow Pulse", description: "Repeated 4-step pulse cell across bars.", steps: repeatCell([0,1,2,1], 8).map((x, idx) =>
      typeof x === "number" ? clamp32(x + (idx >= 16 ? 16 : 0)) : x
    )},
    { id: "dem_push", name: "Push & Pull", description: "Repeats offbeats to imply dembow push.", steps: A(
      0,1,0,1, 2,3,2,3, 8,9,8,9, 10,11,10,11,
      16,17,16,17, 18,19,18,19, 24,25,24,25, 26,27,26,27
    )},
    { id: "dem_call", name: "Call / Response", description: "Motif + answer; good for vocal chops too.", steps: A(
      0,1,2,3, 8,9,10,11, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 24,25,26,27, 20,21,22,23, 28,29,30,31
    )},
    { id: "dem_hookback", name: "Hookback Bounce", description: "Snapback for catchy bounce.", steps: A(
      0,1,2,3, 0,1,2,3, 8,9,10,11, 8,9,10,11,
      16,17,18,19, 16,17,18,19, 24,25,26,27, 24,25,26,27
    )},
    { id: "dem_gate", name: "Gate Bounce", description: "Gate illusion for percussive chops.", steps: A(
      0,0,1,1, 2,2,3,3, 8,8,9,9, 10,10,11,11,
      16,16,17,17, 18,18,19,19, 24,24,25,25, 26,26,27,27
    )},
    { id: "dem_stutter", name: "Stutter Accent", description: "Small retrigs for accent hits.", steps: A(
      0,1,2,3, 4,5,6,7, 8,r(8,2),9,10, 11,12,13,14,
      16,17,18,19, 20,21,22,23, 24,r(24,2),25,26, 27,28,29,30
    )},
    { id: "dem_refrain", name: "Refrain Loop", description: "Repeats 1-bar motif twice (pop-friendly).", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15
    )}
  ],
  fills: [
    { id: "dem_roll", name: "Roll Last Beat", description: "Roll into next bar (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )},
    { id: "dem_zip", name: "Zipper Tap", description: "Zipper retrigs (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "dem_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11)
    )},
    { id: "dem_back_hint", name: "Back Hint", description: "Tiny rewind hint (offsets).", steps: A(
      off(15),off(14),off(13),off(12),
      off(12),off(13),off(14),off(15),
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15)
    )},
    { id: "dem_gate", name: "Gate Flicker", description: "Gate flicker (offsets).", steps: repeatFillCell(
      [off(0),off(1),off(0),off(1)], 4
    )},
    { id: "dem_stop", name: "Stop + Hit", description: "Air then hit (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "dem_chatter", name: "Tail Chatter", description: "Tail chatter (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(14),2),r(off(15),2),r(off(15),4),off(15),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "dem_bounce", name: "Bounce Fill", description: "Bouncy repeat fill (offsets).", steps: A(
      off(0),off(1),off(0),off(1),
      off(4),off(5),off(4),off(5),
      off(8),off(9),off(8),off(9),
      off(12),off(13),r(off(14),2),r(off(15),2)
    )}
  ]
};

// ---------- Footwork / Juke ----------
const FOOTWORK: PatternPack = {
  id: "footwork_juke",
  name: "Footwork / Juke",
  vibe: "Hyper jumpbacks, rapid 32nd jitters, \u201ccut-up\u201d energy.",
  defaultTempoBpm: 160,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "fw_straight", name: "Straight Cut", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "fw_jit", name: "Jitter Grid", description: "Alternating micro retrigs everywhere.", steps: A(
      0,r(1,2),2,r(3,2), 4,r(5,2),6,r(7,2),
      8,r(9,2),10,r(11,2), 12,r(13,2),14,r(15,2),
      16,r(17,2),18,r(19,2), 20,r(21,2),22,r(23,2),
      24,r(25,2),26,r(27,2), 28,r(29,2),30,r(31,2)
    )},
    { id: "fw_backcut", name: "Backcut Sprint", description: "Constant snapbacks to earlier zones.", steps: A(
      0,1,2,3, 0,1,2,3, 8,9,10,11, 4,5,6,7,
      16,17,18,19, 16,17,18,19, 24,25,26,27, 20,21,22,23
    )},
    { id: "fw_doublecell", name: "Double Cell", description: "Repeats a 2-step cell to feel \u201cjuke\u201d.", steps: A(
      0,1,0,1, 0,1,0,1, 8,9,8,9, 8,9,8,9,
      16,17,16,17, 16,17,16,17, 24,25,24,25, 24,25,24,25
    )},
    { id: "fw_flip", name: "Half Flip", description: "Flip halves to keep it unstable.", steps: A(
      8,9,10,11, 12,13,14,15, 0,1,2,3, 4,5,6,7,
      24,25,26,27, 28,29,30,31, 16,17,18,19, 20,21,22,23
    )},
    { id: "fw_stutlane", name: "Stut Lane", description: "Focused stutters on a few indices.", steps: A(
      0,1,2,3, 4,5,6,7,
      r(8,2),r(8,2),9,9, r(10,2),r(10,2),11,11,
      16,17,18,19, 20,21,22,23,
      r(24,2),r(24,2),25,25, r(26,2),r(26,2),27,27
    )},
    { id: "fw_reload", name: "Reload Flick", description: "Reload feel\u2014repeat early, then burst.", steps: A(
      0,1,2,3, 0,1,2,3, 0,1,2,3, 12,13,14,15,
      16,17,18,19, 16,17,18,19, 16,17,18,19, 28,29,30,31
    )},
    { id: "fw_skippy", name: "Skippy Juke", description: "Skips every other step via repeats.", steps: A(
      0,1,1,2, 4,5,5,6, 8,9,9,10, 12,13,13,14,
      16,17,17,18, 20,21,21,22, 24,25,25,26, 28,29,29,30
    )}
  ],
  fills: [
    { id: "fw_machinegun", name: "Machinegun 32nds", description: "Dense machinegun (offsets).", steps: A(
      r(off(0),2),r(off(1),2),r(off(2),2),r(off(3),2),
      r(off(4),2),r(off(5),2),r(off(6),2),r(off(7),2),
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4)
    )},
    { id: "fw_zipper", name: "Zipper Blast", description: "Zipper into downbeat (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "fw_backspin", name: "Backspin Chop", description: "Rewind gesture (offsets).", steps: A(
      off(15),off(14),off(13),off(12),
      off(11),off(10),off(9),off(8),
      off(15),off(14),off(13),off(12),
      off(7),off(6),off(5),off(4)
    )},
    { id: "fw_roll", name: "Roll Last Beat", description: "Roll last beat (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),8),
      off(12),off(13),off(14),off(15)
    )},
    { id: "fw_gate", name: "Gate Flicker", description: "Gate flicker (offsets).", steps: repeatFillCell(
      [off(0),off(1),off(0),off(1)], 4
    )},
    { id: "fw_stop", name: "Stop + Hit", description: "Air then hit (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "fw_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11)
    )},
    { id: "fw_chatter", name: "Tail Chatter", description: "Tail chatter (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(14),2),r(off(15),2),r(off(15),4),r(off(15),8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )}
  ]
};

// ---------- Funk / Disco ----------
const FUNK_DISCO: PatternPack = {
  id: "funk_disco",
  name: "Funk / Disco",
  vibe: "Bouncy syncopation illusion via repeats; funky turnarounds + chatter.",
  defaultTempoBpm: 112,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "funk_straight", name: "Straight Groove", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "funk_bounce", name: "Bounce Step", description: "Bouncy repeats every other step.", steps: A(
      0,1,0,1, 2,3,2,3, 4,5,4,5, 6,7,6,7,
      16,17,16,17, 18,19,18,19, 20,21,20,21, 22,23,22,23
    )},
    { id: "funk_shuffle", name: "Disco Shuffle", description: "Swing illusion via near repeats.", steps: A(
      0,1,1,2, 4,5,5,6, 8,9,9,10, 12,13,13,14,
      16,17,17,18, 20,21,21,22, 24,25,25,26, 28,29,29,30
    )},
    { id: "funk_call", name: "Call / Answer", description: "Motif + answer; great for guitar or vocal loops too.", steps: A(
      0,1,2,3, 8,9,10,11, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 24,25,26,27, 20,21,22,23, 28,29,30,31
    )},
    { id: "funk_hookback", name: "Hookback Pop", description: "Jump back for hooky funk pop.", steps: A(
      0,1,2,3, 0,1,2,3, 8,9,10,11, 8,9,10,11,
      16,17,18,19, 16,17,18,19, 24,25,26,27, 24,25,26,27
    )},
    { id: "funk_gate", name: "Chop Gate", description: "Gate illusion for choppy funk.", steps: A(
      0,0,1,1, 2,2,3,3, 8,8,9,9, 10,10,11,11,
      16,16,17,17, 18,18,19,19, 24,24,25,25, 26,26,27,27
    )},
    { id: "funk_stutter", name: "Stutter Accent", description: "Small retrigs as accents.", steps: A(
      0,1,2,3, 4,5,6,7, 8,r(8,2),9,10, 11,12,13,14,
      16,17,18,19, 20,21,22,23, 24,r(24,2),25,26, 27,28,29,30
    )},
    { id: "funk_refrain", name: "Refrain Repeat", description: "Repeats a 1-bar phrase twice.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15
    )}
  ],
  fills: [
    { id: "funk_turn", name: "Funky Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11)
    )},
    { id: "funk_roll", name: "Roll Last Beat", description: "Light roll (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )},
    { id: "funk_zip", name: "Zipper", description: "Zipper retrigs (offsets).", steps: A(
      r(off(8),2),r(off(9),2),r(off(10),2),r(off(11),2),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "funk_backhint", name: "Back Hint", description: "Tiny rewind hint (offsets).", steps: A(
      off(15),off(14),off(13),off(12),
      off(12),off(13),off(14),off(15),
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15)
    )},
    { id: "funk_gate", name: "Gate Flicker", description: "Gate flicker (offsets).", steps: repeatFillCell(
      [off(0),off(1),off(0),off(1)], 4
    )},
    { id: "funk_stop", name: "Stop + Hit", description: "Air then hit (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "funk_chatter", name: "Tail Chatter", description: "Tail chatter (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(14),2),r(off(15),2),r(off(15),4),off(15),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "funk_bounce", name: "Bounce Fill", description: "Bouncy repeat fill (offsets).", steps: A(
      off(0),off(1),off(0),off(1),
      off(4),off(5),off(4),off(5),
      off(8),off(9),off(8),off(9),
      off(12),off(13),r(off(14),2),r(off(15),2)
    )}
  ]
};

// ---------- Ambient / Glitch ----------
const AMBIENT_GLITCH: PatternPack = {
  id: "ambient_glitch",
  name: "Ambient / Glitch",
  vibe: "Minimal motion, gentle repeats, glitchy micro-echoes (no hard aggression).",
  defaultTempoBpm: 90,
  stepGrid: "16ths",
  allowRetrig32nds: true,
  mains: [
    { id: "amb_straight", name: "Straight Drift", description: "Reference straight playback.", steps: STRAIGHT_32 },
    { id: "amb_slowgate", name: "Slow Gate", description: "Repeats in long blocks (soft stutter).", steps: A(
      0,0,0,0, 4,4,4,4, 8,8,8,8, 12,12,12,12,
      16,16,16,16, 20,20,20,20, 24,24,24,24, 28,28,28,28
    )},
    { id: "amb_echo", name: "Echo Steps", description: "Micro repeats that feel like echo taps.", steps: A(
      0,1,1,2, 4,5,5,6, 8,9,9,10, 12,13,13,14,
      16,17,17,18, 20,21,21,22, 24,25,25,26, 28,29,29,30
    )},
    { id: "amb_refrain", name: "Refrain Bloom", description: "Repeats bar 1 twice for meditative loop.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15,
      0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14,15
    )},
    { id: "amb_call", name: "Call / Answer", description: "Motif + answer; gentle.", steps: A(
      0,1,2,3, 8,9,10,11, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 24,25,26,27, 20,21,22,23, 28,29,30,31
    )},
    { id: "amb_softjump", name: "Soft Jumpback", description: "Light jumpbacks for glitch texture.", steps: A(
      0,1,2,3, 4,5,6,7, 4,5,6,7, 12,13,14,15,
      16,17,18,19, 20,21,22,23, 20,21,22,23, 28,29,30,31
    )},
    { id: "amb_micro", name: "Micro Echo", description: "Tiny retrigs sprinkled lightly.", steps: A(
      0,1,2,3, 4,5,6,7, 8,9,10,r(11,2), 12,13,14,15,
      16,17,18,19, 20,21,22,23, 24,25,26,r(27,2), 28,29,30,31
    )},
    { id: "amb_gatecell", name: "Gate Cell", description: "Short cell repeats (subtle).", steps: A(
      0,1,0,1, 2,3,2,3, 4,5,4,5, 6,7,6,7,
      16,17,16,17, 18,19,18,19, 20,21,20,21, 22,23,22,23
    )}
  ],
  fills: [
    { id: "amb_swish", name: "Swish", description: "Light zipper swish (offsets).", steps: A(
      off(8),r(off(9),2),off(10),r(off(11),2),
      off(12),r(off(13),2),off(14),r(off(15),4),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "amb_roll", name: "Soft Roll", description: "Soft roll (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      r(off(12),2),r(off(13),2),r(off(14),2),r(off(15),4),
      off(12),off(13),off(14),off(15)
    )},
    { id: "amb_turn", name: "Turnaround", description: "Turnaround phrase (offsets).", steps: A(
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15),
      off(4),off(5),off(6),off(7),
      off(8),off(9),off(10),off(11)
    )},
    { id: "amb_backhint", name: "Back Hint", description: "Tiny back hint (offsets).", steps: A(
      off(15),off(14),off(13),off(12),
      off(12),off(13),off(14),off(15),
      off(8),off(9),off(10),off(11),
      off(12),off(13),off(14),off(15)
    )},
    { id: "amb_gate", name: "Gate Flicker", description: "Gate flicker (offsets).", steps: repeatFillCell(
      [off(0),off(1),off(0),off(1)], 4
    )},
    { id: "amb_stop", name: "Air & Return", description: "Air then return (offsets).", steps: A(
      off(8),off(8),off(8),off(8),
      off(8),off(8),off(8),off(8),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "amb_chatter", name: "Tail Chatter", description: "Tail chatter (offsets).", steps: A(
      off(12),off(13),off(14),off(15),
      r(off(14),2),r(off(15),2),r(off(15),4),off(15),
      off(12),off(13),off(14),off(15),
      off(12),off(13),off(14),off(15)
    )},
    { id: "amb_bounce", name: "Gentle Bounce", description: "Soft bounce (offsets).", steps: A(
      off(0),off(1),off(0),off(1),
      off(4),off(5),off(4),off(5),
      off(8),off(9),off(8),off(9),
      off(12),off(13),r(off(14),2),r(off(15),2)
    )}
  ]
};

// ============================================================================
// EXPORTS
// ============================================================================

export const PATTERN_PACKS: PatternPack[] = [
  DNB_JUNGLE,
  HOUSE,
  TRAP,
  UKG,
  TECHNO,
  HIPHOP,
  BREAKS,
  DUBSTEP,
  LIQUID_DNB,
  NEUROFUNK,
  HARDCORE_RAVE,
  DRILL,
  REGGAETON,
  FOOTWORK,
  FUNK_DISCO,
  AMBIENT_GLITCH
];

export const PATTERN_PACKS_BY_ID: Record<string, PatternPack> = Object.fromEntries(
  PATTERN_PACKS.map((p) => [p.id, p])
);

// Convert fill offsets -> absolute indices for the current bar
export function resolveFillOffsets(fillSteps: StepEvent[], barStart: 0 | 16): StepEvent[] {
  return fillSteps.map((s) => {
    if (s == null) return null;
    if (typeof s === "number") {
      if (s >= ROLE_BASE) return s;
      return clamp32(s + barStart);
    }
    if (s.i >= ROLE_BASE) return s;
    return { ...s, i: clamp32(s.i + barStart) };
  });
}
