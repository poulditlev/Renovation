import type { Gyldighedsperiode, Id } from '../types.js';

/**
 * En beholdertype - kombinationen af størrelse og kammerinddeling.
 * Svarer til tabellen `materieltype` i datamodellen.
 */
export interface Materieltype extends Gyldighedsperiode {
  id: Id;
  kode: string;
  navn: string;
  volumen_liter: number;
  antal_kamre: number;
}

// Seed-data: beholdere på 140/240/660 liter, i både et- og to-delt udgave.
export const materieltyper: Materieltype[] = [
  {
    id: 'mtype-140-1',
    kode: '140L-1KAMMER',
    navn: '140 liter, en-delt',
    volumen_liter: 140,
    antal_kamre: 1,
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'mtype-140-2',
    kode: '140L-2KAMMER',
    navn: '140 liter, to-delt',
    volumen_liter: 140,
    antal_kamre: 2,
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'mtype-240-1',
    kode: '240L-1KAMMER',
    navn: '240 liter, en-delt',
    volumen_liter: 240,
    antal_kamre: 1,
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'mtype-240-2',
    kode: '240L-2KAMMER',
    navn: '240 liter, to-delt',
    volumen_liter: 240,
    antal_kamre: 2,
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'mtype-660-1',
    kode: '660L-1KAMMER',
    navn: '660 liter, en-delt',
    volumen_liter: 660,
    antal_kamre: 1,
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'mtype-660-2',
    kode: '660L-2KAMMER',
    navn: '660 liter, to-delt',
    volumen_liter: 660,
    antal_kamre: 2,
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
];
