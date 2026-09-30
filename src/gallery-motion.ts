export function galleryIndex(offset: number, width: number, length: number) {
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0 || length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.round(offset / width)));
}

// Selection follows native scrollend, never a debounce timer or wheel threshold.
export class GalleryMotion {
  programmed = true;
  blocked = false;
  reported: number | null = null;
  input() { if (!this.blocked) this.programmed = false; }
  align() { this.programmed = true; this.reported = null; }
  settle(offset: number, width: number, length: number, selected: number) {
    const index = galleryIndex(offset, width, length);
    const allowed = !this.blocked && !this.programmed && index !== selected && index !== this.reported;
    this.programmed = false;
    if (allowed) this.reported = index;
    return allowed ? index : null;
  }
}

export class GalleryDrag {
  origin: { id: number; x: number; y: number; left: number; axis: 'x' | 'y' | null } | null = null;
  get owned() { return this.origin?.axis === 'x'; }
  start(id: number, x: number, y: number, left: number) { this.origin = { id, x, y, left, axis: null }; }
  read(id: number, x: number, y: number) {
    const origin = this.origin;
    if (!origin || origin.id !== id) return null;
    const dx = origin.x - x, dy = origin.y - y;
    if (!origin.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 4) {
      if (Math.abs(dx) > Math.abs(dy) * 1.25) origin.axis = 'x';
      else if (Math.abs(dy) > Math.abs(dx) * 1.25) origin.axis = 'y';
    }
    return origin.axis === 'x' ? origin.left + dx : null;
  }
  cancel() { this.origin = null; }
}
