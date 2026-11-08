import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

import { deriveGroups, type Group, type GroupCreated, type LedgerEvent } from '@offledger/core';

const logFile = new File(Paths.document, 'ledger.ndjson');
const deviceFile = new File(Paths.document, 'device.json');

let cachedDeviceId: string | null = null;

export async function readGroups(): Promise<Group[]> {
  return deriveGroups(await readEvents());
}

export async function createGroup(name: string): Promise<Group[]> {
  const events = await readEvents();
  const deviceId = await getDeviceId();
  const event: GroupCreated = {
    kind: 'group.created',
    id: Crypto.randomUUID(),
    deviceId,
    seq: nextSeq(events, deviceId),
    at: Date.now(),
    groupId: Crypto.randomUUID(),
    name,
  };
  await appendEvent(event);
  return deriveGroups([...events, event]);
}

async function readEvents(): Promise<LedgerEvent[]> {
  const text = await readText(logFile);
  const lines = text.split('\n');
  const events: LedgerEvent[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line === '') continue;
    try {
      events.push(parseEvent(line));
    } catch (error) {
      const isTornTail = lines.slice(index + 1).every((rest) => rest === '');
      if (!isTornTail) throw error;
    }
  }
  return events;
}

async function appendEvent(event: LedgerEvent): Promise<void> {
  const text = await readText(logFile);
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  if (!logFile.exists) logFile.create({ intermediates: true });
  await logFile.write(`${text}${separator}${JSON.stringify(event)}\n`);
}

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId !== null) return cachedDeviceId;
  const stored = await readText(deviceFile);
  const id = stored === '' ? null : parseDeviceId(stored);
  if (id !== null) {
    cachedDeviceId = id;
    return id;
  }
  const created = Crypto.randomUUID();
  deviceFile.create({ intermediates: true, overwrite: true });
  await deviceFile.write(JSON.stringify({ id: created }));
  cachedDeviceId = created;
  return created;
}

function nextSeq(events: readonly LedgerEvent[], deviceId: string): number {
  return (
    events
      .filter((event) => event.deviceId === deviceId)
      .reduce((highest, event) => Math.max(highest, event.seq), 0) + 1
  );
}

async function readText(file: File): Promise<string> {
  return file.exists ? await file.text() : '';
}

function parseEvent(line: string): LedgerEvent {
  const value: unknown = JSON.parse(line);
  if (typeof value !== 'object' || value === null) {
    throw new Error('ledger line is not an event object');
  }
  const event = value as Record<string, unknown>;
  if (event.kind !== 'group.created') {
    throw new Error(`unknown event kind ${String(event.kind)}`);
  }
  const { id, deviceId, seq, at, groupId, name } = event;
  if (
    typeof id !== 'string' ||
    typeof deviceId !== 'string' ||
    typeof seq !== 'number' ||
    typeof at !== 'number' ||
    typeof groupId !== 'string' ||
    typeof name !== 'string'
  ) {
    throw new Error('malformed group.created event');
  }
  return { kind: 'group.created', id, deviceId, seq, at, groupId, name };
}

function parseDeviceId(stored: string): string | null {
  const value: unknown = JSON.parse(stored);
  if (typeof value !== 'object' || value === null) return null;
  const { id } = value as Record<string, unknown>;
  return typeof id === 'string' && id !== '' ? id : null;
}
