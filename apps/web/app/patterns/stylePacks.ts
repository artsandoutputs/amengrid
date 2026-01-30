export type PatternKind = "main" | "fill";

export type Pattern = {
  id: string;
  name: string;
  kind: PatternKind;
  bars: number;
  order: number[];
};

export type PatternGroupId = "DNB" | "JUNGLE" | "TRAP" | "HOUSE";

export type PatternGroup = {
  id: PatternGroupId;
  label: string;
  mains: Pattern[];
  fills: Pattern[];
};

const clampIndex = (index: number, length: number) => {
  if (index < 0) return -1;
  const mod = index % length;
  return mod < 0 ? mod + length : mod;
};

const mapBar = (offset: number, steps: number[]) =>
  steps.map((value) => (value < 0 ? -1 : value + offset));

const concatBars = (...bars: number[][]) => bars.flat();

const normalize = (order: number[], maxIndex: number) =>
  order.map((value) => clampIndex(value, maxIndex + 1));

const main = (id: string, name: string, bars: number, order: number[]) => ({
  id,
  name,
  kind: "main" as const,
  bars,
  order
});

const fill = (id: string, name: string, order: number[]) => ({
  id,
  name,
  kind: "fill" as const,
  bars: 1,
  order: normalize(order, 15)
});

const straight = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
const bounce = [0,1,4,1,8,9,4,12,0,1,4,1,14,15,12,8];
const backjump = [0,1,2,3,4,1,2,3,8,9,6,7,12,13,10,11];
const roll = [0,1,2,3,4,5,6,7,8,9,7,8,12,13,14,15];
const doubleTime = [0,0,1,1,2,2,3,3,8,8,9,9,10,10,11,11];
const halftime = [0,1,2,3, -1,-1,-1,-1, 8,9,10,11, 12,13,14,15];
const tailChew = [0,1,2,3,4,5,6,7,8,9,10,11,12,12,13,13];
const classic = [0,1,4,1,8,9,10,11,0,1,4,1,14,15,12,8];

const dnbMains = [
  main(
    "dnb-straight-amen",
    "Straight Amen",
    4,
    concatBars(
      mapBar(0, straight),
      mapBar(16, backjump),
      mapBar(32, straight),
      mapBar(48, tailChew)
    )
  ),
  main(
    "dnb-think-bounce",
    "Think Bounce",
    4,
    concatBars(
      mapBar(0, bounce),
      mapBar(16, bounce),
      mapBar(32, backjump),
      mapBar(48, bounce)
    )
  ),
  main(
    "dnb-backjump-45",
    "Backjump 45",
    4,
    concatBars(
      mapBar(0, backjump),
      mapBar(16, backjump),
      mapBar(32, backjump),
      mapBar(48, backjump)
    )
  ),
  main(
    "dnb-apache-roll",
    "Apache Roll",
    4,
    concatBars(
      mapBar(0, roll),
      mapBar(16, roll),
      mapBar(32, roll),
      mapBar(48, roll)
    )
  ),
  main(
    "dnb-double-time",
    "Double Time",
    4,
    concatBars(
      mapBar(0, doubleTime),
      mapBar(16, doubleTime),
      mapBar(32, doubleTime),
      mapBar(48, doubleTime)
    )
  ),
  main(
    "dnb-half-step",
    "Half Step Pull",
    4,
    concatBars(
      mapBar(0, halftime),
      mapBar(16, halftime),
      mapBar(32, bounce),
      mapBar(48, tailChew)
    )
  ),
  main(
    "dnb-tail-chewer",
    "Tail Chewer",
    4,
    concatBars(
      mapBar(0, tailChew),
      mapBar(16, tailChew),
      mapBar(32, tailChew),
      mapBar(48, tailChew)
    )
  ),
  main(
    "dnb-classic-rinse",
    "Classic Rinse",
    4,
    concatBars(
      mapBar(0, classic),
      mapBar(16, bounce),
      mapBar(32, backjump),
      mapBar(48, classic)
    )
  )
].map((pattern) => ({
  ...pattern,
  order: normalize(pattern.order, 63)
}));

