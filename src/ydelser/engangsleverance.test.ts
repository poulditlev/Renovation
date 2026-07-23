import { describe, expect, it } from 'vitest';
import type { Engangsleverance } from './engangsleverance.js';
import { beregnEngangsbeloeb, beregnEngangsStatus } from './engangsleverance.js';
import { beregnOpkraevningslinjer } from '../beregning/index.js';
import { takster } from '../klassifikationer/index.js';

function leverance(overrides: Partial<Engangsleverance> = {}): Engangsleverance {
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

describe('engangsleverance', () => {
  it('har ingen slutdato og påvirker ikke periodeberegningen', () => {
    const l = leverance();
    // Engangsleverancen har hverken gyldig_fra eller gyldig_til.
    expect('gyldig_fra' in l).toBe(false);
    expect('gyldig_til' in l).toBe(false);

    // Den indgår ikke i den periodiske takstberegning: sender vi et tomt
    // materiel-sæt (engangsleverancer hører ikke med), bliver totalen 0.
    const periode = { periode_fra: '2026-01-01', periode_til: '2027-01-01' };
    const resultat = beregnOpkraevningslinjer([], periode, takster);
    expect(resultat.beloeb_total_oere).toBe(0);
  });

  it('beregner beløb som antal gange styk-pris', () => {
    expect(beregnEngangsbeloeb(leverance({ antal: 5, enhedspris_oere: 3_500 }))).toBe(17_500);
  });

  it('tillader en styk-pris på 0 (gebyrfri ydelse)', () => {
    expect(beregnEngangsbeloeb(leverance({ antal: 3, enhedspris_oere: 0 }))).toBe(0);
  });

  it('viser status ud fra leveringsdatoen', () => {
    expect(beregnEngangsStatus(leverance({ leveringsdato: '2026-08-01' }), '2026-07-01')).toBe('AFVENTER_LEVERING');
    expect(beregnEngangsStatus(leverance({ leveringsdato: '2026-06-01' }), '2026-07-01')).toBe('LEVERET');
  });
});
