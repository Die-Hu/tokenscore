const GRADE_THRESHOLDS: [number, string][] = [
  [95, "S+"],
  [90, "S"],
  [85, "A+"],
  [80, "A"],
  [75, "A-"],
  [70, "B+"],
  [65, "B"],
  [60, "B-"],
  [50, "C"],
  [40, "D"],
];

export function assignGrade(score: number): string {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return "F";
}
