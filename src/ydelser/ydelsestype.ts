import type { Gyldighedsperiode, Id } from '../types.js';

/**
 * Afregningsform bestemmer HVILKEN slags ydelse en type er - og dermed hvilke
 * felter der giver mening. De to former må aldrig blandes i samme tabel eller
 * samme visning:
 *
 * - `PERIODISK`: løbende ydelse med gyldighedsperiode og bindingsperiode.
 *   Indgår i den løbende opkrævning via takstberegningen.
 * - `ENGANG`: engangsleverance med leveringsdato og antal. Ingen periode,
 *   ingen binding. Afregnes på leveringsdatoen.
 */
export type Afregningsform = 'PERIODISK' | 'ENGANG';

/**
 * Kodeliste over ydelsestyper. Ligger som data (ikke hardkodet logik), jf.
 * datamodellens princip om at klassifikationer er tabeller.
 */
export interface Ydelsestype extends Gyldighedsperiode {
  id: Id;
  kode: string;
  navn: string;
  afregningsform: Afregningsform;
  /** For periodiske beholderydelser: materieltypen der slås takst op efter. */
  materieltype_id: Id | null;
  /** Hvilken fraktion ydelsen dækker (hvis relevant). */
  fraktion_id: Id | null;
  /** Standard styk-pris i øre for engangsydelser. Kan være 0 (gebyrfri). */
  standard_enhedspris_oere: number | null;
  hjemmel: string;
}

// Seed-data. Periodiske: beholdere 140/240/660 l i forskellige fraktioner.
// Engangs: sække til farligt affald, ekstra sæk restaffald, storskrald,
// ekstra tømning uden for tur. Beløb i hele øre.
export const ydelsestyper: Ydelsestype[] = [
  // --- Periodiske beholderydelser ---
  {
    id: 'ytype-beholder-240-2',
    kode: 'BEHOLDER_240_2K',
    navn: '240 l beholder, to-delt (mad/rest)',
    afregningsform: 'PERIODISK',
    materieltype_id: 'mtype-240-2',
    fraktion_id: 'frak-restaffald',
    standard_enhedspris_oere: null,
    hjemmel: 'Regulativ for husholdningsaffald § 9, takstblad pkt. 3.4',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'ytype-beholder-140-1',
    kode: 'BEHOLDER_140_1K',
    navn: '140 l beholder, en-delt (restaffald)',
    afregningsform: 'PERIODISK',
    materieltype_id: 'mtype-140-1',
    fraktion_id: 'frak-restaffald',
    standard_enhedspris_oere: null,
    hjemmel: 'Regulativ for husholdningsaffald § 9, takstblad pkt. 3.1',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'ytype-beholder-660-1',
    kode: 'BEHOLDER_660_1K',
    navn: '660 l beholder, en-delt (restaffald)',
    afregningsform: 'PERIODISK',
    materieltype_id: 'mtype-660-1',
    fraktion_id: 'frak-restaffald',
    standard_enhedspris_oere: null,
    hjemmel: 'Regulativ for husholdningsaffald § 9, takstblad pkt. 3.5',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'ytype-haveaffald',
    kode: 'HAVEAFFALD_SAESON',
    navn: 'Haveaffald, sæsonordning',
    afregningsform: 'PERIODISK',
    materieltype_id: 'mtype-240-1',
    fraktion_id: 'frak-restaffald',
    standard_enhedspris_oere: null,
    hjemmel: 'Regulativ for husholdningsaffald § 12',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },

  // --- Engangsleverancer ---
  {
    id: 'ytype-farligt-saek',
    kode: 'SAEK_FARLIGT',
    navn: 'Sæt sække til farligt affald',
    afregningsform: 'ENGANG',
    materieltype_id: null,
    fraktion_id: 'frak-farligt',
    standard_enhedspris_oere: 0, // gebyrfri efter regulativet
    hjemmel: 'Regulativ for husholdningsaffald § 15 (gebyrfri)',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'ytype-ekstra-restsaek',
    kode: 'EKSTRA_RESTSAEK',
    navn: 'Ekstra sæk til restaffald',
    afregningsform: 'ENGANG',
    materieltype_id: null,
    fraktion_id: 'frak-restaffald',
    standard_enhedspris_oere: 3_500, // 35,00 kr pr. sæk
    hjemmel: 'Takstblad 2026 pkt. 5.1',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'ytype-storskrald',
    kode: 'STORSKRALD_AFHENT',
    navn: 'Afhentning af storskrald',
    afregningsform: 'ENGANG',
    materieltype_id: null,
    fraktion_id: null,
    standard_enhedspris_oere: 0, // gebyrfri efter regulativet
    hjemmel: 'Regulativ for husholdningsaffald § 13 (gebyrfri)',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
  {
    id: 'ytype-ekstra-toemning',
    kode: 'EKSTRA_TOEMNING',
    navn: 'Ekstra tømning uden for tur',
    afregningsform: 'ENGANG',
    materieltype_id: null,
    fraktion_id: null,
    standard_enhedspris_oere: 15_000, // 150,00 kr pr. tømning
    hjemmel: 'Takstblad 2026 pkt. 5.2',
    gyldig_fra: '2021-01-01',
    gyldig_til: null,
  },
];

export function findYdelsestype(id: string): Ydelsestype | undefined {
  return ydelsestyper.find((t) => t.id === id);
}
