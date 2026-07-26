import type { EnsoEvent, MonthlyRecord } from "./types.ts";

export async function loadData(): Promise<{ records: MonthlyRecord[]; events: EnsoEvent[] }> {
  const [records, events] = await Promise.all([
    fetch("/data/enso-monthly.json").then((r) => r.json() as Promise<MonthlyRecord[]>),
    fetch("/data/enso-events.json").then((r) => r.json() as Promise<EnsoEvent[]>),
  ]);
  return { records, events };
}
