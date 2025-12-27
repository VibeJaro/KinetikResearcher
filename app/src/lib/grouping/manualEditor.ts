import type { ManualGroup } from "./types";

const createId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const moveExperiment = (
  groups: ManualGroup[],
  experimentId: string,
  targetGroupId: string
): ManualGroup[] => {
  return groups.map((group) => {
    if (group.groupId === targetGroupId) {
      if (group.experimentIds.includes(experimentId)) {
        return group;
      }
      return { ...group, experimentIds: [...group.experimentIds, experimentId] };
    }
    return { ...group, experimentIds: group.experimentIds.filter((id) => id !== experimentId) };
  });
};

export const createGroup = (groups: ManualGroup[], name: string): ManualGroup[] => {
  return [...groups, { groupId: createId("group"), name, experimentIds: [], signature: {} }];
};

export const renameGroup = (groups: ManualGroup[], groupId: string, name: string): ManualGroup[] =>
  groups.map((group) => (group.groupId === groupId ? { ...group, name } : group));

export const mergeGroups = (groups: ManualGroup[], groupIds: string[], name: string): ManualGroup[] => {
  const mergedExperiments = groups
    .filter((group) => groupIds.includes(group.groupId))
    .flatMap((group) => group.experimentIds);

  const remaining = groups.filter((group) => !groupIds.includes(group.groupId));
  return [
    ...remaining,
    {
      groupId: createId("group"),
      name,
      experimentIds: mergedExperiments,
      signature: {}
    }
  ];
};

export const splitGroup = (
  groups: ManualGroup[],
  groupId: string,
  partitions: string[][]
): ManualGroup[] => {
  const remaining = groups.filter((group) => group.groupId !== groupId);
  const newGroups: ManualGroup[] = partitions.map((experimentIds, index) => ({
    groupId: createId("group"),
    name: `Split ${index + 1}`,
    experimentIds,
    signature: {}
  }));
  return [...remaining, ...newGroups];
};
