type Entity = { id: string };

export interface EntityChange<T extends Entity> {
  id: string;
  before?: T;
  after?: T;
  beforeIndex: number;
  afterIndex: number;
}

export function entityChanges<T extends Entity>(before: T[], after: T[]): EntityChange<T>[] {
  const beforeById = new Map(before.map((entity, index) => [entity.id, { entity, index }]));
  const afterById = new Map(after.map((entity, index) => [entity.id, { entity, index }]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const changes: EntityChange<T>[] = [];
  for (const id of ids) {
    const previous = beforeById.get(id);
    const next = afterById.get(id);
    if (previous?.entity === next?.entity) continue;
    changes.push({
      id,
      before: previous?.entity,
      after: next?.entity,
      beforeIndex: previous?.index ?? -1,
      afterIndex: next?.index ?? -1,
    });
  }
  return changes;
}

export function applyEntityChanges<T extends Entity>(
  current: T[],
  changes: readonly EntityChange<T>[],
  direction: "before" | "after",
): T[] {
  if (!changes.length) return current;
  const changedIds = new Set(changes.map(({ id }) => id));
  const result = current.filter(({ id }) => !changedIds.has(id));
  const insertions = changes
    .map((change) => ({
      entity: change[direction],
      index: direction === "before" ? change.beforeIndex : change.afterIndex,
    }))
    .filter((entry): entry is { entity: T; index: number } => entry.entity !== undefined)
    .sort((first, second) => first.index - second.index);
  for (const { entity, index } of insertions)
    result.splice(Math.min(Math.max(index, 0), result.length), 0, entity);
  return result;
}

export function mapsEqual<K, V>(first: ReadonlyMap<K, V>, second: ReadonlyMap<K, V>): boolean {
  if (first.size !== second.size) return false;
  for (const [key, value] of first) if (second.get(key) !== value) return false;
  return true;
}
