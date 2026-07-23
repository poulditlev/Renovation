import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DawaFejl,
  hentJordstykke,
  parseAutocomplete,
  parseJordstykke,
  soegAdresser,
  type FetchFn,
} from './dawa.js';

// Testene læser GEMTE eksempelsvar fra repoet og kalder ALDRIG ud på nettet.
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
function fixtur(navn: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, navn), 'utf8'));
}

/** Bygger en fake fetch der svarer med et fast JSON-objekt. */
function fakeFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}): FetchFn {
  return async () => ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => body,
  });
}

describe('parseAutocomplete', () => {
  it('oversætter DAWA-svar til rene forslag med adresse_uuid som nøgle', () => {
    const forslag = parseAutocomplete(fixtur('autocomplete-staendertorvet.json'));
    expect(forslag).toHaveLength(2);
    expect(forslag[0]).toEqual({
      adresse_uuid: '0a3f507a-1111-32b8-e044-0003ba298018',
      husnummer_uuid: 'b8f9d1a0-1111-4d9a-9f2a-0003ba298018',
      adressetekst: 'Stændertorvet 2, 4000 Roskilde',
      vejnavn: 'Stændertorvet',
      husnr: '2',
      postnr: '4000',
      postnrnavn: 'Roskilde',
      kommunekode: '0265',
      latitude: 55.64192,
      longitude: 12.08031,
    });
  });

  it('giver en tom liste ved ingen resultater', () => {
    expect(parseAutocomplete(fixtur('autocomplete-tom.json'))).toEqual([]);
  });

  it('springer elementer uden UUID over i stedet for at kaste', () => {
    const raw = [
      { tekst: 'Uden adgangsadresse' },
      { tekst: 'Uden id', adgangsadresse: { vejnavn: 'Testvej' } },
      {
        tekst: 'Gyldig, 4000 Roskilde',
        adgangsadresse: { id: 'abc', vejnavn: 'Gyldig', husnr: '1', postnr: '4000', postnrnavn: 'Roskilde', kommunekode: '0265', x: 12, y: 55 },
      },
    ];
    const forslag = parseAutocomplete(raw);
    expect(forslag).toHaveLength(1);
    expect(forslag[0]?.adresse_uuid).toBe('abc');
    expect(forslag[0]?.husnummer_uuid).toBeNull();
  });

  it('kaster DawaFejl(ugyldigt_svar) hvis svaret ikke er en liste', () => {
    expect(() => parseAutocomplete({ noget: 'andet' })).toThrow(DawaFejl);
  });
});

describe('parseJordstykke', () => {
  it('oversætter GeoJSON-svar til et rent jordstykke med geometri', () => {
    const jordstykke = parseJordstykke(fixtur('jordstykke.json'));
    expect(jordstykke).not.toBeNull();
    expect(jordstykke?.matrikelnummer).toBe('210a');
    expect(jordstykke?.ejerlavskode).toBe('20551'); // talkode oversat til streng
    expect(jordstykke?.ejerlavsnavn).toBe('Roskilde Bygrunde');
    expect((jordstykke?.geojson as { type: string }).type).toBe('Polygon');
  });

  it('returnerer null for en adresse uden jordstykke (tom FeatureCollection)', () => {
    expect(parseJordstykke(fixtur('jordstykke-tom.json'))).toBeNull();
  });

  it('kaster DawaFejl(ugyldigt_svar) hvis svaret ikke er en FeatureCollection', () => {
    expect(() => parseJordstykke({ type: 'noget' })).toThrow(DawaFejl);
  });
});

describe('soegAdresser (med injiceret fetch, ingen netadgang)', () => {
  it('returnerer parsede forslag', async () => {
    const forslag = await soegAdresser('Stændertorvet', fakeFetch(fixtur('autocomplete-staendertorvet.json')));
    expect(forslag).toHaveLength(2);
  });

  it('giver tom liste for tom søgetekst uden at kalde fetch', async () => {
    let kaldt = false;
    const spionFetch: FetchFn = async () => {
      kaldt = true;
      return { ok: true, status: 200, json: async () => [] };
    };
    expect(await soegAdresser('   ', spionFetch)).toEqual([]);
    expect(kaldt).toBe(false);
  });

  it('kaster DawaFejl(netvaerksfejl) ved netværksfejl', async () => {
    const fejlendeFetch: FetchFn = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(soegAdresser('Algade', fejlendeFetch)).rejects.toMatchObject({ kind: 'netvaerksfejl' });
  });

  it('kaster DawaFejl(netvaerksfejl) ved HTTP-fejlstatus', async () => {
    await expect(soegAdresser('Algade', fakeFetch([], { ok: false, status: 500 }))).rejects.toMatchObject({
      kind: 'netvaerksfejl',
    });
  });
});

describe('hentJordstykke (med injiceret fetch, ingen netadgang)', () => {
  it('returnerer et parset jordstykke', async () => {
    const jordstykke = await hentJordstykke('b8f9d1a0-1111-4d9a-9f2a-0003ba298018', fakeFetch(fixtur('jordstykke.json')));
    expect(jordstykke?.matrikelnummer).toBe('210a');
  });

  it('returnerer null for en adresse uden jordstykke', async () => {
    const jordstykke = await hentJordstykke('ukendt', fakeFetch(fixtur('jordstykke-tom.json')));
    expect(jordstykke).toBeNull();
  });
});
