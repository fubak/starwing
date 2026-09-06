/** Tiny pub/sub used for cross-piece communication (hits, kills, dialogue...). */
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.map.get(name)?.delete(fn);
  }
  emit(name, payload) { this.map.get(name)?.forEach((fn) => fn(payload)); }
  clear() { this.map.clear(); }
}
