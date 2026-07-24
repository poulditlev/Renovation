import { describe, expect, it } from 'vitest';
import type { Bruger, Tilknytning } from './adgang.js';
import { HANDLINGER, maaRetteKontakt, maaSeEjendom, maaUdfoere } from './adgang.js';

const sagsbehandler: Bruger = { rolle: 'SAGSBEHANDLER', part_id: null, navn: 'Sagsbehandler ABC' };
const borger01: Bruger = { rolle: 'BORGER', part_id: 'part-01', navn: 'Testa Testesen (fiktiv)' };

// Tilknytninger for en ejendom (delmængde af ejendom_part).
const aktivTilknytning: Tilknytning[] = [{ part_id: 'part-01', gyldig_fra: '2024-01-15', gyldig_til: null }];
const udloebetTilknytning: Tilknytning[] = [{ part_id: 'part-01', gyldig_fra: '2020-01-01', gyldig_til: '2023-01-01' }];

describe('maaSeEjendom', () => {
  it('lader sagsbehandler se alle ejendomme', () => {
    expect(maaSeEjendom(sagsbehandler, [], '2026-07-24')).toBe(true);
  });

  it('lader en borger se sin egen ejendom', () => {
    expect(maaSeEjendom(borger01, aktivTilknytning, '2026-07-24')).toBe(true);
  });

  it('nægter en borger at se en anden borgers ejendom', () => {
    const andenEjendom: Tilknytning[] = [{ part_id: 'part-02', gyldig_fra: '2024-01-15', gyldig_til: null }];
    expect(maaSeEjendom(borger01, andenEjendom, '2026-07-24')).toBe(false);
  });

  it('nægter en borger at se en ejendom med udløbet tilknytning', () => {
    expect(maaSeEjendom(borger01, udloebetTilknytning, '2026-07-24')).toBe(false);
  });
});

describe('maaUdfoere', () => {
  it('lader sagsbehandler udføre alle handlinger', () => {
    for (const h of Object.values(HANDLINGER)) {
      expect(maaUdfoere(sagsbehandler, h)).toBe(true);
    }
  });

  it('lader kun borger rette kontaktoplysninger', () => {
    expect(maaUdfoere(borger01, HANDLINGER.RET_KONTAKT)).toBe(true);
    expect(maaUdfoere(borger01, HANDLINGER.TILFOEJ_LOEBENDE)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.FORNY_YDELSE)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.DAN_OPKRAEVNING)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.SKIFT_OPKRAEVNING_STATUS)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.SKIFT_SAG_STATUS)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.TRAEF_AFGOERELSE)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.SKRIV_JOURNALNOTAT)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.UDLOES_VARSLING)).toBe(false);
    expect(maaUdfoere(borger01, HANDLINGER.OPRET_SAG)).toBe(false);
  });
});

describe('maaRetteKontakt', () => {
  it('lader en borger rette sin egen part, men ikke en andens', () => {
    expect(maaRetteKontakt(borger01, 'part-01')).toBe(true);
    expect(maaRetteKontakt(borger01, 'part-02')).toBe(false);
  });

  it('lader sagsbehandler rette enhver parts kontaktoplysninger', () => {
    expect(maaRetteKontakt(sagsbehandler, 'part-05')).toBe(true);
  });
});