const dnbFills = [
  fill("dnb-snare-rush", "Snare Rush", [7,7,7,7, 8,8,8,8, 9,9,9,9, 10,11,12,13]),
  fill("dnb-reverse-slam", "Reverse Slam", [15,14,13,12, 11,10,9,8, 7,6,5,4, 3,2,1,0]),
  fill("dnb-stutter-drop", "Stutter Drop", [12,12,12,12, 12,12,12,12, 8,9,10,11, 12,13,14,15]),
  fill("dnb-jungle-triplet", "Jungle Triplet", [0,1,2, 4,5,6, 8,9,10, 12,13,14, 12,13,14,15]),
  fill("dnb-tape-stop", "Tape Stop", [0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,14, -1]),
  fill("dnb-roll-up", "Roll Up", [12,12,13,13, 12,12,13,13, 14,14,15,15, 14,15,14,15]),
  fill("dnb-backspin", "Backspin", [15,14,13,12, 11,10,9,8, 7,6,5,4, 3,2,1,0]),
  fill("dnb-ghost-hit", "Ghost Hit", [-1,-1,8,-1, -1,10,-1,-1, 12,-1,-1,14, -1,15,-1,-1])
];

const jungleMains = [
  main(
    "jun-sparse-amen",
    "Sparse Amen",
    4,
    concatBars(
      mapBar(0, halftime),
      mapBar(16, backjump),
      mapBar(32, halftime),
      mapBar(48, tailChew)
    )
  ),
  main(
    "jun-ghost-kick",
    "Ghost Kick",
    4,
    concatBars(
      mapBar(0, [0,1,-1,-1, 4,5,-1,-1, 8,9,-1,-1, 12,13,-1,-1]),
      mapBar(16, [0,1,-1,2, 4,-1,-1,6, 8,9,-1,-1, 12,-1,14,15]),
      mapBar(32, [0,-1,2,3, -1,5,6,-1, 8,-1,10,11, -1,13,14,15]),
      mapBar(48, [0,1,-1,3, 4,-1,6,7, -1,9,10,-1, 12,13,-1,15])
    )
  ),
  main(
    "jun-swing-pull",
    "Swing Pull",
    4,
    concatBars(
      mapBar(0, backjump),
      mapBar(16, bounce),
      mapBar(32, backjump),
      mapBar(48, bounce)
    )
  ),
  main(
    "jun-broken-march",
    "Broken March",
    4,
    concatBars(
      mapBar(0, [0,2,4,2, 6,4,6,8, 8,10,12,10, 12,14,15,14]),
      mapBar(16, [0,2,4,2, 6,4,6,8, 8,10,12,10, 12,14,15,14]),
      mapBar(32, [0,1,4,1, 6,7,4,7, 8,9,12,9, 12,14,15,14]),
      mapBar(48, [0,2,4,2, 6,4,6,8, 8,10,12,10, 12,14,15,14])
    )
  ),
  main(
    "jun-oldskool",
    "Oldskool Loop",
    4,
    concatBars(
      mapBar(0, classic),
      mapBar(16, straight),
      mapBar(32, classic),
      mapBar(48, straight)
    )
  ),
  main(
    "jun-sound-system",
    "Sound System",
    4,
    concatBars(
      mapBar(0, bounce),
      mapBar(16, [0,1,4,1, 8,9,4,12, 0,1,4,1, 14,15,12,8]),
      mapBar(32, [0,1,2,3, 4,1,2,3, 8,9,6,7, 12,13,10,11]),
      mapBar(48, tailChew)
    )
  ),
  main(
    "jun-rude-boy",
    "Rude Boy",
    4,
    concatBars(
      mapBar(0, bounce),
      mapBar(16, backjump),
      mapBar(32, bounce),
      mapBar(48, backjump)
    )
  ),
  main(
    "jun-dub-plate",
    "Dub Plate",
    4,
    concatBars(
      mapBar(0, [0,1,2,3, 4,-1,-1,7, 8,9,-1,-1, 12,13,14,15]),
      mapBar(16, [0,1,-1,-1, 4,5,-1,-1, 8,9,10,-1, 12,13,-1,-1]),
      mapBar(32, [0,1,2,3, 4,5,6,7, 8,9,-1,-1, 12,13,14,-1]),
      mapBar(48, [0,-1,-1,3, 4,5,-1,-1, 8,9,10,11, 12,-1,14,15])
    )
  )
].map((pattern) => ({
  ...pattern,
  order: normalize(pattern.order, 63)
}));

