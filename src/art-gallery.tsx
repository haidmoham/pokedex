import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CardEdition } from './feed-model';
import { GalleryDrag, GalleryMotion, galleryIndex } from './gallery-motion';

type Props = {
  editions: CardEdition[]; selected: number; suspended: boolean;
  onSelect: (index: number) => void; onMotion: (moving: boolean) => void;
  render: (edition: CardEdition, selected: boolean, moving: boolean, onInspect: (active: boolean) => void) => ReactNode;
};

/** Native wheel/touch physics and snapping; one active model and bounded posters. */
export function ArtGallery({ editions, selected, suspended, onSelect, onMotion, render }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const motion = useRef(new GalleryMotion());
  const mouse = useRef(new GalleryDrag());
  const moved = useRef(false);
  const frame = useRef(0);
  const requestedLeft = useRef<number | null>(null);
  const [center, setCenter] = useState(selected);
  const [moving, setMoving] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [nativeEnd, setNativeEnd] = useState(true);
  const latest = useRef({ selected, length: editions.length, onSelect, onMotion });
  latest.current = { selected, length: editions.length, onSelect, onMotion };
  motion.current.blocked = suspended || inspecting;

  const stopMotion = () => { setMoving(false); latest.current.onMotion(false); };
  const scheduleFrame = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const element = scroller.current;
      if (!element) return;
      if (requestedLeft.current !== null) { element.scrollLeft = requestedLeft.current; requestedLeft.current = null; }
      setCenter(galleryIndex(element.scrollLeft, element.clientWidth, latest.current.length));
    });
  };
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    motion.current.align();
    mouse.current.cancel();
    cancelAnimationFrame(frame.current); frame.current = 0; requestedLeft.current = null;
    element.style.scrollSnapType = '';
    element.scrollTo({ left: selected * element.clientWidth, behavior: 'instant' });
    setCenter(selected);
    stopMotion();
  }, [selected, suspended, inspecting]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    setNativeEnd('onscrollend' in element);
    const settle = () => {
      if (mouse.current.owned) return;
      const current = latest.current;
      const index = motion.current.settle(element.scrollLeft, element.clientWidth, current.length, current.selected);
      stopMotion();
      if (index !== null) current.onSelect(index);
    };
    const resize = new ResizeObserver(() => {
      motion.current.align();
      mouse.current.cancel(); requestedLeft.current = null;
      cancelAnimationFrame(frame.current); frame.current = 0;
      element.style.scrollSnapType = '';
      element.scrollTo({ left: latest.current.selected * element.clientWidth, behavior: 'instant' });
      setCenter(latest.current.selected);
      stopMotion();
    });
    resize.observe(element);
    element.addEventListener('scrollend', settle);
    return () => { resize.disconnect(); element.removeEventListener('scrollend', settle); cancelAnimationFrame(frame.current); latest.current.onMotion(false); };
  }, []);

  const finishMouse = (cancelled: boolean) => {
    const element = scroller.current;
    const owned = mouse.current.owned;
    const started = Boolean(mouse.current.origin);
    cancelAnimationFrame(frame.current); frame.current = 0;
    if (element && !cancelled && requestedLeft.current !== null) element.scrollLeft = requestedLeft.current;
    requestedLeft.current = null;
    mouse.current.cancel();
    if (!element || !started) return;
    element.style.scrollSnapType = '';
    if (!owned) return;
    const target = cancelled ? latest.current.selected : galleryIndex(element.scrollLeft, element.clientWidth, editions.length);
    if (cancelled) motion.current.align();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ left: target * element.clientWidth, behavior: cancelled || reduced ? 'instant' : 'smooth' });
    // At an exact snap point there may be no further scroll/scrollend event.
    if (!nativeEnd || Math.abs(element.scrollLeft - target * element.clientWidth) < 1) {
      const index = motion.current.settle(target * element.clientWidth, element.clientWidth, editions.length, selected);
      stopMotion();
      if (index !== null) onSelect(index);
    }
  };

  return <div ref={scroller} className={`art-gallery ${inspecting || suspended ? 'gallery-locked' : ''} ${nativeEnd ? '' : 'gallery-fallback'}`} data-art-gallery="" role="region" aria-roledescription="carousel" aria-label="Artwork gallery"
    onScroll={() => {
      if (!scroller.current || motion.current.blocked) return;
      if (!motion.current.programmed) { setMoving(true); onMotion(true); }
      scheduleFrame();
    }}
    onWheelCapture={event => {
      if (event.ctrlKey || event.metaKey) {
        motion.current.align();
        event.currentTarget.scrollTo({ left: selected * event.currentTarget.clientWidth, behavior: 'instant' });
        stopMotion();
        return; // Browser pinch/zoom remains native.
      }
      if (!event.ctrlKey && !event.metaKey) {
        // Older engines retain direct buttons/keyboard; never fake scrollend with a navigation timer.
        if (!nativeEnd && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        if (mouse.current.origin) finishMouse(true);
        motion.current.input(); moved.current = false;
      }
    }}
    onPointerDown={event => {
      moved.current = false;
      if (motion.current.blocked || !event.isPrimary) {
        finishMouse(true);
        if (!event.isPrimary) {
          motion.current.align();
          event.currentTarget.scrollTo({ left: selected * event.currentTarget.clientWidth, behavior: 'instant' });
          stopMotion();
        }
        return;
      }
      motion.current.input();
      if ((event.pointerType !== 'mouse' && nativeEnd) || event.button !== 0 || (event.target instanceof Element && event.target.closest('button, a, input, select'))) return;
      // Interrupt a prior snap immediately; subsequent movement tracks raw displacement.
      event.currentTarget.style.scrollSnapType = 'none';
      event.currentTarget.scrollTo({ left: event.currentTarget.scrollLeft, behavior: 'instant' });
      mouse.current.start(event.pointerId, event.clientX, event.clientY, event.currentTarget.scrollLeft);
    }}
    onPointerMove={event => {
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
    }}
    onPointerUp={() => finishMouse(false)}
    onPointerCancel={() => finishMouse(true)}
    onLostPointerCapture={() => finishMouse(true)}
    onClickCapture={event => { if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; } }}>
    {editions.map((edition, index) => <div className="art-frame" key={`${index}-${edition.cardId}`} aria-hidden={index !== selected} inert={index !== selected || moving}>
      {Math.abs(index - center) <= 1 || index === selected ? <>
        <div className={`art-stage ${['official','model'].includes(edition.sourceType ?? '') ? 'is-official' : 'is-card'}`}>
          {render(edition, index === selected, moving, setInspecting)}
        </div>
        {moving && <div className="gallery-preview-credit">{edition.title}<span>{edition.sourceType === 'official' ? 'Official art · PokéAPI' : `${edition.sourceType === 'model' ? '3D' : 'Art'} · ${edition.artist}`}</span></div>}
      </> : null}
    </div>)}
  </div>;
}
