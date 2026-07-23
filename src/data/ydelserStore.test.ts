import { describe, expect, it } from 'vitest';
import {
  engangsForEjendom,
  fornyLoebende,
  loebendeForEjendom,
  registrerVarsling,
  varslingerForEjendom,
} from './ydelserStore.js';

describe('ydelserStore (in-memory)', () => {
  it('har seed-ydelser fordelt på ejendomme', () => {
    expect(loebendeForEjendom('ejendom-01').length).toBeGreaterThanOrEqual(2);
    expect(engangsForEjendom('ejendom-01').length).toBeGreaterThanOrEqual(1);
  });

  it('fornyelse tilføjer en ny række uden at ændre eller slette den gamle', () => {
    const foer = loebendeForEjendom('ejendom-01');
    const gammel = foer.find((y) => y.id === 'ly-01-2');
    if (!gammel) throw new Error('mangler seed-ydelse ly-01-2');
    const gammelSnapshot = structuredClone(gammel);

    const ny = fornyLoebende('ly-01-2');

    // Den gamle findes stadig og er uændret.
    const gammelEfter = loebendeForEjendom('ejendom-01').find((y) => y.id === 'ly-01-2');
    expect(gammelEfter).toEqual(gammelSnapshot);
    // Den nye ligger i forlængelse og peger tilbage.
    expect(ny.gyldig_fra).toBe(gammelSnapshot.gyldig_til);
    expect(ny.forrige_ydelse_id).toBe('ly-01-2');
    expect(loebendeForEjendom('ejendom-01').length).toBe(foer.length + 1);
  });

  it('registrerer en varsling som data (uden at sende e-mail)', () => {
    const varsling = registrerVarsling('ly-01-2');
    expect(varsling.kanal).toBe('EMAIL_DEAKTIVERET');
    expect(varsling.modtager_email).toContain('@example.dk');
    expect(varslingerForEjendom('ejendom-01').map((v) => v.id)).toContain(varsling.id);
  });
});
