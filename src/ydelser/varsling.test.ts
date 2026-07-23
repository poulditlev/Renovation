import { describe, expect, it } from 'vitest';
import type { LoebendeYdelse } from './loebendeYdelse.js';
import { opretVarsling } from './varsling.js';

function ydelse(overrides: Partial<LoebendeYdelse> = {}): LoebendeYdelse {
  return {
    id: 'y1',
    ejendom_id: 'ejendom-1',
    ydelsestype_id: 'ytype-beholder-240-2',
    materieltype_id: 'mtype-240-2',
    bindingsperiode_kode: '12_MDR',
    hjemmel: 'Regulativ § 9',
    forrige_ydelse_id: null,
    oprettet: '2026-01-01T09:00:00.000Z',
    oprettet_af: 'test',
    gyldig_fra: '2026-01-01',
    gyldig_til: '2027-01-01',
    ...overrides,
  };
}

describe('opretVarsling', () => {
  it('registrerer varslingen som data uden at sende noget', () => {
    const varsling = opretVarsling(ydelse(), {
      id: 'v1',
      part_id: 'part-01',
      modtager_email: 'testa.testesen@example.dk',
      tidspunkt: '2026-11-15T10:00:00.000Z',
    });

    expect(varsling).toMatchObject({
      id: 'v1',
      ydelse_id: 'y1',
      ejendom_id: 'ejendom-1',
      part_id: 'part-01',
      modtager_email: 'testa.testesen@example.dk',
      udloebsdato: '2027-01-01', // ydelsens slutdato
      tidspunkt: '2026-11-15T10:00:00.000Z',
      kanal: 'EMAIL_DEAKTIVERET', // afsendelse er slået fra med vilje
    });
  });

  it('kaster hvis ydelsen ikke har en udløbsdato', () => {
    expect(() =>
      opretVarsling(ydelse({ gyldig_til: null }), {
        id: 'v1',
        part_id: 'part-01',
        modtager_email: 'a@example.dk',
        tidspunkt: '2026-11-15T10:00:00.000Z',
      }),
    ).toThrow();
  });
});
