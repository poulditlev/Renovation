import { describe, expect, it } from 'vitest';
import type { Part } from './part.js';
import { normaliserTelefon, retKontaktoplysninger } from './kontakt.js';

function part(overrides: Partial<Part> = {}): Part {
  return {
    id: 'part-01',
    parttype: 'PERSON',
    navn: 'Testa Testesen (fiktiv)',
    cvr_nummer: null,
    ekstern_id: null,
    email: 'testa.testesen@example.dk',
    telefon: '20000001',
    oprettet: '2024-01-15T09:00:00.000Z',
    oprettet_af: 'seed',
    ...overrides,
  };
}

let n = 0;
function ctx() {
  n = 0;
  return { bruger: 'borger', tidspunkt: '2026-07-24T10:00:00.000Z', nyAuditId: () => `audit-${(n += 1)}` };
}

describe('normaliserTelefon', () => {
  it('fjerner mellemrum og landekode, så varianter bliver ens', () => {
    expect(normaliserTelefon('12 34 56 78')).toBe('12345678');
    expect(normaliserTelefon('+45 12 34 56 78')).toBe('12345678');
    expect(normaliserTelefon('004512345678')).toBe('12345678');
    expect(normaliserTelefon('')).toBe('');
    expect(normaliserTelefon(null)).toBe('');
  });
});

describe('retKontaktoplysninger', () => {
  it('accepterer en gyldig e-mail', () => {
    const { part: p, auditPoster } = retKontaktoplysninger(part(), { email: 'ny@example.dk' }, ctx());
    expect(p.email).toBe('ny@example.dk');
    expect(auditPoster).toHaveLength(1);
  });

  it('afviser en ugyldig e-mail med en forståelig fejl', () => {
    expect(() => retKontaktoplysninger(part(), { email: 'ikke-en-email' }, ctx())).toThrow(/e-mail/i);
  });

  it('normaliserer telefon med mellemrum og +45 til samme værdi', () => {
    const a = retKontaktoplysninger(part({ telefon: null }), { telefon: '12 34 56 78' }, ctx());
    const b = retKontaktoplysninger(part({ telefon: null }), { telefon: '+45 12345678' }, ctx());
    expect(a.part.telefon).toBe('12345678');
    expect(b.part.telefon).toBe('12345678');
  });

  it('afviser forsøg på at ændre navn', () => {
    expect(() => retKontaktoplysninger(part(), { navn: 'Nyt Navn' } as Record<string, string>, ctx())).toThrow(
      /registerdata/i,
    );
  });

  it('afviser forsøg på at ændre parttype', () => {
    expect(() =>
      retKontaktoplysninger(part(), { parttype: 'VIRKSOMHED' } as Record<string, string>, ctx()),
    ).toThrow(/registerdata/i);
  });

  it('tillader at fjerne telefon, når e-mail stadig er udfyldt', () => {
    const { part: p } = retKontaktoplysninger(part({ email: 'a@example.dk', telefon: '20000001' }), { telefon: '' }, ctx());
    expect(p.telefon).toBeNull();
    expect(p.email).toBe('a@example.dk');
  });

  it('afviser at fjerne begge kontaktmuligheder', () => {
    expect(() =>
      retKontaktoplysninger(part({ email: 'a@example.dk', telefon: '20000001' }), { email: '', telefon: '' }, ctx()),
    ).toThrow(/mindst én/i);
  });

  it('skriver præcis én audit-post med korrekt før- og efterværdi', () => {
    const { auditPoster } = retKontaktoplysninger(part({ email: 'gammel@example.dk' }), { email: 'ny@example.dk' }, ctx());
    expect(auditPoster).toHaveLength(1);
    expect(auditPoster[0]).toMatchObject({
      handling: 'RET',
      tabel: 'part',
      raekke_id: 'part-01',
      foer: { email: 'gammel@example.dk' },
      efter: { email: 'ny@example.dk' },
    });
  });

  it('skriver ingen audit-post for uændrede felter', () => {
    // Telefon sendes i en anden formatering, men normaliseres til samme værdi.
    const { auditPoster } = retKontaktoplysninger(part({ telefon: '12345678' }), { telefon: '12 34 56 78' }, ctx());
    expect(auditPoster).toHaveLength(0);
  });
});
