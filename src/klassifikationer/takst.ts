import type { Gyldighedsperiode, Id } from '../types.js';

/**
 * Prisen for en materieltype i en given periode. Ændres politisk hvert år.
 * Svarer til tabellen `takst`.
 */
export interface Takst extends Gyldighedsperiode {
  id: Id;
  materieltype_id: Id;
  ordningstype_id: Id | null; // null = gælder uanset ordning
  beloeb_aarligt_oere: number; // altid i hele øre
  godkendt_dato: string;
  hjemmel: string;
}

// Seed-data: takster for 2025 og 2026 pr. materieltype. Alle beløb er
// opdigtede, men plausible årlige priser for renovation i en dansk kommune.
// 2025-taksterne løber til udgangen af 2025 (gyldig_til er eksklusiv, altså
// "2026-01-01"), og 2026-taksterne løber stadig (gyldig_til = null), fordi
// der endnu ikke er vedtaget en takst for 2027.
export const takster: Takst[] = [
  // 140 liter, en-delt
  {
    id: 'takst-140-1-2025',
    materieltype_id: 'mtype-140-1',
    ordningstype_id: null,
    beloeb_aarligt_oere: 95_000,
    gyldig_fra: '2025-01-01',
    gyldig_til: '2026-01-01',
    godkendt_dato: '2024-11-15',
    hjemmel: 'Takstblad 2025, pkt. 3.1',
  },
  {
    id: 'takst-140-1-2026',
    materieltype_id: 'mtype-140-1',
    ordningstype_id: null,
    beloeb_aarligt_oere: 98_000,
    gyldig_fra: '2026-01-01',
    gyldig_til: null,
    godkendt_dato: '2025-11-14',
    hjemmel: 'Takstblad 2026, pkt. 3.1',
  },

  // 140 liter, to-delt
  {
    id: 'takst-140-2-2025',
    materieltype_id: 'mtype-140-2',
    ordningstype_id: null,
    beloeb_aarligt_oere: 145_000,
    gyldig_fra: '2025-01-01',
    gyldig_til: '2026-01-01',
    godkendt_dato: '2024-11-15',
    hjemmel: 'Takstblad 2025, pkt. 3.2',
  },
  {
    id: 'takst-140-2-2026',
    materieltype_id: 'mtype-140-2',
    ordningstype_id: null,
    beloeb_aarligt_oere: 150_000,
    gyldig_fra: '2026-01-01',
    gyldig_til: null,
    godkendt_dato: '2025-11-14',
    hjemmel: 'Takstblad 2026, pkt. 3.2',
  },

  // 240 liter, en-delt
  {
    id: 'takst-240-1-2025',
    materieltype_id: 'mtype-240-1',
    ordningstype_id: null,
    beloeb_aarligt_oere: 135_000,
    gyldig_fra: '2025-01-01',
    gyldig_til: '2026-01-01',
    godkendt_dato: '2024-11-15',
    hjemmel: 'Takstblad 2025, pkt. 3.3',
  },
  {
    id: 'takst-240-1-2026',
    materieltype_id: 'mtype-240-1',
    ordningstype_id: null,
    beloeb_aarligt_oere: 140_000,
    gyldig_fra: '2026-01-01',
    gyldig_til: null,
    godkendt_dato: '2025-11-14',
    hjemmel: 'Takstblad 2026, pkt. 3.3',
  },

  // 240 liter, to-delt
  {
    id: 'takst-240-2-2025',
    materieltype_id: 'mtype-240-2',
    ordningstype_id: null,
    beloeb_aarligt_oere: 195_000,
    gyldig_fra: '2025-01-01',
    gyldig_til: '2026-01-01',
    godkendt_dato: '2024-11-15',
    hjemmel: 'Takstblad 2025, pkt. 3.4',
  },
  {
    id: 'takst-240-2-2026',
    materieltype_id: 'mtype-240-2',
    ordningstype_id: null,
    beloeb_aarligt_oere: 202_000,
    gyldig_fra: '2026-01-01',
    gyldig_til: null,
    godkendt_dato: '2025-11-14',
    hjemmel: 'Takstblad 2026, pkt. 3.4',
  },

  // 660 liter, en-delt
  {
    id: 'takst-660-1-2025',
    materieltype_id: 'mtype-660-1',
    ordningstype_id: null,
    beloeb_aarligt_oere: 320_000,
    gyldig_fra: '2025-01-01',
    gyldig_til: '2026-01-01',
    godkendt_dato: '2024-11-15',
    hjemmel: 'Takstblad 2025, pkt. 3.5',
  },
  {
    id: 'takst-660-1-2026',
    materieltype_id: 'mtype-660-1',
    ordningstype_id: null,
    beloeb_aarligt_oere: 332_000,
    gyldig_fra: '2026-01-01',
    gyldig_til: null,
    godkendt_dato: '2025-11-14',
    hjemmel: 'Takstblad 2026, pkt. 3.5',
  },

  // 660 liter, to-delt
  {
    id: 'takst-660-2-2025',
    materieltype_id: 'mtype-660-2',
    ordningstype_id: null,
    beloeb_aarligt_oere: 420_000,
    gyldig_fra: '2025-01-01',
    gyldig_til: '2026-01-01',
    godkendt_dato: '2024-11-15',
    hjemmel: 'Takstblad 2025, pkt. 3.6',
  },
  {
    id: 'takst-660-2-2026',
    materieltype_id: 'mtype-660-2',
    ordningstype_id: null,
    beloeb_aarligt_oere: 436_000,
    gyldig_fra: '2026-01-01',
    gyldig_til: null,
    godkendt_dato: '2025-11-14',
    hjemmel: 'Takstblad 2026, pkt. 3.6',
  },
];
