import { describe, expect, it } from 'vitest';
import type { Materiel } from '../materiel.js';
import type { Takst } from '../klassifikationer/takst.js';
import { materieltyper, takster as seedTakster } from '../klassifikationer/index.js';
import { beregnOpkraevningslinjer } from './takstberegning.js';

// Faste takster til testene, uafhængige af seed-dataet, så forventede
// dagsantal og beløb er lette at regne efter i hånden.
const takst2025: Takst = {
  id: 't-a-2025',
  materieltype_id: 'mtype-a',
  ordningstype_id: null,
  beloeb_aarligt_oere: 100_000,
  gyldig_fra: '2025-01-01',
  gyldig_til: '2026-01-01',
  godkendt_dato: '2024-11-01',
  hjemmel: 'Test',
};

const takst2026: Takst = {
  id: 't-a-2026',
  materieltype_id: 'mtype-a',
  ordningstype_id: null,
  beloeb_aarligt_oere: 104_000,
  gyldig_fra: '2026-01-01',
  gyldig_til: null,
  godkendt_dato: '2025-11-01',
  hjemmel: 'Test',
};

const takstB2025: Takst = {
  id: 't-b-2025',
  materieltype_id: 'mtype-b',
  ordningstype_id: null,
  beloeb_aarligt_oere: 150_000,
  gyldig_fra: '2025-01-01',
  gyldig_til: '2026-01-01',
  godkendt_dato: '2024-11-01',
  hjemmel: 'Test',
};

const heleAaret2025 = { periode_fra: '2025-01-01', periode_til: '2026-01-01' };

function materiel(overrides: Partial<Materiel> & Pick<Materiel, 'id' | 'gyldig_fra' | 'gyldig_til'>): Materiel {
  return {
    ejendom_id: 'ejendom-1',
    materieltype_id: 'mtype-a',
    ...overrides,
  };
}

