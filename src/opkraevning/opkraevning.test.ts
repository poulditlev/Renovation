import { describe, expect, it } from 'vitest';
import type { Materiel } from '../materiel.js';
import type { Engangsleverance } from '../ydelser/index.js';
import { takster } from '../klassifikationer/index.js';
import { dannOpkraevning, kanSkifteStatus, skiftStatus } from './opkraevning.js';

function periodisk(overrides: Partial<Materiel> & Pick<Materiel, 'id'>): Materiel {
  return {
    ejendom_id: 'ejendom-1',
    materieltype_id: 'mtype-240-2',
    gyldig_fra: '2026-01-01',
    gyldig_til: null,
    ...overrides,
  };
}

function engangs(overrides: Partial<Engangsleverance> = {}): Engangsleverance {
  return {
    id: 'e1',
    ejendom_id: 'ejendom-1',
    ydelsestype_id: 'ytype-ekstra-restsaek',
    leveringsdato: '2026-06-01',
    antal: 5,
    enhedspris_oere: 3_500,
    hjemmel: 'Takstblad 2026 pkt. 5.1',
    oprettet: '2026-05-01T09:00:00.000Z',
    oprettet_af: 'test',
    ...overrides,
  };
}

const periode2026 = { periode_fra: '2026-01-01', periode_til: '2027-01-01' };

describe('dannOpkraevning', () => {
  it('danner en KLADDE hvor totalen er summen af linjerne', () => {
    const { opkraevning, linjer } = dannOpkraevning({
      id: 'opk-1',
      ejendom_id: 'ejendom-1',
      part_id: 'part-1',
      periode: periode2026,
      dannet_dato: '2026-01-05',
      periodiskeYdelser: [periodisk({ id: 'm1' })],
      engangsleverancer: [engangs()],
      takster,
    });

    expect(opkraevning.status).toBe('KLADDE');
    expect(linjer.length).toBe(2); // én periodisk + én engangs
    const sum = linjer.reduce((s, l) => s + l.beloeb_oere, 0);
    expect(opkraevning.beloeb_total_oere).toBe(sum);
  });

  it('medtager kun engangsleverancer der er leveret i perioden', () => {
    const { linjer } = dannOpkraevning({
      id: 'opk-2',
      ejendom_id: 'ejendom-1',
      part_id: null,
      periode: periode2026,
      dannet_dato: '2026-01-05',
      periodiskeYdelser: [],
      engangsleverancer: [
        engangs({ id: 'i', leveringsdato: '2026-06-01' }),
        engangs({ id: 'ude', leveringsdato: '2025-12-31' }),
        engangs({ id: 'grænse', leveringsdato: '2027-01-01' }), // eksklusiv slut
      ],
      takster,
    });
    const materielIds = linjer.map((l) => l.beskrivelse);
    expect(linjer).toHaveLength(1);
    expect(materielIds[0]).toContain('2026-06-01');
  });

  it('en udløbet periodisk ydelse giver ingen linje efter slutdatoen', () => {
    const { linjer, opkraevning } = dannOpkraevning({
      id: 'opk-3',
      ejendom_id: 'ejendom-1',
      part_id: null,
      periode: { periode_fra: '2026-07-01', periode_til: '2027-01-01' },
      dannet_dato: '2026-07-01',
      periodiskeYdelser: [periodisk({ id: 'm1', gyldig_fra: '2025-07-01', gyldig_til: '2026-07-01' })],
      engangsleverancer: [],
      takster,
    });
    expect(linjer).toHaveLength(0);
    expect(opkraevning.beloeb_total_oere).toBe(0);
  });

  it('gemmer antal_dage og takst_id på periodiske linjer og null på engangs', () => {
    const { linjer } = dannOpkraevning({
      id: 'opk-4',
      ejendom_id: 'ejendom-1',
      part_id: null,
      periode: periode2026,
      dannet_dato: '2026-01-05',
      periodiskeYdelser: [periodisk({ id: 'm1' })],
      engangsleverancer: [engangs()],
      takster,
    });
    const periodiskLinje = linjer.find((l) => l.antal_dage !== null);
    const engangsLinje = linjer.find((l) => l.antal_dage === null);
    expect(periodiskLinje?.takst_id).toBeTruthy();
    expect(periodiskLinje?.antal_dage).toBe(365);
    expect(engangsLinje?.takst_id).toBeNull();
  });
});

describe('skiftStatus', () => {
  it('følger KLADDE → GODKENDT → SENDT → BETALT', () => {
    const base = {
      id: 'o',
      ejendom_id: 'e',
      part_id: null,
      periode_fra: '2026-01-01',
      periode_til: '2027-01-01',
      beloeb_total_oere: 0,
      status: 'KLADDE' as const,
      dannet_dato: '2026-01-01',
    };
    const godkendt = skiftStatus(base, 'GODKENDT');
    const sendt = skiftStatus(godkendt, 'SENDT');
    const betalt = skiftStatus(sendt, 'BETALT');
    expect(betalt.status).toBe('BETALT');
    // Den oprindelige er uændret.
    expect(base.status).toBe('KLADDE');
  });

  it('afviser ugyldige overgange', () => {
    const base = {
      id: 'o',
      ejendom_id: 'e',
      part_id: null,
      periode_fra: '2026-01-01',
      periode_til: '2027-01-01',
      beloeb_total_oere: 0,
      status: 'KLADDE' as const,
      dannet_dato: '2026-01-01',
    };
    expect(() => skiftStatus(base, 'BETALT')).toThrow(); // kan ikke springe direkte til betalt
    expect(kanSkifteStatus('BETALT', 'ANNULLERET')).toBe(false);
  });
});
