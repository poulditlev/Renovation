import type { Id } from '../types.js';
import type { LoebendeYdelse } from './loebendeYdelse.js';

// -----------------------------------------------------------------------------
// VARSLING AF PART OM UDLØB.
//
// VIGTIGT: Dette er et TESTMILJØ med FIKTIVE parter. Der sendes ALDRIG rigtige
// e-mails herfra. Afsendelse er slået fra med vilje. I stedet oprettes en
// varsling som DATA (et sporbarhedskrav, ikke en logfil), så det kan ses hvem
// der er varslet hvornår om hvad. En rigtig integration til et
// e-mail-/Digital Post-system ville træde ind her - isoleret ét sted.
// -----------------------------------------------------------------------------

/** Kanalen er markeret som deaktiveret, så det er tydeligt at intet sendes. */
export type VarslingsKanal = 'EMAIL_DEAKTIVERET';

/**
 * En varsling gemt som data. Registrerer at en part ER blevet varslet om en
 * ydelses udløb - ikke at en e-mail faktisk er afsendt.
 */
export interface Varsling {
  id: Id;
  ydelse_id: Id;
  ejendom_id: Id;
  part_id: Id;
  modtager_email: string | null;
  udloebsdato: string;
  tidspunkt: string; // hvornår varslingen blev registreret
  kanal: VarslingsKanal;
  note: string;
}

export interface OpretVarslingInput {
  id: string;
  part_id: string;
  modtager_email: string | null;
  tidspunkt: string;
}

/**
 * Ren funktion: opretter en varslingsrække for en udløbende ydelse. Sender
 * IKKE noget - returnerer blot dataobjektet. Kaster hvis ydelsen ikke har en
 * udløbsdato (så er der intet at varsle om).
 */
export function opretVarsling(ydelse: LoebendeYdelse, input: OpretVarslingInput): Varsling {
  if (ydelse.gyldig_til === null) {
    throw new Error('Kan ikke varsle om en ydelse uden udløbsdato.');
  }
  return {
    id: input.id,
    ydelse_id: ydelse.id,
    ejendom_id: ydelse.ejendom_id,
    part_id: input.part_id,
    modtager_email: input.modtager_email,
    udloebsdato: ydelse.gyldig_til,
    tidspunkt: input.tidspunkt,
    kanal: 'EMAIL_DEAKTIVERET',
    note: 'TESTMILJØ: e-mailafsendelse er deaktiveret. Varslingen er kun registreret som data.',
  };
}