describe('beregnOpkraevningslinjer', () => {
  it('giver fuld årstakst for en beholder der har stået hele året', () => {
    const m = materiel({ id: 'm1', gyldig_fra: '2025-01-01', gyldig_til: null });
    const resultat = beregnOpkraevningslinjer([m], heleAaret2025, [takst2025]);

    expect(resultat.linjer).toHaveLength(1);
    expect(resultat.linjer[0]).toMatchObject({
      materiel_id: 'm1',
      takst_id: 't-a-2025',
      antal_dage: 365,
      beloeb_oere: 100_000,
    });
    expect(resultat.beloeb_total_oere).toBe(100_000);
  });

  it('giver forholdsmæssig takst for en beholder opsat 1. juli', () => {
    const m = materiel({ id: 'm1', gyldig_fra: '2025-07-01', gyldig_til: null });
    const resultat = beregnOpkraevningslinjer([m], heleAaret2025, [takst2025]);

    expect(resultat.linjer).toHaveLength(1);
    expect(resultat.linjer[0]?.antal_dage).toBe(184);
    expect(resultat.linjer[0]?.beloeb_oere).toBe(50_411); // round(100000 * 184 / 365)
    expect(resultat.beloeb_total_oere).toBe(50_411);
  });

  it('giver forholdsmæssig takst for en beholder fjernet 1. juli', () => {
    const m = materiel({ id: 'm1', gyldig_fra: '2025-01-01', gyldig_til: '2025-07-01' });
    const resultat = beregnOpkraevningslinjer([m], heleAaret2025, [takst2025]);

    expect(resultat.linjer).toHaveLength(1);
    expect(resultat.linjer[0]?.antal_dage).toBe(181);
    expect(resultat.linjer[0]?.beloeb_oere).toBe(49_589); // round(100000 * 181 / 365)
    expect(resultat.beloeb_total_oere).toBe(49_589);
  });

  it('giver to linjer når beholderen byttes til en anden størrelse midt i året', () => {
    const gammelBeholder = materiel({
      id: 'm1',
      materieltype_id: 'mtype-a',
      gyldig_fra: '2025-01-01',
      gyldig_til: '2025-07-01',
    });
    const nyBeholder = materiel({
      id: 'm2',
      materieltype_id: 'mtype-b',
      gyldig_fra: '2025-07-01',
      gyldig_til: null,
    });

    const resultat = beregnOpkraevningslinjer([gammelBeholder, nyBeholder], heleAaret2025, [
      takst2025,
      takstB2025,
    ]);

    expect(resultat.linjer).toHaveLength(2);

    const linje1 = resultat.linjer.find((l) => l.materiel_id === 'm1');
    const linje2 = resultat.linjer.find((l) => l.materiel_id === 'm2');

    expect(linje1).toMatchObject({ takst_id: 't-a-2025', antal_dage: 181, beloeb_oere: 49_589 });
    expect(linje2).toMatchObject({ takst_id: 't-b-2025', antal_dage: 184, beloeb_oere: 75_616 });
    expect(resultat.beloeb_total_oere).toBe(49_589 + 75_616);
  });

  it('bruger kun den nye takst fra den dato den træder i kraft', () => {
    const m = materiel({ id: 'm1', gyldig_fra: '2025-10-01', gyldig_til: null });
    const periode = { periode_fra: '2025-10-01', periode_til: '2026-04-01' };

    const resultat = beregnOpkraevningslinjer([m], periode, [takst2025, takst2026]);

    expect(resultat.linjer).toHaveLength(2);

    const linjeFor2025 = resultat.linjer.find((l) => l.takst_id === 't-a-2025');
    const linjeFor2026 = resultat.linjer.find((l) => l.takst_id === 't-a-2026');

    // 1. oktober til 1. januar = 92 dage (okt 31 + nov 30 + dec 31)
    expect(linjeFor2025).toMatchObject({ antal_dage: 92, beloeb_oere: 25_205 });
    // 1. januar til 1. april 2026 = 90 dage (jan 31 + feb 28 + mar 31), 2026 er ikke skudår
    expect(linjeFor2026).toMatchObject({ antal_dage: 90, beloeb_oere: 25_644 });
    expect(resultat.beloeb_total_oere).toBe(25_205 + 25_644);
  });

  it('giver et samlet beløb på 0 kr. for en ejendom uden materiel - ikke en fejl', () => {
    const resultat = beregnOpkraevningslinjer([], heleAaret2025, [takst2025]);

    expect(resultat.linjer).toEqual([]);
    expect(resultat.beloeb_total_oere).toBe(0);
  });

  it('tæller 366 dage i et skudår, men opkræver stadig kun den fulde årstakst', () => {
    const periodeSkudaar = { periode_fra: '2028-01-01', periode_til: '2029-01-01' };
    const m = materiel({ id: 'm1', gyldig_fra: '2028-01-01', gyldig_til: null });

    const resultat = beregnOpkraevningslinjer([m], periodeSkudaar, [takst2026]);

    expect(resultat.linjer).toHaveLength(1);
    expect(resultat.linjer[0]?.antal_dage).toBe(366);
    expect(resultat.linjer[0]?.beloeb_oere).toBe(104_000); // fuld årstakst, ikke ekstra for skuddagen
    expect(resultat.beloeb_total_oere).toBe(104_000);
  });

  it('summen af linjernes beløb matcher altid totalen præcist, selv med afrunding', () => {
    const materiel1 = materiel({ id: 'm1', gyldig_fra: '2025-01-01', gyldig_til: '2025-04-11' });
    const materiel2 = materiel({ id: 'm2', gyldig_fra: '2025-04-11', gyldig_til: '2025-08-22' });
    const materiel3 = materiel({ id: 'm3', gyldig_fra: '2025-08-22', gyldig_til: null });

    const resultat = beregnOpkraevningslinjer([materiel1, materiel2, materiel3], heleAaret2025, [takst2025]);

    const summenAfLinjer = resultat.linjer.reduce((sum, l) => sum + l.beloeb_oere, 0);
    expect(resultat.beloeb_total_oere).toBe(summenAfLinjer);
  });

  it('springer materiel over der slet ikke overlapper opkrævningsperioden', () => {
    const m = materiel({ id: 'm1', gyldig_fra: '2024-01-01', gyldig_til: '2025-01-01' });
    const resultat = beregnOpkraevningslinjer([m], heleAaret2025, [takst2025]);

    expect(resultat.linjer).toEqual([]);
    expect(resultat.beloeb_total_oere).toBe(0);
  });

  it('virker sammen med de rigtige seed-takster', () => {
    const type240 = materieltyper.find((t) => t.kode === '240L-1KAMMER');
    if (!type240) throw new Error('Forventede at finde 240L-1KAMMER i seed-data');

    const m = materiel({ id: 'm1', materieltype_id: type240.id, gyldig_fra: '2026-01-01', gyldig_til: null });
    const periode2026 = { periode_fra: '2026-01-01', periode_til: '2027-01-01' };

    const resultat = beregnOpkraevningslinjer([m], periode2026, seedTakster);

    const takst2026Seed = seedTakster.find((t) => t.id === 'takst-240-1-2026');
    expect(takst2026Seed).toBeDefined();
    expect(resultat.linjer).toHaveLength(1);
    expect(resultat.linjer[0]?.takst_id).toBe('takst-240-1-2026');
    expect(resultat.beloeb_total_oere).toBe(takst2026Seed?.beloeb_aarligt_oere);
  });
});
