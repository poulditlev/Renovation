import type { LoebendeYdelse } from '../ydelser/loebendeYdelse.js';
import type { Engangsleverance } from '../ydelser/engangsleverance.js';

// Seed-data for ydelser. Datoerne er anlagt omkring midten af 2026, så
// brugerfladen viser variation i status (aktiv, udløber snart, udløbet,
// afventer levering, leveret) for en sagsbehandler der arbejder i 2026.
// Beløb i hele øre. Alle parter er fiktive (jf. det øvrige seed).

const OPRETTET_AF = 'seed';

export const loebendeYdelserSeed: LoebendeYdelse[] = [
  // ejendom-01: én aktiv, én der udløber snart
  {
    id: 'ly-01-1',
    ejendom_id: 'ejendom-01',
    ydelsestype_id: 'ytype-beholder-240-2',
    materieltype_id: 'mtype-240-2',
    bindingsperiode_kode: '12_MDR',
    hjemmel: 'Regulativ for husholdningsaffald § 9, takstblad pkt. 3.4',
    forrige_ydelse_id: null,
    oprettet: '2025-12-15T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
    gyldig_fra: '2026-01-01',
    gyldig_til: '2027-01-01',
  },
  {
    id: 'ly-01-2',
    ejendom_id: 'ejendom-01',
    ydelsestype_id: 'ytype-beholder-140-1',
    materieltype_id: 'mtype-140-1',
    bindingsperiode_kode: '12_MDR',
    hjemmel: 'Regulativ for husholdningsaffald § 9, takstblad pkt. 3.1',
    forrige_ydelse_id: null,
    oprettet: '2025-08-20T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
    gyldig_fra: '2025-09-01',
    gyldig_til: '2026-09-01', // udløber snart set fra sommeren 2026
  },
  // ejendom-02: en udløbet ydelse
  {
    id: 'ly-02-1',
    ejendom_id: 'ejendom-02',
    ydelsestype_id: 'ytype-beholder-240-2',
    materieltype_id: 'mtype-240-2',
    bindingsperiode_kode: '24_MDR',
    hjemmel: 'Regulativ for husholdningsaffald § 9, takstblad pkt. 3.4',
    forrige_ydelse_id: null,
    oprettet: '2024-05-20T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
    gyldig_fra: '2024-06-01',
    gyldig_til: '2026-06-01', // allerede udløbet i sommeren 2026
  },
  // ejendom-03: haveaffald på sæsonbinding
  {
    id: 'ly-03-1',
    ejendom_id: 'ejendom-03',
    ydelsestype_id: 'ytype-haveaffald',
    materieltype_id: 'mtype-240-1',
    bindingsperiode_kode: 'SAESON',
    hjemmel: 'Regulativ for husholdningsaffald § 12',
    forrige_ydelse_id: null,
    oprettet: '2026-02-15T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
    gyldig_fra: '2026-03-01',
    gyldig_til: '2026-11-01', // sæson = 8 mdr
  },
  // ejendom-17 (boligforening): stor beholder
  {
    id: 'ly-17-1',
    ejendom_id: 'ejendom-17',
    ydelsestype_id: 'ytype-beholder-660-1',
    materieltype_id: 'mtype-660-1',
    bindingsperiode_kode: '12_MDR',
    hjemmel: 'Regulativ for husholdningsaffald § 9, takstblad pkt. 3.5',
    forrige_ydelse_id: null,
    oprettet: '2025-09-20T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
    gyldig_fra: '2025-10-01',
    gyldig_til: '2026-10-01',
  },
];

export const engangsleverancerSeed: Engangsleverance[] = [
  // ejendom-01
  {
    id: 'el-01-1',
    ejendom_id: 'ejendom-01',
    ydelsestype_id: 'ytype-storskrald',
    leveringsdato: '2026-08-15',
    antal: 1,
    enhedspris_oere: 0, // gebyrfri
    hjemmel: 'Regulativ for husholdningsaffald § 13 (gebyrfri)',
    oprettet: '2026-07-10T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
  },
  {
    id: 'el-01-2',
    ejendom_id: 'ejendom-01',
    ydelsestype_id: 'ytype-ekstra-restsaek',
    leveringsdato: '2026-06-01',
    antal: 5,
    enhedspris_oere: 3_500,
    hjemmel: 'Takstblad 2026 pkt. 5.1',
    oprettet: '2026-05-20T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
  },
  // ejendom-02
  {
    id: 'el-02-1',
    ejendom_id: 'ejendom-02',
    ydelsestype_id: 'ytype-farligt-saek',
    leveringsdato: '2026-07-20',
    antal: 2,
    enhedspris_oere: 0, // gebyrfri
    hjemmel: 'Regulativ for husholdningsaffald § 15 (gebyrfri)',
    oprettet: '2026-07-05T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
  },
  // ejendom-03
  {
    id: 'el-03-1',
    ejendom_id: 'ejendom-03',
    ydelsestype_id: 'ytype-ekstra-toemning',
    leveringsdato: '2026-09-01',
    antal: 1,
    enhedspris_oere: 15_000,
    hjemmel: 'Takstblad 2026 pkt. 5.2',
    oprettet: '2026-08-10T09:00:00.000Z',
    oprettet_af: OPRETTET_AF,
  },
];
