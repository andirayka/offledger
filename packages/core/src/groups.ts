import type { GroupId, LedgerEvent } from './events';

export type Group = {
  readonly id: GroupId;
  readonly name: string;
  readonly createdAt: number;
};

export function deriveGroups(events: readonly LedgerEvent[]): Group[] {
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const event of events.toSorted(compareLogOrder)) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    groups.push({ id: event.groupId, name: event.name, createdAt: event.at });
  }
  return groups;
}

function compareLogOrder(a: LedgerEvent, b: LedgerEvent): number {
  if (a.at !== b.at) return a.at - b.at;
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
  return a.seq - b.seq;
}
