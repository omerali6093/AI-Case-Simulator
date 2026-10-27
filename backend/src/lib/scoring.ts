/** Scoring is decided here, on the server. The client only ever sends which step was chosen. */
export const MAX_SCORE = 100;
export const POINTS_PER_LEVEL = 250;

export interface StepDoc {
  id: string;
  label: string;
  points: number;
  feedback: string;
}

export function findStep<T extends StepDoc>(steps: T[], stepId: string): T | undefined {
  return steps.find((s) => s.id === stepId);
}

export function levelFor(totalPoints: number): number {
  return 1 + Math.floor(Math.max(0, totalPoints) / POINTS_PER_LEVEL);
}

export interface ProgressSummary {
  totalPoints: number;
  level: number;
  completed: number;
  averageScore: number;
}

export function summarise(totalPoints: number, completed: number): ProgressSummary {
  return {
    totalPoints,
    level: levelFor(totalPoints),
    completed,
    averageScore: completed === 0 ? 0 : Math.round((totalPoints / completed) * 10) / 10,
  };
}
