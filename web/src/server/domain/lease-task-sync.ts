// Compute the desired lease task set before the atomic database upsert. The DB
// independently preserves status on conflict, including concurrent owner edits.
export interface LeaseTaskDraft {
  task_key: string; lane: string; title: string; detail: string | null;
  due_date: string | null; source: string | null;
}
export interface SavedLeaseTask extends LeaseTaskDraft { status: string }
export function reconcileLeaseTasks(existing: SavedLeaseTask[], proposed: LeaseTaskDraft[]): SavedLeaseTask[] {
  const previous = new Map(existing.map(t => [t.task_key, t]));
  const desired = new Map(proposed.map(t => [t.task_key, { ...t, status: previous.get(t.task_key)?.status ?? "todo" }]));
  for (const task of existing) {
    if (task.status === "done" && !desired.has(task.task_key)) desired.set(task.task_key, task);
  }
  return [...desired.values()];
}
