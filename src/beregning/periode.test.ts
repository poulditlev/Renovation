import { describe, expect, it } from 'vitest';
import { overlapDage, periodeOverlap } from './periode.js';

describe('periodeOverlap / overlapDage', () => {
  it('finder fuldt overlap når begge perioder er ens', () => {
    const a = { gyldig_fra: '2025-01-01', gyldig_til: '2026-01-01' };
    expect(overlapDage(a, a)).toBe(365);
  });

  it('finder delvist overlap', () => {
    const a = { gyldig_fra: '2025-01-01', gyldig_til: '2026-01-01' };
    const b = { gyldig_fra: '2025-07-01', gyldig_til: '2027-01-01' };
    expect(periodeOverlap(a, b)).toEqual({ gyldig_fra: '2025-07-01', gyldig_til: '2026-01-01' });
    expect(overlapDage(a, b)).toBe(184); // 1. juli til 1. januar i et almindeligt år
  });

  it('returnerer 0 dage / null når perioderne ikke overlapper', () => {
    const a = { gyldig_fra: '2025-01-01', gyldig_til: '2025-06-01' };
    const b = { gyldig_fra: '2025-06-01', gyldig_til: '2025-12-01' };
    expect(periodeOverlap(a, b)).toBeNull();
    expect(overlapDage(a, b)).toBe(0);
  });

  it('behandler gyldig_til som eksklusiv - et fælles randpunkt giver intet overlap', () => {
    const a = { gyldig_fra: '2025-01-01', gyldig_til: '2025-07-01' };
    const b = { gyldig_fra: '2025-07-01', gyldig_til: '2025-12-01' };
    expect(overlapDage(a, b)).toBe(0);
  });

  it('behandler null som "løber stadig"', () => {
    const a = { gyldig_fra: '2025-01-01', gyldig_til: null };
    const b = { gyldig_fra: '2025-07-01', gyldig_til: '2026-01-01' };
    expect(overlapDage(a, b)).toBe(184);
  });

  it('kaster fejl hvis overlappet ikke har nogen slutdato', () => {
    const a = { gyldig_fra: '2025-01-01', gyldig_til: null };
    const b = { gyldig_fra: '2025-07-01', gyldig_til: null };
    expect(() => overlapDage(a, b)).toThrow();
  });

  it('tæller 366 dage i et skudår', () => {
    const skudaar = { gyldig_fra: '2028-01-01', gyldig_til: '2029-01-01' };
    expect(overlapDage(skudaar, skudaar)).toBe(366);
  });

  it('tæller 365 dage i et almindeligt år', () => {
    const almindeligtAar = { gyldig_fra: '2026-01-01', gyldig_til: '2027-01-01' };
    expect(overlapDage(almindeligtAar, almindeligtAar)).toBe(365);
  });
});
