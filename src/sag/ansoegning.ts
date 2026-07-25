import type { AnsoegningsArt } from './sag.js';

// Kodeliste over hvad en borger kan ansøge om via selvbetjening. Hver art er
// koblet til en sagstype (KLE) og en "effekt" - hvad en imødekommende afgørelse
// senere effektueres til. Ligger som DATA ét sted, så både borgerdialogen,
// serverens validering og effektueringen bruger samme sandhed. En ansøgning
// opretter kun en SAG; den ændrer aldrig ydelser eller materiel direkte.

/** Hvad en imødekommelse effektueres til. */
export type AnsoegningsEffekt = 'LOEBENDE' | 'ENGANGS' | 'AFMELD';

export interface AnsoegningsType {
  art: AnsoegningsArt;
  /** Borgervenligt navn. */
  navn: string;
  /** Kort forklaring til borgeren. */
  beskrivelse: string;
  /** Koblet sagstype (KLE-reference). */
  sagstype_id: string;
  /** Hvad en imødekommelse effektueres til. */
  effekt: AnsoegningsEffekt;
  /** Skal borgeren vælge en beholderstørrelse (periodisk ydelsestype)? */
  kraever_stoerrelse: boolean;
  /** Fast ydelsestype for arten (fx farligt sæk), ellers null. */
  fast_ydelsestype_id: string | null;
  /** Skal borgeren vælge hvilken løbende ydelse der afmeldes? */
  kraever_afmeld_valg: boolean;
}

export const ansoegningstyper: AnsoegningsType[] = [
  {
    art: 'EKSTRA_BEHOLDER',
    navn: 'Ekstra beholder',
    beskrivelse: 'Ansøg om en ekstra beholder på adressen.',
    sagstype_id: 'stype-ekstra-beholder',
    effekt: 'LOEBENDE',
    kraever_stoerrelse: true,
    fast_ydelsestype_id: null,
    kraever_afmeld_valg: false,
  },
  {
    art: 'ANDEN_STOERRELSE',
    navn: 'Anden beholderstørrelse',
    beskrivelse: 'Ansøg om at få en beholder i en anden størrelse.',
    sagstype_id: 'stype-beholder-stoerrelse',
    effekt: 'LOEBENDE',
    kraever_stoerrelse: true,
    fast_ydelsestype_id: null,
    kraever_afmeld_valg: false,
  },
  {
    art: 'FARLIGT_SAEK',
    navn: 'Ekstra sæt sække til farligt affald',
    beskrivelse: 'Ansøg om et ekstra sæt sække til farligt affald.',
    sagstype_id: 'stype-farligt-saek',
    effekt: 'ENGANGS',
    kraever_stoerrelse: false,
    fast_ydelsestype_id: 'ytype-farligt-saek',
    kraever_afmeld_valg: false,
  },
  {
    art: 'AFMELDING',
    navn: 'Afmelding af en løbende ydelse',
    beskrivelse: 'Ansøg om at afmelde en af dine faste ordninger.',
    sagstype_id: 'stype-framelding',
    effekt: 'AFMELD',
    kraever_stoerrelse: false,
    fast_ydelsestype_id: null,
    kraever_afmeld_valg: true,
  },
];

export function findAnsoegningstype(art: string): AnsoegningsType | undefined {
  return ansoegningstyper.find((a) => a.art === art);
}
