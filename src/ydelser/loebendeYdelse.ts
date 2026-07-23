import type { Gyldighedsperiode, Id } from '../types.js';

/**
 * En LØBENDE (periodisk) ydelse på en ejendom - fx en beholderordning med
 * bindingsperiode. Har gyldighedsperiode og bindingsperiode, og indgår i den
 * løbende opkrævning via den eksisterende takstberegning.
 *
 * Bemærk: felterne `id`, `ejendom_id`, `materieltype_id`, `gyldig_fra` og
 * `gyldig_til` er de samme, som takstberegningen (`beregnOpkraevningslinjer`)
 * læser fra materiel. En løbende ydelse kan derfor sendes direkte ind i
 * beregningen uden at ændre den.
 *
 * `gyldig_til` beregnes ud fra startdato + bindingsperiode (se `fornyelse.ts`)
 * og sættes ALDRIG frit af brugeren.
 */
export interface LoebendeYdelse extends Gyldighedsperiode {
  id: Id;
  ejendom_id: Id;
  ydelsestype_id: Id;
  materieltype_id: Id; // takstopslag
  bindingsperiode_kode: string;
  hjemmel: string;
  /** Ved fornyelse peger den nye række på den gamle. Historikken bevares. */
  forrige_ydelse_id: Id | null;
  oprettet: string;
  oprettet_af: string;
}
