// The emblem is served by Pokémon's official Mega Evolution site. The pulse
// below is our referential transition, not a source-authored game animation.
export const MEGA_STONE_SYMBOL = 'https://mega.pokemon.com/images/home/stone-mega.svg';

export function MegaActivation({ name, onSkip, onCancel }: { name: string; onSkip: () => void; onCancel: () => void }) {
  return <div className="mega-activation" role="status" aria-live="polite">
    <div className="mega-activation-content">
      <img src={MEGA_STONE_SYMBOL} alt="Official Mega Stone symbol" />
      <strong>Mega Evolving</strong>
      <span>{name}</span>
      <small>Referential transition · native form motion follows</small>
      <div className="mega-activation-actions"><button onClick={onSkip}>Skip animation</button><button onClick={onCancel}>Cancel</button></div>
    </div>
  </div>;
}
