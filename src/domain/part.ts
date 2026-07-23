import type { Id } from '../types.js';

export type Parttype = 'PERSON' | 'VIRKSOMHED' | 'FORENING';

/**
 * Den juridiske part der betaler. Kaldes bevidst `part`, ikke `person`, fordi
 * det lige så ofte er en boligforening eller et selskab. Svarer til tabellen
 * `part` i datamodellen.
 *
 * VIGTIGT: `ekstern_id` er reserveret til CPR i en rigtig løsning og skal
 * forblive TOMT i dette læringsprojekt. Al persondata er syntetisk - brug
 * tydeligt opdigtede navne og @example.dk-adresser.
 */
export interface Part {
  id: Id;
  parttype: Parttype;
  navn: string;
  cvr_nummer: string | null; // kun for virksomheder; offentligt tilgængeligt
  ekstern_id: null; // altid tom - her ville CPR ligge i en rigtig løsning
  email: string | null;
  telefon: string | null;
  oprettet: string;
  oprettet_af: string;
}
