import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { server } from './index.js';
import { tilfoejSag } from '../data/sagStore.js';

// Integrationstests for adgangshåndhævelsen i API-laget. Starter serveren på en
// tilfældig port og sender rigtige HTTP-forespørgsler med X-Bruger-headeren.

let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

const SAGSBEHANDLER = { 'X-Bruger': 'SAGSBEHANDLER' };
const BORGER_01 = { 'X-Bruger': 'BORGER:part-01' };

function get(sti: string, headers: Record<string, string> = {}) {
  return fetch(`${base}${sti}`, { headers });
}
async function getJson(sti: string, headers: Record<string, string> = {}): Promise<any> {
  return (await get(sti, headers)).json();
}
function post(sti: string, headers: Record<string, string> = {}, body: unknown = {}) {
  return fetch(`${base}${sti}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('adgang: identitet', () => {
  it('afviser en API-forespørgsel uden X-Bruger-header', async () => {
    const r = await get('/api/ejendomme');
    expect(r.status).toBe(403);
  });

  it('afviser en ugyldig identitet (ukendt part)', async () => {
    const r = await get('/api/ejendomme', { 'X-Bruger': 'BORGER:findes-ikke' });
    expect(r.status).toBe(403);
  });
});

describe('adgang: GET /api/ejendomme filtreres på serveren', () => {
  it('sagsbehandler ser alle ejendomme', async () => {
    const data = await getJson('/api/ejendomme', SAGSBEHANDLER);
    expect(data.ejendomme.length).toBeGreaterThan(1);
  });

  it('en borger ser kun sine egne ejendomme', async () => {
    const data = await getJson('/api/ejendomme', BORGER_01);
    expect(data.ejendomme.map((e: { id: string }) => e.id)).toEqual(['ejendom-01']);
  });
});

describe('adgang: en borger må kun se sine egne ejendommes data', () => {
  it('borger må se sin egen ejendom', async () => {
    const r = await get('/api/ejendomme/ejendom-01', BORGER_01);
    expect(r.status).toBe(200);
  });

  it('borger må ikke se en anden borgers ejendom (403)', async () => {
    const r = await get('/api/ejendomme/ejendom-02', BORGER_01);
    expect(r.status).toBe(403);
  });
});

describe('adgang: forbudte POST-ruter afvises for borgere', () => {
  const ruter = [
    '/api/ejendomme/ejendom-01/ydelser/loebende',
    '/api/ejendomme/ejendom-01/ydelser/engangs',
    '/api/ydelser/loebende/ly-01-1/forny',
    '/api/ydelser/loebende/ly-01-1/varsling',
    '/api/ejendomme/ejendom-01/opkraevning/dan',
    '/api/opkraevning/opk-1/status',
    '/api/sager/sag-seed-2/status',
    '/api/sager/sag-seed-2/afgoerelse',
    '/api/sager/sag-seed-2/journalnotat',
    '/api/ejendomme/ejendom-01/sager',
  ];
  for (const sti of ruter) {
    it(`403 for borger: POST ${sti}`, async () => {
      const r = await post(sti, BORGER_01);
      expect(r.status).toBe(403);
    });
  }
});

describe('adgang: kontaktoplysninger', () => {
  it('borger må rette sin egen parts kontaktoplysninger', async () => {
    const r = await post('/api/parter/part-01/kontakt', BORGER_01, { email: 'egen@example.dk' });
    expect(r.status).toBe(200);
  });

  it('borger må ikke rette en anden parts kontaktoplysninger (403)', async () => {
    const r = await post('/api/parter/part-02/kontakt', BORGER_01, { email: 'x@example.dk' });
    expect(r.status).toBe(403);
  });

  it('audit-posten indeholder både bruger og rolle', async () => {
    await post('/api/parter/part-01/kontakt', BORGER_01, { telefon: '11 22 33 44' });
    const data = await getJson('/api/parter/part-01/kontakt-historik', BORGER_01);
    expect(data.historik.length).toBeGreaterThan(0);
    expect(data.historik[0]).toMatchObject({ rolle: 'BORGER' });
    expect(typeof data.historik[0].bruger).toBe('string');
  });
});

describe('adgang: sagsbehandler kan stadig udføre handlinger', () => {
  it('sagsbehandler må danne opkrævning', async () => {
    const r = await post('/api/ejendomme/ejendom-01/opkraevning/dan', SAGSBEHANDLER, {
      periode_fra: '2026-01-01',
      periode_til: '2027-01-01',
    });
    expect(r.status).toBe(201);
  });
});

describe('sporbarhed: kanal på sag', () => {
  it('en sag oprettet af en borger får kanal SELVBETJENING', () => {
    const sag = tilfoejSag(
      { ejendom_id: 'ejendom-01', sagstype_id: 'stype-dispensation-binding' },
      { rolle: 'BORGER', navn: 'Testa Testesen (fiktiv)' },
    );
    expect(sag.kanal).toBe('SELVBETJENING');
  });

  it('en sag oprettet af en sagsbehandler får kanal SAGSBEHANDLER', () => {
    const sag = tilfoejSag(
      { ejendom_id: 'ejendom-01', sagstype_id: 'stype-dispensation-binding' },
      { rolle: 'SAGSBEHANDLER', navn: 'Sagsbehandler ABC' },
    );
    expect(sag.kanal).toBe('SAGSBEHANDLER');
  });
});
