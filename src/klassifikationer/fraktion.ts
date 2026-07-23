import type { Gyldighedsperiode, Id } from '../types.js';

/**
 * En affaldsfraktion - de typer affald kommunen håndterer.
 * Svarer til tabellen `fraktion` i datamodellen.
 */
export interface Fraktion extends Gyldighedsperiode {
  id: Id;
  kode: string;
  navn: string;
  beskrivelse: string;
}

// Seed-data: de officielle danske affaldsfraktioner (jf. affaldsbekendtgørelsens
// piktogramordning). Alle er gyldige fra ordningens indførelse og løber stadig.
export const fraktioner: Fraktion[] = [
  {
    id: 'frak-madaffald',
    kode: 'MADAFFALD',
    navn: 'Madaffald',
    beskrivelse: 'Madrester og organisk køkkenaffald.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-restaffald',
    kode: 'RESTAFFALD',
    navn: 'Restaffald',
    beskrivelse: 'Affald der ikke kan genanvendes eller sorteres i øvrige fraktioner.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-papir',
    kode: 'PAPIR',
    navn: 'Papir',
    beskrivelse: 'Aviser, reklamer, kontorpapir og andet rent papir.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-pap',
    kode: 'PAP',
    navn: 'Pap',
    beskrivelse: 'Papkasser og bølgepap, foldet sammen.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-glas',
    kode: 'GLAS',
    navn: 'Glas',
    beskrivelse: 'Flasker og glasemballage.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-metal',
    kode: 'METAL',
    navn: 'Metal',
    beskrivelse: 'Metalemballage og dåser.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-plast',
    kode: 'PLAST',
    navn: 'Plast',
    beskrivelse: 'Plastemballage og -folie.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-karton',
    kode: 'KARTON',
    navn: 'Mad- og drikkekarton',
    beskrivelse: 'Mælke- og juicekartoner mv.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-farligt',
    kode: 'FARLIGT',
    navn: 'Farligt affald',
    beskrivelse: 'Kemikalier, batterier, maling og andet farligt affald.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'frak-tekstil',
    kode: 'TEKSTIL',
    navn: 'Tekstil',
    beskrivelse: 'Tøj og andre tekstiler, hele eller kraftigt beskadigede.',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
];
