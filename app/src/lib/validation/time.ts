import type { TimeUnit } from "../import/types";

type DetectedTimeType = "numeric" | "datetime" | "invalid";

const unitFactors: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400
};

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const toTimestamp = (value: number | string | Date | null): number | null => {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.valueOf();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.valueOf();
};

export const normalizeTimeToSeconds = ({
  rawValues,
  detectedType,
  selectedUnit,
  declaredUnit
}: {
  rawValues: (number | string | Date | null)[];
  detectedType: DetectedTimeType;
  selectedUnit: TimeUnit;
  declaredUnit?: TimeUnit | null;
}): {
  seconds: number[];
  type: DetectedTimeType;
  excelLike: boolean;
  usedUnit: TimeUnit;
  referenceTimestamp: number | null;
} => {
  if (detectedType === "invalid") {
    return {
      seconds: [],
      type: "invalid",
      excelLike: false,
      usedUnit: declaredUnit ?? selectedUnit,
      referenceTimestamp: null
    };
  }

  if (detectedType === "datetime") {
    const timestamps = rawValues
      .map(toTimestamp)
      .filter((value): value is number => value !== null);
    if (timestamps.length === 0) {
      return {
        seconds: [],
        type: "invalid",
        excelLike: false,
        usedUnit: "seconds",
        referenceTimestamp: null
      };
    }
    const t0 = timestamps[0];
    return {
      seconds: timestamps.map((value) => (value - t0) / 1000),
      type: "datetime",
      excelLike: false,
      usedUnit: "seconds",
      referenceTimestamp: t0
    };
  }

  const numericValues = rawValues
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .filter((value): value is number => value !== null);
  const unit = declaredUnit ?? selectedUnit;
  const excelLike = numericValues.some((value) => {
    const absoluteValue = Math.abs(value);
    const fractionalPart = Math.abs(value % 1);
    return absoluteValue > 1e4 && fractionalPart > 0;
  });

  return {
    seconds: numericValues.map((value) => value * unitFactors[unit]),
    type: "numeric",
    excelLike,
    usedUnit: unit,
    referenceTimestamp: null
  };
};

export type TimeMetrics = {
  points: number;
  minTime: number;
  maxTime: number;
  dtMin: number;
  dtMedian: number;
  monotonic: boolean;
  positiveDiffs: number[];
};

export const computeTimeMetrics = (seconds: number[]): TimeMetrics => {
  if (seconds.length === 0) {
    return {
      points: 0,
      minTime: 0,
      maxTime: 0,
      dtMin: 0,
      dtMedian: 0,
      monotonic: true,
      positiveDiffs: []
    };
  }

  let monotonic = true;
  const diffs: number[] = [];
  const positiveDiffs: number[] = [];

  for (let index = 1; index < seconds.length; index += 1) {
    const diff = seconds[index] - seconds[index - 1];
    diffs.push(diff);
    if (diff <= 0) {
      monotonic = false;
    } else {
      positiveDiffs.push(diff);
    }
  }

  return {
    points: seconds.length,
    minTime: Math.min(...seconds),
    maxTime: Math.max(...seconds),
    dtMin: positiveDiffs.length > 0 ? Math.min(...positiveDiffs) : 0,
    dtMedian: median(positiveDiffs),
    monotonic,
    positiveDiffs
  };
};
