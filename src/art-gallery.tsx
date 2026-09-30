import { ReactNode, useState } from 'react';
import type { CardEdition } from './feed-model';
import { useSnapScroll } from './use-snap-scroll';
type Props = {
  editions: CardEdition[]; selected: number; suspended: boolean;
  onSelect: (index: number) => void; onMotion: (moving: boolean) => void;
  render: (edition: CardEdition, selected: boolean, moving: boolean, onInspect: (active: boolean) => void) => ReactNode;
};


/** Vertical artwork discovery; only the active model mounts. */
export function ArtGallery({ editions, selected, suspended, onSelect, onMotion, render }: Props) {
  const [inspecting, setInspecting] = useState(false);
  const { scroller, center, moving, nativeEnd, events } = useSnapScroll({ axis: 'y', length: editions.length, selected, suspended: suspended || inspecting, onSelect, onMotion });
  return <div ref={scroller} className={`art-gallery ${inspecting || suspended ? 'gallery-locked' : ''} ${nativeEnd ? '' : 'gallery-fallback'}`} data-art-gallery="" role="region" aria-roledescription="carousel" aria-label="Artwork gallery. Scroll vertically to explore artwork." {...events}>
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