const jungleFills = [
  fill("jun-drop-out", "Drop Out", [-1,-1,-1,-1, 8,9,10,11, -1,-1,12,13, 14,15,-1,-1]),
  fill("jun-echo-stab", "Echo Stab", [8,8,-1,8, 9,9,-1,9, 10,10,-1,10, 12,12,-1,12]),
  fill("jun-snare-fall", "Snare Fall", [12,12,11,11, 10,10,9,9, 8,8,7,7, 6,6,5,5]),
  fill("jun-reverse-echo", "Reverse Echo", [15,14,15,14, 13,12,13,12, 11,10,11,10, 9,8,9,8]),
  fill("jun-vinyl-rip", "Vinyl Rip", [15,14,13,12, 11,10,9,8, 7,6,5,4, -1,-1,-1,-1]),
  fill("jun-delay-tail", "Delay Tail", [12,12,-1,12, 13,13,-1,13, 14,14,-1,14, 15,15,-1,15]),
  fill("jun-rewind", "Rewind", [0,1,2,3, 4,5,6,7, 7,6,5,4, 3,2,1,0]),
  fill("jun-one-drop", "One Drop", [-1,-1,8,-1, -1,-1,10,-1, -1,-1,12,-1, 14,15,-1,-1])
];

const trapMains = [
  main(
    "trap-stomp",
    "Stomp Loop",
    2,
    concatBars(mapBar(0, bounce), mapBar(16, bounce))
  ),
  main(
    "trap-triplet-drag",
    "Triplet Drag",
    2,
    concatBars(
      mapBar(0, [0,1,2, 4,5,6, 8,9,10, 12,13,14, 12,13,14,15]),
      mapBar(16, [0,1,2, 4,5,6, 8,9,10, 12,13,14, 12,13,14,15])
    )
  ),
  main(
    "trap-call-answer",
    "Call & Answer",
    2,
    concatBars(mapBar(0, [0,1,2,3, 8,9,10,11, 0,1,2,3, 8,9,10,11]), mapBar(16, straight))
  ),
  main(
    "trap-minimal-bounce",
    "Minimal Bounce",
    2,
    concatBars(mapBar(0, halftime), mapBar(16, bounce))
  ),
  main(
    "trap-slide-pull",
    "Slide Pull",
    2,
    concatBars(mapBar(0, backjump), mapBar(16, backjump))
  ),
  main(
    "trap-sparse-drill",
    "Sparse Drill",
    2,
    concatBars(
      mapBar(0, [0,-1,-1,3, 4,-1,6,-1, 8,-1,-1,11, 12,-1,14,-1]),
      mapBar(16, [0,-1,2,-1, 4,-1,-1,7, 8,-1,10,-1, 12,-1,14,15])
    )
  ),
  main(
    "trap-slow-roll",
    "Slow Roll",
    2,
    concatBars(mapBar(0, doubleTime), mapBar(16, doubleTime))
  ),
  main(
    "trap-glitch-march",
    "Glitch March",
    2,
    concatBars(mapBar(0, [0,1,4,1, 6,7,4,7, 8,9,12,9, 12,14,15,14]), mapBar(16, backjump))
  )
].map((pattern) => ({
  ...pattern,
  order: normalize(pattern.order, 31)
}));

