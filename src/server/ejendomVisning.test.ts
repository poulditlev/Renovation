import { describe, expect, it } from 'vitest';
import { findEjendom } from '../data/store.js';
import { byggEjendomVisning } from './ejendomVisning.js';

describe('byggEjendomVisning', () => {
  it('samler EJER og BETALER på samme part i én visning', () => {
    const ejendom = findEjendom('ejendom-01');
    if (!ejendom) throw new Error('mangler seed-ejendom');
    const visning = byggEjendomVisning(ejendom, '2026-06-01');

    expect(visning.parter).toHaveLength(1);
    expect(visning.parter[0]?.roller.sort()).toEqual(['BETALER', 'EJER']);
    expect(visning.parter[0]?.navn).toContain('(fiktiv)');
  });

  it('markerer materiel som aktivt eller nedlagt efter dato', () => {
    // Ejendom 07 har en beholder fjernet 2025-07-01 og en ny opsat samme dag.
    const ejendom = findEjendom('ejendom-07');
    if (!ejendom) throw new Error('mangler seed-ejendom');

    const foer = byggEjendomVisning(ejendom, '2025-03-01');
    const gammel = foer.materiel.find((m) => m.gyldig_til === '2025-07-01');
    expect(gammel?.aktiv).toBe(true);

    const efter = byggEjendomVisning(ejendom, '2025-09-01');
    const gammelEfter = efter.materiel.find((m) => m.gyldig_til === '2025-07-01');
    expect(gammelEfter?.aktiv).toBe(false);
  });

  it('viser fraktioner pr. kammer for to-delte beholdere', () => {
    const ejendom = findEjendom('ejendom-01');
    if (!ejendom) throw new Error('mangler seed-ejendom');
    const visning = byggEjendomVisning(ejendom);
    const todelt = visning.materiel.find((m) => m.antal_kamre === 2);
    expect(todelt?.fraktioner.length).toBe(2);
    expect(todelt?.fraktioner[0]).toContain('Kammer 1');
  });
});
