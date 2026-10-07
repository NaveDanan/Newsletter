// Bounded read cache. Keys include the backend and authenticated identity at the
// call site. Writes/invalidation detach pending reads so an old response cannot
// overwrite a mutation or cross an account boundary.
interface Entry<T> { value?: T; updatedAt: number; pending?: Promise<T> }
export class QueryCache {
  private entries = new Map<string, Entry<unknown>>();
  private invalidationRevision = 0;
  get revision(): number { return this.invalidationRevision; }
  private readonly capacity: number;
  private readonly now: () => number;
  constructor(capacity = 64, now = Date.now) { this.capacity = capacity; this.now = now; }

  peek<T>(key: string, maxAge = 30_000): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.value === undefined || this.now() - entry.updatedAt > maxAge) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, updatedAt: this.now() });
    this.trim();
  }

  /** Hydrate browser storage without detaching an already-running validation. */
  prime<T>(key: string, value: T): void {
    const entry = this.entries.get(key);
    if (!entry) { this.set(key, value); return; }
    if (entry.value === undefined) { entry.value = value; entry.updatedAt = this.now(); }
  }

  read<T>(key: string, load: () => Promise<T>, { maxAge = 30_000, force = false } = {}): Promise<T> {
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (existing?.pending) return existing.pending;
    const value = this.peek<T>(key, maxAge);
    if (!force && value !== undefined) return Promise.resolve(value);
    const entry: Entry<T> = existing ?? { updatedAt: 0 };
    this.entries.set(key, entry);
    const pending = Promise.resolve().then(load).then((next) => {
      if (this.entries.get(key) === entry) {
        entry.value = next; entry.updatedAt = this.now();
      }
      return next;
    }).finally(() => {
      if (entry.pending === pending) delete entry.pending;
    });
    entry.pending = pending;
    this.trim();
    return pending;
  }

  invalidate(prefix = ''): void {
    this.invalidationRevision++;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }

  private trim() {
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
}
