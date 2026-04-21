const STEP = 1000;

export const positionBetween = (
  prev: number | undefined,
  next: number | undefined,
): number => {
  if (prev === undefined && next === undefined) return STEP;
  if (prev === undefined && next !== undefined) return next - STEP;
  if (prev !== undefined && next === undefined) return prev + STEP;
  return (prev! + next!) / 2;
};
