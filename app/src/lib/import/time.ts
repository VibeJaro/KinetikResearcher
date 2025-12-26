export type TimeColumnType = "numeric" | "datetime";

const DATETIME_THRESHOLD = 10_000_000_000;

export const detectTimeType = (time: number[]): TimeColumnType => {
  if (time.length === 0) {
    return "numeric";
  }
  const datetimeLike = time.filter((value) => Math.abs(value) >= DATETIME_THRESHOLD).length;
  return datetimeLike > 0 ? "datetime" : "numeric";
};

export const normalizeTimeToSeconds = ({
  time,
  timeType
}: {
  time: number[];
  timeType?: TimeColumnType;
}): number[] => {
  if (time.length === 0) {
    return [];
  }

  if (timeType === "datetime") {
    const baseline = Math.min(...time);
    return time.map((value) => (value - baseline) / 1000);
  }

  return [...time];
};
