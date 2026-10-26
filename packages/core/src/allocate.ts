/**
 * Splits `total` minor units (cents) into `parts` integer shares.
 * Shares differ by at most one cent, and leftover cents go to the earliest parts.
 * A negative total is split as the mirror image of the positive one.
 */
export function allocate(total: number, parts: number): number[] {
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`allocate: total must be a safe integer of minor units, got ${total}`);
  }
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new RangeError(`allocate: parts must be a positive integer, got ${parts}`);
  }
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const base = Math.floor(magnitude / parts);
  const leftover = magnitude % parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < leftover ? 1 : 0)) || 0);
}
