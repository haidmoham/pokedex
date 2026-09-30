import { useEffect, useLayoutEffect, useRef, useState, HTMLAttributes } from 'react';
import { GalleryDrag, GalleryMotion, galleryIndex } from './gallery-motion';
type Options = { axis: 'x' | 'y'; selected: number; length: number; suspended: boolean; onSelect: (index: number) => void; onMotion: (moving: boolean) => void };
export function useSnapScroll({ axis, selected, length, suspended, onSelect, onMotion }: Options) {
  const size = (element: HTMLDivElement) => axis === 'x' ? element.clientWidth : element.clientHeight;
  const offset = (element: HTMLDivElement) => axis === 'x' ? element.scrollLeft : element.scrollTop;
  const setOffset = (element: HTMLDivElement, value: number) => { if (axis === 'x') element.scrollLeft = value; else element.scrollTop = value; };
  const scrollTo = (element: HTMLDivElement, value: number, behavior: ScrollBehavior) => element.scrollTo(axis === 'x' ? { left: value, behavior } : { top: value, behavior });
  const scroller = useRef<HTMLDivElement>(null);
  const motion = useRef(new GalleryMotion());
  const mouse = useRef(new GalleryDrag(axis));
  const moved = useRef(false);
  const frame = useRef(0);
  const settlingFrame = useRef(0);
  const endFrame = useRef(0);
  const requestedLeft = useRef<number | null>(null);
  const [center, setCenter] = useState(selected);
  const [moving, setMoving] = useState(false);
  const [nativeEnd, setNativeEnd] = useState(true);
  const latest = useRef({ selected, length: length, onSelect, onMotion });
  latest.current = { selected, length: length, onSelect, onMotion };
  motion.current.blocked = suspended;

  const stopMotion = () => { setMoving(false); latest.current.onMotion(false); };
  const cancelSettle = (element: HTMLDivElement) => {
    cancelAnimationFrame(settlingFrame.current); settlingFrame.current = 0;
    if (motion.current.target !== null) scrollTo(element, offset(element), 'instant');
    motion.current.target = null;
  };
  const complete = () => {
    const element = scroller.current, current = latest.current;
    if (!element || mouse.current.origin || !motion.current.completed(offset(element), size(element), current.length)) return false;
    const index = motion.current.settle(offset(element), size(element), current.length, current.selected);
    cancelAnimationFrame(settlingFrame.current); settlingFrame.current = 0;
    // Custom release has a single owner: native smooth scroll. CSS snapping is
    // restored only at the endpoint, never while that animation is underway.
    element.style.scrollSnapType = '';
    stopMotion();
    if (index !== null) current.onSelect(index);
    return true;
  };
  const observeRelease = () => {
    if (complete() || motion.current.target === null) return;
    settlingFrame.current = requestAnimationFrame(observeRelease);
  };
  const scheduleFrame = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const element = scroller.current;
      if (!element) return;
      if (requestedLeft.current !== null) { setOffset(element, requestedLeft.current); requestedLeft.current = null; }
      setCenter(galleryIndex(offset(element), size(element), latest.current.length));
    });
  };
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    cancelSettle(element); motion.current.align();
    mouse.current.cancel();
    cancelAnimationFrame(frame.current); frame.current = 0; requestedLeft.current = null;
    element.style.scrollSnapType = '';
    scrollTo(element, selected * size(element), 'instant');
    setCenter(selected);
    stopMotion();
  }, [selected, suspended]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    setNativeEnd('onscrollend' in element);
    const settle = (event: Event) => {
      if (event.target !== element) return;
      const revision = motion.current.revision, position = offset(element);
      cancelAnimationFrame(endFrame.current);
      // Give the next input/scroll frame a chance to invalidate a queued end.
      // This is position/lifecycle observation, never a navigation timeout.
      endFrame.current = requestAnimationFrame(() => {
        endFrame.current = 0;
        if (revision === motion.current.revision && Math.abs(position - offset(element)) < 0.01) complete();
      });
    };
    let width = size(element);
    const resize = new ResizeObserver(() => {
      if (size(element) === width) return;
      width = size(element);
      cancelSettle(element); motion.current.align();
      mouse.current.cancel(); requestedLeft.current = null;
      cancelAnimationFrame(frame.current); frame.current = 0;
      element.style.scrollSnapType = '';
      scrollTo(element, latest.current.selected * size(element), 'instant');
      setCenter(latest.current.selected);
      stopMotion();
    });
    resize.observe(element);
    element.addEventListener('scrollend', settle);
    return () => { resize.disconnect(); element.removeEventListener('scrollend', settle); cancelAnimationFrame(frame.current); cancelAnimationFrame(settlingFrame.current); cancelAnimationFrame(endFrame.current); latest.current.onMotion(false); };
  }, []);

  const finishMouse = (cancelled: boolean) => {
    const element = scroller.current;
    const owned = mouse.current.owned;
    const started = Boolean(mouse.current.origin);
    cancelAnimationFrame(frame.current); frame.current = 0;
    if (element && !cancelled && requestedLeft.current !== null) setOffset(element, requestedLeft.current);
    requestedLeft.current = null;
    mouse.current.cancel();
    if (!element || !started) return;
    if (!owned) { element.style.scrollSnapType = ''; return; }
    const target = cancelled ? latest.current.selected : motion.current.release(offset(element), size(element), latest.current.length);
    if (cancelled) { motion.current.align(); motion.current.target = target; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollTo(element, target * size(element), cancelled || reduced ? 'instant' : 'smooth');
    // Position observation also handles engines without scrollend and releases
    // already at a snap point. It never commits a predicted future position.
    observeRelease();
  };

  const events: HTMLAttributes<HTMLDivElement> = {
    onScroll: event => {
      if (event.target !== event.currentTarget) return;
      if (!scroller.current || motion.current.blocked) return;
      if (!motion.current.programmed) { setMoving(true); onMotion(true); }
      scheduleFrame();
    },
    onWheelCapture: event => {
      if (event.ctrlKey || event.metaKey) {
        cancelSettle(event.currentTarget);
        motion.current.align();
        scrollTo(event.currentTarget, selected * size(event.currentTarget), 'instant');
        stopMotion();
        return; // Browser pinch/zoom remains native.
      }
      if (!event.ctrlKey && !event.metaKey) {
        // Older engines retain direct buttons/keyboard; never fake scrollend with a navigation timer.
        if (!nativeEnd && Math.abs(axis === 'x' ? event.deltaX : event.deltaY) > Math.abs(axis === 'x' ? event.deltaY : event.deltaX)) return;
        if (mouse.current.origin) finishMouse(true);
        cancelSettle(event.currentTarget); event.currentTarget.style.scrollSnapType = '';
        motion.current.input(); moved.current = false;
      }
    },
    onPointerDown: event => {
      moved.current = false;
      if (motion.current.blocked || !event.isPrimary) {
        finishMouse(true);
        if (!event.isPrimary) {
          motion.current.align();
          scrollTo(event.currentTarget, selected * size(event.currentTarget), 'instant');
          stopMotion();
        }
        return;
      }
      cancelSettle(event.currentTarget); event.currentTarget.style.scrollSnapType = '';
      motion.current.input();
      if ((event.pointerType !== 'mouse' && nativeEnd) || event.button !== 0 || (event.target instanceof Element && event.target.closest('button, a, input, select'))) return;
      // Interrupt a prior snap immediately; subsequent movement tracks raw displacement.
      event.currentTarget.style.scrollSnapType = 'none';
      scrollTo(event.currentTarget, offset(event.currentTarget), 'instant');
      mouse.current.start(event.pointerId, event.clientX, event.clientY, offset(event.currentTarget));
    },
    onPointerMove: event => {
      const owned = mouse.current.owned;
      const left = mouse.current.read(event.pointerId, event.clientX, event.clientY);
      if (left === null) return;
      if (!owned) {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.style.scrollSnapType = 'none';
        setMoving(true); onMotion(true);
      }
      moved.current = true;
      requestedLeft.current = left;
      scheduleFrame();
    },
    onPointerUp: () => finishMouse(false),
    onPointerCancel: () => finishMouse(true),
    onLostPointerCapture: () => finishMouse(true),
    onClickCapture: event => { if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; } },
  };
  return { scroller, center, moving, nativeEnd, events };
}
