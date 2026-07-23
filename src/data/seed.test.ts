import { describe, expect, it } from 'vitest';
import { ejendomme, ejendomParter, materiel, parter } from './seed.js';
import { materielForEjendom, parterForEjendom } from './store.js';
import { beregnOpkraevningslinjer } from '../beregning/index.js';
import { takster } from '../klassifikationer/index.js';

describe('seed-data', () => {
  it('har 20 fiktive parter med tomt ekstern_id', () => {
    expect(parter).toHaveLength(20);
    for (const p of parter) {
      expect(p.ekstern_id).toBeNull(); // ingen CPR
      expect(p.navn).toContain('(fiktiv)');
    }
  });

  it('bruger kun @example.dk-mailadresser', () => {
    for (const p of parter) {
      if (p.email) expect(p.email.endsWith('@example.dk')).toBe(true);
    }
  });

  it('blander persontyper: personer, en forening og virksomheder', () => {
    const typer = parter.map((p) => p.parttype);
    expect(typer.filter((t) => t === 'PERSON').length).toBeGreaterThan(0);
    expect(typer.filter((t) => t === 'FORENING').length).toBe(1);
    expect(typer.filter((t) => t === 'VIRKSOMHED').length).toBeGreaterThanOrEqual(2);
  });

  it('kobler hver ejendom til en aktiv betaler', () => {
    for (const e of ejendomme) {
      const parterPaa = parterForEjendom(e.id);
      const betalere = parterPaa.filter((x) => x.kobling.rolle === 'BETALER');
      expect(betalere).toHaveLength(1); // netop én aktiv betaler
    }
  });

  it('giver hver ejendom mindst ét stykke materiel', () => {
    for (const e of ejendomme) {
      expect(materielForEjendom(e.id).length).toBeGreaterThan(0);
    }
  });

  it('kobler ejendom_part til gyldige ejendomme og parter', () => {
    for (const ep of ejendomParter) {
      expect(ejendomme.some((e) => e.id === ep.ejendom_id)).toBe(true);
      expect(parter.some((p) => p.id === ep.part_id)).toBe(true);
    }
  });

  it('hænger sammen med takstberegningen for 2026', () => {
    const periode2026 = { periode_fra: '2026-01-01', periode_til: '2027-01-01' };
    // Enhver ejendoms materiel skal kunne beregnes uden fejl og give et beløb > 0.
    for (const e of ejendomme) {
      const resultat = beregnOpkraevningslinjer(materielForEjendom(e.id), periode2026, takster);
      expect(resultat.beloeb_total_oere).toBeGreaterThan(0);
      const sum = resultat.linjer.reduce((s, l) => s + l.beloeb_oere, 0);
      expect(resultat.beloeb_total_oere).toBe(sum);
    }
  });
});
