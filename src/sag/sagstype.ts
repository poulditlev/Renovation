import type { Id } from '../types.js';

/**
 * Kodeliste over sagstyper, koblet til KLE-journalplanen. Svarer til tabellen
 * `sagstype`. `sagsbehandlingsfrist_dage` bruges til at beregne sagens frist.
 */
export interface Sagstype {
  id: Id;
  kode: string;
  navn: string;
  kle_nummer: string;
  sagsbehandlingsfrist_dage: number;
}

// KLE-numre er illustrative demoværdier.
export const sagstyper: Sagstype[] = [
  {
    id: 'stype-ekstra-beholder',
    kode: 'ANSOEG_EKSTRA_BEHOLDER',
    navn: 'Ansøgning om ekstra beholder',
    kle_nummer: '07.18.05',
    sagsbehandlingsfrist_dage: 28,
  },
  {
    id: 'stype-dispensation-binding',
    kode: 'DISPENSATION_BINDING',
    navn: 'Dispensation fra bindingsperiode',
    kle_nummer: '07.18.06',
    sagsbehandlingsfrist_dage: 28,
  },
  {
    id: 'stype-klage-toemning',
    kode: 'KLAGE_TOEMNING',
    navn: 'Klage over manglende tømning',
    kle_nummer: '07.18.24',
    sagsbehandlingsfrist_dage: 14,
  },
  {
    id: 'stype-framelding',
    kode: 'FRAMELDING_ORDNING',
    navn: 'Framelding af ordning',
    kle_nummer: '07.18.10',
    sagsbehandlingsfrist_dage: 28,
  },
];

export function findSagstype(id: string): Sagstype | undefined {
  return sagstyper.find((t) => t.id === id);
}
