import type { Gyldighedsperiode, Id } from '../types.js';

/**
 * Den løsning en ejendom kan være tilmeldt. Svarer til tabellen `ordningstype`.
 */
export interface Ordningstype extends Gyldighedsperiode {
  id: Id;
  kode: string;
  navn: string;
}

export const ordningstyper: Ordningstype[] = [
  {
    id: 'otype-husstand',
    kode: 'HUSSTAND',
    navn: 'Husstandsindsamling',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'otype-faelles-standplads',
    kode: 'FAELLES_STANDPLADS',
    navn: 'Fælles standplads',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'otype-sommerhus-saeson',
    kode: 'SOMMERHUS_SAESON',
    navn: 'Sommerhus, sæsonordning',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
];
