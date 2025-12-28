import { useEffect, useState } from "react";
import type { CanonicalMapState } from "../../../types/canonicalization";

export const useCanonicalMap = (initial: Record<string, CanonicalMapState>) => {
  const [map, setMap] = useState<Record<string, CanonicalMapState>>(initial);

  useEffect(() => {
    setMap(initial);
  }, [initial]);

  const updateMap = (columnName: string, value: CanonicalMapState) => {
    setMap((prev) => ({ ...prev, [columnName]: value }));
  };

  return { map, updateMap } as const;
};
