import type { LoopSelection } from "./slicing.js";

export type Pattern = {
  name: string;
  steps: number[];
  swing: number;
  reverse?: boolean;
};

const emptySteps = (count: number) => Array.from({ length: count }, () => -1);

export const buildPatterns = (sliceCount: number, loop: LoopSelection, subdivision: number): Pattern[] => {
  const totalSteps = Math.max(1, Math.round(loop.bars * subdivision));
  const clampIndex = (value: number) => Math.max(0, Math.min(sliceCount - 1, value));
  const setStep = (steps: number[], index: number, value: number) => {
    if (index < 0 || index >= totalSteps) return;
    steps[index] = value;
  };

  const straight = Array.from({ length: totalSteps }, (_, i) => clampIndex(i % sliceCount));

  const twoStep = emptySteps(totalSteps);
  for (let bar = 0; bar < loop.bars; bar += 1) {
    const barStart = bar * subdivision;
    setStep(twoStep, barStart, clampIndex(barStart % sliceCount));
    setStep(twoStep, barStart + subdivision / 2, clampIndex((barStart + subdivision / 2) % sliceCount));
    setStep(twoStep, barStart + subdivision / 4, clampIndex((barStart + subdivision / 4) % sliceCount));
  }

  const stutter = emptySteps(totalSteps);
  const stutterIndex = clampIndex(Math.min(8, sliceCount - 1));
  for (let i = 0; i < totalSteps; i += 1) {
    if (i % 4 === 0) {
      stutter[i] = clampIndex(i % sliceCount);
    } else if (i % 4 === 2) {
      stutter[i] = stutterIndex;
    }
  }

  const backbeat = emptySteps(totalSteps);
  for (let bar = 0; bar < loop.bars; bar += 1) {
    const barStart = bar * subdivision;
    setStep(backbeat, barStart, clampIndex(barStart % sliceCount));
    setStep(backbeat, barStart + subdivision / 2, clampIndex((barStart + subdivision / 2) % sliceCount));
    setStep(backbeat, barStart + (subdivision * 3) / 4, clampIndex((barStart + (subdivision * 3) / 4) % sliceCount));
  }

  const sparse = emptySteps(totalSteps);
  for (let i = 0; i < totalSteps; i += subdivision / 2) {
    sparse[i] = clampIndex((i * 2) % sliceCount);
  }

  const shuffle = emptySteps(totalSteps);
  for (let i = 0; i < totalSteps; i += 1) {
    if (i % 2 === 0) {
      shuffle[i] = clampIndex(i % sliceCount);
    }
  }

  const bounce = emptySteps(totalSteps);
  for (let i = 0; i < totalSteps; i += 1) {
    if (i % 3 === 0) {
      bounce[i] = clampIndex((i + 2) % sliceCount);
    }
  }

  const rush = emptySteps(totalSteps);
  for (let i = 0; i < totalSteps; i += 1) {
    if (i % 2 === 0) {
      rush[i] = clampIndex((i + 5) % sliceCount);
    } else if (i % 4 === 1) {
      rush[i] = clampIndex((i + 1) % sliceCount);
    }
  }

  return [
    { name: "Straight 16s", steps: straight, swing: 0 },
    { name: "2-Step Emphasis", steps: twoStep, swing: 0.05 },
    { name: "Stutter Amen", steps: stutter, swing: 0 },
    { name: "Backbeat Push", steps: backbeat, swing: 0.03 },
    { name: "Sparse Half", steps: sparse, swing: 0.02 },
    { name: "Shuffle Ghosts", steps: shuffle, swing: 0.12 },
    { name: "Bounce Cut", steps: bounce, swing: 0.08 },
    { name: "Rush Fill", steps: rush, swing: 0.1, reverse: true }
  ];
};
