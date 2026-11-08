export type EventId = string;
export type DeviceId = string;
export type GroupId = string;

export type GroupCreated = {
  readonly kind: 'group.created';
  readonly id: EventId;
  readonly deviceId: DeviceId;
  readonly seq: number;
  readonly at: number;
  readonly groupId: GroupId;
  readonly name: string;
};

export type LedgerEvent = GroupCreated;
