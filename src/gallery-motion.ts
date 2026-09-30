export function galleryIndex(offset: number, width: number, length: number) {
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0 || length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.round(offset / width)));
}

// Selection follows native scrollend, never a debounce timer or wheel threshold.
export class GalleryMotion {
  programmed = true;
  blocked = false;
  reported: number | null = null;
  target: number | null = null;
  revision = 0;
  input() { if (!this.blocked) { this.revision++; this.programmed = false; this.target = null; } }
  align() { this.revision++; this.programmed = true; this.reported = null; this.target = null; }
  release(offset: number, width: number, length: number) {
    this.revision++;
    this.target = galleryIndex(offset, width, length);
    return this.target;
  }
  completed(offset: number, width: number, length: number) {
    if (this.blocked || !Number.isFinite(offset) || !Number.isFinite(width) || width <= 0 || length <= 0) return false;
    const index = galleryIndex(offset, width, length);
    // scrollend can be queued by the interrupted drag/animation. It is evidence
    // only when the actual position reaches this release's endpoint.
    return Math.abs(offset - index * width) < 1 && (this.target === null || index === this.target);
  }
  settle(offset: number, width: number, length: number, selected: number, revision = this.revision) {
    if (revision !== this.revision || !this.completed(offset, width, length)) return null;
    const index = galleryIndex(offset, width, length);
    const allowed = !this.blocked && !this.programmed && index !== selected && index !== this.reported;
    this.programmed = false;
    this.target = null;
    if (allowed) this.reported = index;
    return allowed ? index : null;
  }
}

export class GalleryDrag {
  constructor(private axis: 'x' | 'y' = 'x') {}
  origin: { id: number; x: number; y: number; left: number; axis: 'x' | 'y' | null } | null = null;
  get owned() { return this.origin?.axis === this.axis; }
  start(id: number, x: number, y: number, left: number) { this.origin = { id, x, y, left, axis: null }; }
  read(id: number, x: number, y: number) {
    const origin = this.origin;
    if (!origin || origin.id !== id) return null;
    const dx = origin.x - x, dy = origin.y - y;
    if (!origin.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 4) {
      if (Math.abs(dx) > Math.abs(dy) * 1.25) origin.axis = 'x';
      else if (Math.abs(dy) > Math.abs(dx) * 1.25) origin.axis = 'y';
    }
    return origin.axis === this.axis ? origin.left + (this.axis === 'x' ? dx : dy) : null;
  }
  cancel() { this.origin = null; }
}
