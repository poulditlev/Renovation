import { describe, expect, it } from 'vitest';
import type { Sag } from './sag.js';
import {
  addDage,
  kanSkifteSagStatus,
  opretJournalnotat,
  opretSag,
  skiftSagStatus,
  traefAfgoerelse,
} from './sag.js';

function sag(overrides: Partial<Sag> = {}): Sag {
  return {
    id: 's1',
    sagsnummer: 'REN-2026-00123',
    sagstype_id: 'stype-dispensation-binding',
    ejendom_id: 'ejendom-1',
    part_id: 'part-1',
    status: 'MODTAGET',
    kanal: 'SAGSBEHANDLER',
    modtaget_dato: '2026-07-10',
    frist_dato: '2026-08-07',
    ansvarlig_bruger: 'sagsbehandler',
    lukket_dato: null,
    ...overrides,
  };
}

describe('opretSag', () => {
  it('beregner fristen ud fra sagstypens sagsbehandlingsfrist', () => {
    const s = opretSag({
      id: 's1',
      sagsnummer: 'REN-2026-00123',
      sagstype_id: 'stype-dispensation-binding', // 28 dages frist
      ejendom_id: 'ejendom-1',
      part_id: 'part-1',
      modtaget_dato: '2026-07-10',
    });
    expect(s.status).toBe('MODTAGET');
    expect(s.frist_dato).toBe(addDage('2026-07-10', 28));
    expect(s.frist_dato).toBe('2026-08-07');
  });

  it('kaster ved ukendt sagstype', () => {
    expect(() =>
      opretSag({
        id: 's1',
        sagsnummer: 'x',
        sagstype_id: 'findes-ikke',
        ejendom_id: 'e',
        part_id: null,
        modtaget_dato: '2026-07-10',
      }),
    ).toThrow();
  });
});

describe('traefAfgoerelse', () => {
  it('afviser en afgørelse uden hjemmel', () => {
    expect(() =>
      traefAfgoerelse(sag(), {
        id: 'a1',
        resultat: 'IMOEDEKOMMET',
        begrundelse: 'ok',
        hjemmel: '   ',
        afgjort_dato: '2026-07-20',
        afgjort_af: 'sagsbehandler',
      }),
    ).toThrow();
  });

  it('træffer en gyldig afgørelse, sætter sagen til AFGJORT og beregner klagefrist', () => {
    const { afgoerelse, sag: opdateret } = traefAfgoerelse(sag(), {
      id: 'a1',
      resultat: 'IMOEDEKOMMET',
      begrundelse: 'Sæsonophold.',
      hjemmel: 'Regulativ § 9, stk. 3',
      afgjort_dato: '2026-07-20',
      afgjort_af: 'sagsbehandler',
    });
    expect(afgoerelse.hjemmel).toBe('Regulativ § 9, stk. 3');
    expect(afgoerelse.klagefrist_dato).toBe(addDage('2026-07-20', 28));
    expect(opdateret.status).toBe('AFGJORT');
  });

  it('ændrer ikke den oprindelige sag', () => {
    const original = sag();
    const kopi = structuredClone(original);
    traefAfgoerelse(original, {
      id: 'a1',
      resultat: 'AFSLAG',
      begrundelse: 'x',
      hjemmel: 'Regulativ § 9',
      afgjort_dato: '2026-07-20',
      afgjort_af: 'sagsbehandler',
    });
    expect(original).toEqual(kopi);
  });
});

describe('skiftSagStatus', () => {
  it('følger et gyldigt forløb og sætter lukket_dato ved LUKKET', () => {
    let s = sag();
    s = skiftSagStatus(s, 'UNDER_BEHANDLING', '2026-07-11');
    s = skiftSagStatus(s, 'PARTSHOERING', '2026-07-12');
    s = skiftSagStatus(s, 'AFGJORT', '2026-07-20');
    s = skiftSagStatus(s, 'LUKKET', '2026-07-25');
    expect(s.status).toBe('LUKKET');
    expect(s.lukket_dato).toBe('2026-07-25');
  });

  it('afviser en ugyldig overgang', () => {
    expect(() => skiftSagStatus(sag(), 'AFGJORT', '2026-07-20')).toThrow(); // MODTAGET kan ikke gå direkte til AFGJORT
    expect(kanSkifteSagStatus('LUKKET', 'UNDER_BEHANDLING')).toBe(false);
  });
});

describe('opretJournalnotat', () => {
  it('opretter et notat (append-only; ingen rette-/slettefunktion findes)', () => {
    const n = opretJournalnotat({
      id: 'j1',
      sag_id: 's1',
      tekst: 'Partshøring sendt.',
      oprettet: '2026-07-12T11:02:00.000Z',
      oprettet_af: 'sagsbehandler',
    });
    expect(n).toMatchObject({ sag_id: 's1', tekst: 'Partshøring sendt.' });
  });
});
