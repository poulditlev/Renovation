import { describe, expect, it } from 'vitest';
import type { LoebendeYdelse } from './loebendeYdelse.js';
import {
  addMaaneder,
  beregnLoebendeStatus,
  beregnPeriode,
  findUdloebende,
  forny,
  opretLoebendeYdelse,
} from './fornyelse.js';
import { beregnOpkraevningslinjer } from '../beregning/index.js';
import { takster } from '../klassifikationer/index.js';

// Hjælper: en løbende ydelse med fornuftige standardværdier.
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

describe('addMaaneder', () => {
  it('lægger måneder til uden at gå galt ved årsskifte', () => {
    expect(addMaaneder('2026-01-01', 12)).toBe('2027-01-01');
    expect(addMaaneder('2026-10-01', 6)).toBe('2027-04-01');
  });

  it('klipper til månedens sidste dag når måldagen ikke findes', () => {
    expect(addMaaneder('2026-01-31', 1)).toBe('2026-02-28'); // 2026 er ikke skudår
    expect(addMaaneder('2028-01-31', 1)).toBe('2028-02-29'); // 2028 er skudår
  });
});

describe('beregnPeriode / opretLoebendeYdelse', () => {
  it('en ydelse med 12 mdr. binding fra 01-01-2026 slutter 01-01-2027', () => {
    const periode = beregnPeriode('2026-01-01', 12);
    expect(periode).toEqual({ gyldig_fra: '2026-01-01', gyldig_til: '2027-01-01' });
  });

  it('afviser en periode kortere end 6 måneder', () => {
    expect(() => beregnPeriode('2026-01-01', 3)).toThrow();
  });

  it('opretter en ydelse med beregnet slutdato ud fra bindingsperiode-koden', () => {
    const y = opretLoebendeYdelse({
      id: 'y-ny',
      ejendom_id: 'ejendom-1',
      ydelsestype_id: 'ytype-beholder-240-2',
      materieltype_id: 'mtype-240-2',
      bindingsperiode_kode: '12_MDR',
      startdato: '2026-01-01',
      hjemmel: 'Regulativ § 9',
      oprettet: '2026-01-01T09:00:00.000Z',
      oprettet_af: 'test',
    });
    expect(y.gyldig_fra).toBe('2026-01-01');
    expect(y.gyldig_til).toBe('2027-01-01');
    expect(y.forrige_ydelse_id).toBeNull();
  });
});

describe('forny', () => {
  it('giver INGEN huller og INTET overlap mellem gammel og ny periode', () => {
    const gammel = ydelse({ gyldig_fra: '2026-01-01', gyldig_til: '2027-01-01' });
    const ny = forny(gammel, { nyId: 'y2', oprettet: '2026-12-01T09:00:00.000Z', oprettet_af: 'test' });

    // Ny startdato = gammel slutdato (eksklusiv): [fra, til) efterfulgt af [til, nyTil)
    expect(ny.gyldig_fra).toBe(gammel.gyldig_til);
    // Intet overlap: den nye periode starter ikke før den gamle slutter.
    expect(ny.gyldig_fra >= (gammel.gyldig_til as string)).toBe(true);
    // Intet hul: der er ingen dato mellem gammel.gyldig_til og ny.gyldig_fra.
    expect(ny.gyldig_fra).toBe(gammel.gyldig_til);
    // Ny periode har korrekt længde (12 mdr).
    expect(ny.gyldig_til).toBe('2028-01-01');
    expect(ny.forrige_ydelse_id).toBe(gammel.id);
  });

  it('ændrer IKKE den gamle række', () => {
    const gammel = ydelse({ gyldig_fra: '2026-01-01', gyldig_til: '2027-01-01' });
    const foer = structuredClone(gammel);
    forny(gammel, { nyId: 'y2', oprettet: '2026-12-01T09:00:00.000Z', oprettet_af: 'test' });
    expect(gammel).toEqual(foer); // uændret - historikken bevares
  });

  it('kan forny med en anden bindingsperiode', () => {
    const gammel = ydelse({ gyldig_til: '2027-01-01', bindingsperiode_kode: '12_MDR' });
    const ny = forny(gammel, {
      nyId: 'y2',
      bindingsperiode_kode: '24_MDR',
      oprettet: '2026-12-01T09:00:00.000Z',
      oprettet_af: 'test',
    });
    expect(ny.gyldig_fra).toBe('2027-01-01');
    expect(ny.gyldig_til).toBe('2029-01-01');
  });
});

describe('findUdloebende', () => {
  it('tager en ydelse der udløber om 30 dage med, men ikke en der udløber om 90', () => {
    const om30 = ydelse({ id: 'om30', gyldig_til: '2026-07-31' });
    const om90 = ydelse({ id: 'om90', gyldig_til: '2026-09-29' });
    const resultat = findUdloebende([om30, om90], '2026-07-01', 60);

    const snartIds = resultat.udloeberSnart.map((y) => y.id);
    expect(snartIds).toContain('om30');
    expect(snartIds).not.toContain('om90');
    expect(resultat.udloebet).toHaveLength(0);
  });

  it('placerer allerede udløbne ydelser i udloebet', () => {
    const udloebet = ydelse({ id: 'gammel', gyldig_til: '2026-06-01' });
    const resultat = findUdloebende([udloebet], '2026-07-01', 60);
    expect(resultat.udloebet.map((y) => y.id)).toContain('gammel');
    expect(resultat.udloeberSnart).toHaveLength(0);
  });

  it('beregner status konsistent med findUdloebende', () => {
    expect(beregnLoebendeStatus(ydelse({ gyldig_til: '2026-07-31' }), '2026-07-01', 60)).toBe('UDLOEBER_SNART');
    expect(beregnLoebendeStatus(ydelse({ gyldig_til: '2026-09-29' }), '2026-07-01', 60)).toBe('AKTIV');
    expect(beregnLoebendeStatus(ydelse({ gyldig_til: '2026-06-01' }), '2026-07-01', 60)).toBe('UDLOEBET');
  });
});

describe('udløbet ydelse i opkrævning', () => {
  it('en udløbet ydelse indgår IKKE i opkrævningen for perioden efter slutdatoen', () => {
    // Ydelsen udløber 01-07-2026; vi opkræver for andet halvår.
    const udloebetYdelse = ydelse({ gyldig_fra: '2025-07-01', gyldig_til: '2026-07-01' });
    const periode = { periode_fra: '2026-07-01', periode_til: '2027-01-01' };

    // En løbende ydelse er strukturelt kompatibel med takstberegningens materiel-input.
    const resultat = beregnOpkraevningslinjer([udloebetYdelse], periode, takster);
    expect(resultat.linjer).toHaveLength(0);
    expect(resultat.beloeb_total_oere).toBe(0);
  });

  it('en aktiv ydelse indgår derimod i opkrævningen', () => {
    const aktiv = ydelse({ gyldig_fra: '2026-01-01', gyldig_til: '2027-01-01' });
    const periode = { periode_fra: '2026-07-01', periode_til: '2027-01-01' };
    const resultat = beregnOpkraevningslinjer([aktiv], periode, takster);
    expect(resultat.beloeb_total_oere).toBeGreaterThan(0);
  });
});
