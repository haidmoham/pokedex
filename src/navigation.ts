export type Navigation = { axis: "x" | "y"; direction: number };

export function classifyGesture(x: number, y: number, threshold = 45): Navigation | null {
  const horizontal = Math.abs(x);
  const vertical = Math.abs(y);
  if (Math.max(horizontal, vertical) < threshold) return null;
  if (horizontal > vertical * 1.25) return { axis: "x", direction: Math.sign(x) };
  if (vertical > horizontal * 1.25) return { axis: "y", direction: Math.sign(y) };
  return null;
}

// A trackpad's momentum belongs to one gesture, even across a rerender.
export class WheelGesture {
  lastEvent = -Infinity;
  totalX = 0;
  totalY = 0;
  consumed = false;
  axis: 'x' | 'y' | null = null;

  read(x: number, y: number, time: number): Navigation | null {
    if (time - this.lastEvent > 180) this.reset();
    this.lastEvent = time;
    if (this.consumed) return null;
    this.totalX += x;
    this.totalY += y;
    const navigation = classifyGesture(this.totalX, this.totalY, 40);
    if (navigation) { this.consumed = true; this.axis = navigation.axis; }
    return navigation;
  }

  handle(x: number, y: number, time: number, verticalNavigation: boolean) {
    const navigation = this.read(x, y, time);
    return {
      // The entire stream retains its first owned axis. In particular, a
      // horizontal swipe's trailing vertical momentum cannot scroll the dex.
      preventDefault: this.axis === 'x' || (verticalNavigation && this.axis === 'y'),
      navigation: !verticalNavigation && navigation?.axis === 'y' ? null : navigation,
    };
  }

  reset() {
    this.lastEvent = -Infinity;
    this.totalX = 0;
    this.totalY = 0;
    this.consumed = false;
    this.axis = null;
  }
}

export function wrapIndex(index: number, direction: number, length: number) {
  return length ? ((index + direction) % length + length) % length : 0;
}

export class PointerGesture {
  origin: { id: number; x: number; y: number } | null = null;

  start(id: number, x: number, y: number) {
    this.origin = { id, x, y };
  }

  cancel() { this.origin = null; }

  end(id: number, x: number, y: number): Navigation | null {
    const origin = this.origin;
    if (!origin || origin.id !== id) return null;
    this.cancel();
    return classifyGesture(origin.x - x, origin.y - y);
  }
}