const trapFills = [
  fill("trap-vocal-roll", "Vocal Roll", [8,8,8,8, 9,9,9,9, 10,10,10,10, 11,12,13,14]),
  fill("trap-pitch-dive", "Pitch Dive", [15,14,13,12, 11,10,9,8, 7,6,5,4, 3,2,1,0]),
  fill("trap-chop-stutter", "Chop Stutter", [12,12,12,12, 8,8,8,8, 10,10,10,10, 12,12,12,12]),
  fill("trap-silence-hit", "Silence Hit", [-1,-1,-1,-1, 8,9,-1,-1, -1,-1,12,-1, 14,15,-1,-1]),
  fill("trap-reverse-pop", "Reverse Pop", [15,14,13,12, 12,13,14,15, 11,10,9,8, 7,6,5,4]),
  fill("trap-tape-dip", "Tape Dip", [8,8,7,7, 6,6,5,5, 4,4,3,3, 2,2,1,1]),
  fill("trap-stop-hit", "Stop Hit", [0,1,2,3, 4,5,6,7, -1,-1,-1,-1, 12,13,14,15]),
  fill("trap-micro-fill", "Micro Fill", [12,12,13,13, 12,12,13,13, 14,14,15,15, 14,15,14,15])
];

const houseMains = [
  main(
    "house-four-floor",
    "Four Floor",
    2,
    concatBars(mapBar(0, straight), mapBar(16, straight))
  ),
  main(
    "house-shuffle-loop",
    "Shuffle Loop",
    2,
    concatBars(mapBar(0, backjump), mapBar(16, backjump))
  ),
  main(
    "house-filter-bounce",
    "Filter Bounce",
    2,
    concatBars(mapBar(0, bounce), mapBar(16, bounce))
  ),
  main(
    "house-swing-pump",
    "Swing Pump",
    2,
    concatBars(mapBar(0, roll), mapBar(16, roll))
  ),
  main(
    "house-disco-chop",
    "Disco Chop",
    2,
    concatBars(mapBar(0, classic), mapBar(16, classic))
  ),
  main(
    "house-groove-pull",
    "Groove Pull",
    2,
    concatBars(mapBar(0, tailChew), mapBar(16, tailChew))
  ),
  main(
    "house-late-clap",
    "Late Clap",
    2,
    concatBars(mapBar(0, [0,1,2,3, 4,5,6,7, 8,9,10,11, 12,13,12,13]), mapBar(16, straight))
  ),
  main(
    "house-hihat-flow",
    "HiHat Flow",
    2,
    concatBars(mapBar(0, roll), mapBar(16, roll))
  )
].map((pattern) => ({
  ...pattern,
  order: normalize(pattern.order, 31)
}));

const houseFills = [
  fill("house-clap-rush", "Clap Rush", [12,12,12,12, 12,12,12,12, 10,11,12,13, 14,15,14,15]),
  fill("house-snare-lift", "Snare Lift", [8,9,10,11, 9,10,11,12, 10,11,12,13, 12,13,14,15]),
  fill("house-open-hat", "Open Hat", [0,1,2,3, 4,5,6,7, 8,9,10,11, 15,15,15,15]),
  fill("house-reverse-wash", "Reverse Wash", [15,14,13,12, 11,10,9,8, 7,6,5,4, 3,2,1,0]),
  fill("house-drum-fill", "Drum Fill", [0,1,4,1, 8,9,4,12, 0,1,4,1, 14,15,12,8]),
  fill("house-drop-silence", "Drop Silence", [-1,-1,-1,-1, -1,-1,8,9, 10,11,-1,-1, 12,13,14,15]),
  fill("house-kick-roll", "Kick Roll", [0,0,0,0, 4,4,4,4, 8,8,8,8, 12,12,12,12]),
  fill("house-build-snap", "Build Snap", [12,13,12,13, 12,13,12,13, 14,14,15,15, 14,15,14,15])
];

export const patternGroups: PatternGroup[] = [
  { id: "DNB", label: "DnB / Jungle", mains: dnbMains, fills: dnbFills },
  { id: "JUNGLE", label: "Jungle", mains: jungleMains, fills: jungleFills },
  { id: "TRAP", label: "Trap", mains: trapMains, fills: trapFills },
  { id: "HOUSE", label: "House", mains: houseMains, fills: houseFills }
];
