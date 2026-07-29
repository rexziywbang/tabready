export interface ReviewMatchCandidate {
  primaryKey: string;
  sourceLocation: string;
}

export function matchReviewCandidates(
  previous: ReviewMatchCandidate[],
  fresh: ReviewMatchCandidate[],
  previousPopulation: ReviewMatchCandidate[] = previous,
  freshPopulation: ReviewMatchCandidate[] = fresh,
): Array<{ previousIndex: number; freshIndex: number }> {
  const previousByKey = new Map<string, number[]>();
  const freshByKey = new Map<string, number[]>();

  previous.forEach((candidate, index) => {
    previousByKey.set(candidate.primaryKey, [
      ...(previousByKey.get(candidate.primaryKey) ?? []),
      index,
    ]);
  });
  fresh.forEach((candidate, index) => {
    freshByKey.set(candidate.primaryKey, [
      ...(freshByKey.get(candidate.primaryKey) ?? []),
      index,
    ]);
  });
  const previousPopulationCounts = new Map<string, number>();
  const freshPopulationCounts = new Map<string, number>();
  for (const candidate of previousPopulation) {
    previousPopulationCounts.set(
      candidate.primaryKey,
      (previousPopulationCounts.get(candidate.primaryKey) ?? 0) + 1,
    );
  }
  for (const candidate of freshPopulation) {
    freshPopulationCounts.set(
      candidate.primaryKey,
      (freshPopulationCounts.get(candidate.primaryKey) ?? 0) + 1,
    );
  }

  const matches: Array<{ previousIndex: number; freshIndex: number }> = [];
  for (const [primaryKey, freshIndexes] of freshByKey) {
    const previousIndexes = previousByKey.get(primaryKey) ?? [];
    const uniqueInBothPopulations =
      previousPopulationCounts.get(primaryKey) === 1 &&
      freshPopulationCounts.get(primaryKey) === 1;
    if (
      uniqueInBothPopulations &&
      previousIndexes.length === 1 &&
      freshIndexes.length === 1
    ) {
      matches.push({
        previousIndex: previousIndexes[0],
        freshIndex: freshIndexes[0],
      });
      continue;
    }

    const previousBySource = new Map<string, number[]>();
    for (const previousIndex of previousIndexes) {
      const location = previous[previousIndex].sourceLocation;
      if (!location) continue;
      previousBySource.set(location, [
        ...(previousBySource.get(location) ?? []),
        previousIndex,
      ]);
    }
    for (const freshIndex of freshIndexes) {
      const location = fresh[freshIndex].sourceLocation;
      if (!location) continue;
      const candidates = previousBySource.get(location);
      const previousIndex = candidates?.shift();
      if (previousIndex === undefined) continue;
      matches.push({ previousIndex, freshIndex });
    }
  }
  return matches;
}
