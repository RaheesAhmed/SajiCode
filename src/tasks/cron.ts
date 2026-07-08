/**
 * Minimal 5-field cron matcher (minute hour dom month dow).
 * Supports *, numbers, and comma lists — enough for heartbeat schedules.
 */
export function isCronDue(
  expression: string,
  date: Date = new Date(),
  lastRun?: Date,
): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dom, month, dow] = parts;
  const checks: Array<[string, number]> = [
    [minute!, date.getMinutes()],
    [hour!, date.getHours()],
    [dom!, date.getDate()],
    [month!, date.getMonth() + 1],
    [dow!, date.getDay()],
  ];

  for (const [field, value] of checks) {
    if (!fieldMatches(field, value)) return false;
  }

  if (lastRun) {
    const sameMinute =
      lastRun.getFullYear() === date.getFullYear()
      && lastRun.getMonth() === date.getMonth()
      && lastRun.getDate() === date.getDate()
      && lastRun.getHours() === date.getHours()
      && lastRun.getMinutes() === date.getMinutes();
    if (sameMinute) return false;
  }

  return true;
}

function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;

  return field.split(",").some((part) => {
    const num = Number.parseInt(part.trim(), 10);
    return !Number.isNaN(num) && num === value;
  });
}

export function parseIntervalMs(input: string): number | null {
  const match = input.trim().match(/^(\d+)\s*(m|h|d)$/i);
  if (!match) return null;

  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 3_600_000;
  if (unit === "d") return amount * 86_400_000;
  return null;
}
