import type { Id } from '../types.js';
import type { EngangsStatus } from './status.js';

/**
 * En ENGANGSLEVERANCE - fx et sæt sække til farligt affald eller afhentning af
 * storskrald. Har leveringsdato og antal. INGEN periode, ingen bindingsperiode
 * og ingen slutdato. Afregnes på leveringsdatoen og indgår IKKE i den
 * periodiske takstberegning.
 */
export interface Engangsleverance {
  id: Id;
  ejendom_id: Id;
  ydelsestype_id: Id;
  leveringsdato: string; // ISO-dato
  antal: number;
  /** Styk-pris i hele øre. Kan være 0 (nogle ydelser er gebyrfrie). */
  enhedspris_oere: number;
  hjemmel: string;
  oprettet: string;
  oprettet_af: string;
}

/** Samlet beløb for en engangsleverance i hele øre. */
export function beregnEngangsbeloeb(leverance: Pick<Engangsleverance, 'antal' | 'enhedspris_oere'>): number {
  return leverance.antal * leverance.enhedspris_oere;
}

/**
 * Status for en engangsleverance på en given dato: `AFVENTER_LEVERING` hvis
 * leveringsdatoen ligger i fremtiden, ellers `LEVERET`.
 */
export function beregnEngangsStatus(leverance: Pick<Engangsleverance, 'leveringsdato'>, paaDato: string): EngangsStatus {
  return leverance.leveringsdato > paaDato ? 'AFVENTER_LEVERING' : 'LEVERET';
}
