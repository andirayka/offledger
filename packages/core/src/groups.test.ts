import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GroupCreated } from './events';
import { deriveGroups } from './groups';

fc.configureGlobal({ seed: 20261108, numRuns: 500 });

const event = fc
  .record({
    id: fc.uuid(),
    deviceId: fc.constantFrom('phone-a', 'phone-b'),
    seq: fc.integer({ min: 0, max: 1_000 }),
    at: fc.integer({ min: 1, max: 1_000_000 }),
    groupId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 20 }),
  })
  .map((fields): GroupCreated => ({ kind: 'group.created', ...fields }));
const log = fc.uniqueArray(event, { selector: (e) => e.at, maxLength: 40 });

describe('deriveGroups', () => {
  it('derives one group per creation event, oldest first', () => {
    fc.assert(
      fc.property(log, (events) => {
        const oldestFirst = events.toSorted((a, b) => a.at - b.at);
        expect(deriveGroups(events)).toEqual(
          oldestFirst.map((e) => ({ id: e.groupId, name: e.name, createdAt: e.at })),
        );
      }),
    );
  });

  it('derives the same groups whatever order the events arrive in', () => {
    fc.assert(
      fc.property(log, (events) => {
        expect(deriveGroups(events.toReversed())).toEqual(deriveGroups(events));
      }),
    );
  });

  it('counts an event delivered twice only once', () => {
    fc.assert(
      fc.property(log, (events) => {
        const [first] = events;
        if (!first) return;
        const once = deriveGroups(events);
        expect(deriveGroups([...events, ...events])).toEqual(once);
        expect(deriveGroups([...events, first])).toEqual(once);
      }),
    );
  });

  it('keeps two groups apart when they share a name', () => {
    const at = 1_700_000_000_000;
    const events: GroupCreated[] = [
      {
        kind: 'group.created',
        id: 'e1',
        deviceId: 'phone-a',
        seq: 1,
        at,
        groupId: 'g1',
        name: 'Dinner',
      },
      {
        kind: 'group.created',
        id: 'e2',
        deviceId: 'phone-a',
        seq: 2,
        at: at + 1,
        groupId: 'g2',
        name: 'Dinner',
      },
    ];
    expect(deriveGroups(events)).toEqual([
      { id: 'g1', name: 'Dinner', createdAt: at },
      { id: 'g2', name: 'Dinner', createdAt: at + 1 },
    ]);
  });

  it('shows no groups for an empty log', () => {
    expect(deriveGroups([])).toEqual([]);
  });
});
