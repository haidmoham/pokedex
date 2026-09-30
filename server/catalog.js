// Committed PokéAPI species snapshot keeps the dex usable without live API access.
import species from '../content/species.json' with { type: 'json' };
export const catalog = species;
