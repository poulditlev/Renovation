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
const BORGER_02 = { 'X-Bruger': 'BORGER:part-02' };

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

describe('borger-oversigt: GET /api/mine filtreres på serveren', () => {
  it('afvises uden identitet og for sagsbehandler', async () => {
    expect((await get('/api/mine')).status).toBe(403);
    expect((await get('/api/mine', SAGSBEHANDLER)).status).toBe(403);
  });

  it('returnerer kun borgerens egne ejendomme', async () => {
    const data = await getJson('/api/mine', BORGER_01);
    expect(data.borger.part_id).toBe('part-01');
    expect(data.ejendomme.map((e: { id: string }) => e.id)).toEqual(['ejendom-01']);
  });

  it('en anden borger får ikke ejendom-01 i sit svar', async () => {
    const data = await getJson('/api/mine', BORGER_02);
    const ids = data.ejendomme.map((e: { id: string }) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('ejendom-01');
  });

  it('sagerne i svaret er kun borgerens egne', async () => {
    const numre = (h: Record<string, string>) =>
      getJson('/api/mine', h).then((d) =>
        d.ejendomme.flatMap((e: { sager: { sagsnummer: string }[] }) => e.sager.map((s) => s.sagsnummer)),
      );
    expect(await numre(BORGER_01)).toContain('REN-2026-00098');
    // Borger-02 må ikke se borger-01's sag.
    expect(await numre(BORGER_02)).not.toContain('REN-2026-00098');
  });

  it('regningerne i svaret er kun borgerens egne', async () => {
    // Sagsbehandler danner en opkrævning på ejendom-01.
    await post('/api/ejendomme/ejendom-01/opkraevning/dan', SAGSBEHANDLER, {
      periode_fra: '2026-01-01',
      periode_til: '2027-01-01',
    });
    const d1 = await getJson('/api/mine', BORGER_01);
    const e01 = d1.ejendomme.find((e: { id: string }) => e.id === 'ejendom-01');
    expect(e01.regninger.length).toBeGreaterThan(0);

    // Borger-02 får slet ikke ejendom-01 (og dermed ingen af dens regninger).
    const d2 = await getJson('/api/mine', BORGER_02);
    expect(d2.ejendomme.map((e: { id: string }) => e.id)).not.toContain('ejendom-01');
  });
});

describe('selvbetjening: borgerens ansøgning skaber en sag - ikke en ydelse', () => {
  async function antalLoebende(ejendomId: string): Promise<number> {
    const data = await getJson(`/api/ejendomme/${ejendomId}/ydelser`, SAGSBEHANDLER);
    return data.loebende.length;
  }

  it('en ansøgning opretter en sag med status MODTAGET og kanal SELVBETJENING', async () => {
    const r = await post('/api/ejendomme/ejendom-01/ansoegninger', BORGER_01, {
      art: 'EKSTRA_BEHOLDER',
      ydelsestype_id: 'ytype-beholder-240-2',
      oensket_startdato: '2026-09-01',
    });
    expect(r.status).toBe(201);
    const sag: any = await r.json();
    expect(sag.status).toBe('MODTAGET');
    expect(sag.kanal).toBe('SELVBETJENING');
    expect(sag.part_id).toBe('part-01');
    expect(sag.ansoegning.art).toBe('EKSTRA_BEHOLDER');
    expect(sag.ansoegning.materieltype_id).toBe('mtype-240-2'); // udledt på serveren
  });

  it('en ansøgning opretter IKKE en ydelse direkte', async () => {
    const foer = await antalLoebende('ejendom-01');
    const r = await post('/api/ejendomme/ejendom-01/ansoegninger', BORGER_01, {
      art: 'EKSTRA_BEHOLDER',
      ydelsestype_id: 'ytype-beholder-240-2',
      oensket_startdato: '2026-09-01',
    });
    expect(r.status).toBe(201);
    const efter = await antalLoebende('ejendom-01');
    expect(efter).toBe(foer); // ingen ny ydelse - kun en sag
  });

  it('en borger kan kun ansøge på sin egen ejendom (403 på en andens)', async () => {
    const r = await post('/api/ejendomme/ejendom-02/ansoegninger', BORGER_01, {
      art: 'EKSTRA_BEHOLDER',
      ydelsestype_id: 'ytype-beholder-240-2',
    });
    expect(r.status).toBe(403);
  });

  it('en borger må ikke effektuere (kun sagsbehandler)', async () => {
    const opret = await post('/api/ejendomme/ejendom-01/ansoegninger', BORGER_01, {
      art: 'EKSTRA_BEHOLDER',
      ydelsestype_id: 'ytype-beholder-240-2',
    });
    const sag: any = await opret.json();
    const r = await post(`/api/sager/${sag.id}/effektuer`, BORGER_01);
    expect(r.status).toBe(403);
  });

  it('sagsbehandleren kan effektuere en imødekommet ansøgning - ydelsen oprettes med korrekt periode', async () => {
    // Borger ansøger.
    const opret = await post('/api/ejendomme/ejendom-01/ansoegninger', BORGER_01, {
      art: 'EKSTRA_BEHOLDER',
      ydelsestype_id: 'ytype-beholder-240-2',
      oensket_startdato: '2026-09-01',
    });
    const sag: any = await opret.json();
    const foer = await antalLoebende('ejendom-01');

    // Sagsbehandler imødekommer (hjemmel obligatorisk).
    const afg = await post(`/api/sager/${sag.id}/afgoerelse`, SAGSBEHANDLER, {
      resultat: 'IMOEDEKOMMET',
      begrundelse: 'Bevilget efter regulativet.',
      hjemmel: 'Regulativ for husholdningsaffald § 9',
    });
    expect(afg.status).toBe(201);

    // Effektuering opretter den ansøgte løbende ydelse.
    const eff = await post(`/api/sager/${sag.id}/effektuer`, SAGSBEHANDLER, { bindingsperiode_kode: '12_MDR' });
    expect(eff.status).toBe(201);

    const data = await getJson('/api/ejendomme/ejendom-01/ydelser', SAGSBEHANDLER);
    expect(data.loebende.length).toBe(foer + 1);
    const ny = data.loebende.find((y: { gyldig_fra: string }) => y.gyldig_fra === '2026-09-01');
    expect(ny).toBeTruthy();
    expect(ny.gyldig_til).toBe('2027-09-01'); // start + 12 mdr.

    // Kan ikke effektueres to gange.
    const eff2 = await post(`/api/sager/${sag.id}/effektuer`, SAGSBEHANDLER, {});
    expect(eff2.status).toBe(400);
  });

  it('en imødekommet ansøgning uden hjemmel afvises', async () => {
    const opret = await post('/api/ejendomme/ejendom-01/ansoegninger', BORGER_01, {
      art: 'EKSTRA_BEHOLDER',
      ydelsestype_id: 'ytype-beholder-240-2',
    });
    const sag: any = await opret.json();
    const afg = await post(`/api/sager/${sag.id}/afgoerelse`, SAGSBEHANDLER, {
      resultat: 'IMOEDEKOMMET',
      begrundelse: 'Mangler hjemmel',
      hjemmel: '',
    });
    expect(afg.status).toBe(400);
  });
});

describe('sagsoverblik: prioriteret visning kun for sagsbehandlere', () => {
  it('en borger afvises med 403', async () => {
    const r = await get('/api/sagsoverblik', BORGER_01);
    expect(r.status).toBe(403);
  });

  it('svaret har totaler pr. hastegrad og en sorteret liste', async () => {
    const data = await getJson('/api/sagsoverblik?omfang=alle', SAGSBEHANDLER);
    expect(data.totaler).toEqual(
      expect.objectContaining({ KRITISK: expect.any(Number), HOEJ: expect.any(Number), NORMAL: expect.any(Number), AFVENTER: expect.any(Number) }),
    );
    // Uden hastegrad/kategori-filter summer totalerne til antal poster.
    const sum = data.totaler.KRITISK + data.totaler.HOEJ + data.totaler.NORMAL + data.totaler.AFVENTER;
    expect(sum).toBe(data.poster.length);
    // Sorteret: hastegrad-rang aldrig faldende.
    const rang: Record<string, number> = { KRITISK: 0, HOEJ: 1, NORMAL: 2, AFVENTER: 3 };
    for (let i = 1; i < data.poster.length; i++) {
      expect(rang[data.poster[i].hastegrad] ?? 0).toBeGreaterThanOrEqual(rang[data.poster[i - 1].hastegrad] ?? 0);
    }
  });

  it('"mine" viser kun den ansvarliges sager; "alle" viser også borger-oprettede', async () => {
    // Borgeren opretter en ansøgning → sag uden ansvarlig sagsbehandler.
    const opret = await post('/api/ejendomme/ejendom-01/ansoegninger', BORGER_01, {
      art: 'EKSTRA_BEHOLDER',
      ydelsestype_id: 'ytype-beholder-240-2',
    });
    const sag: any = await opret.json();
    const nr = sag.sagsnummer;

    const mine = await getJson('/api/sagsoverblik?omfang=mine', SAGSBEHANDLER);
    expect(mine.poster.some((p: { sagsnummer: string }) => p.sagsnummer === nr)).toBe(false);

    const alle = await getJson('/api/sagsoverblik?omfang=alle', SAGSBEHANDLER);
    expect(alle.poster.some((p: { sagsnummer: string }) => p.sagsnummer === nr)).toBe(true);
  });

  it('hastegrad-filteret returnerer kun poster med den hastegrad', async () => {
    const data = await getJson('/api/sagsoverblik?omfang=alle&hastegrad=KRITISK', SAGSBEHANDLER);
    for (const p of data.poster) expect(p.hastegrad).toBe('KRITISK');
  });

  it('afdeling_total tæller hele afdelingen uafhængigt af omfang', async () => {
    const alle = await getJson('/api/sagsoverblik?omfang=alle', SAGSBEHANDLER);
    const mine = await getJson('/api/sagsoverblik?omfang=mine', SAGSBEHANDLER);
    // Uden filtre er "alle"-listen præcis afdelingens poster.
    expect(alle.afdeling_total).toBe(alle.poster.length);
    // afdeling_total er den samme uanset omfang.
    expect(mine.afdeling_total).toBe(alle.afdeling_total);
    // Afdelingen har mindst lige så mange poster som "mine".
    expect(alle.afdeling_total).toBeGreaterThanOrEqual(mine.poster.length);
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
