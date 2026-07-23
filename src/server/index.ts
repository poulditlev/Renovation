import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import type { Ejendom } from '../domain/index.js';
import { alleEjendomme, findEjendom, parterForEjendom } from '../data/store.js';
import { byggEjendomVisning } from './ejendomVisning.js';
import { DawaFejl, hentJordstykke, soegAdresser, type AdresseForslag } from '../adresse/dawa.js';

// Simpel HTTP-server for sagsbehandler-brugerfladen. Serverer de statiske filer
// i public/ og et lille JSON-API. Al DAWA-kommunikation går gennem det
// isolerede adressemodul - serveren kender ikke DAWA's rå format.

const HER = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HER, '..', '..', 'public');
const PORT = Number(process.env.PORT ?? 3000);

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const krop = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(krop);
}

/** Normaliserer adressetekst, så DAWA-forslag kan matches mod seed-ejendomme. */
function normaliserAdresse(tekst: string): string {
  return tekst.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findSeedEjendomVedAdressetekst(tekst: string): Ejendom | undefined {
  const n = normaliserAdresse(tekst);
  return alleEjendomme().find((e) => normaliserAdresse(e.adressetekst) === n);
}

// --- API-håndtering ----------------------------------------------------------

/** GET /api/ejendomme - kort liste til venstremenuen. */
function haandterEjendomsliste(res: ServerResponse): void {
  const liste = alleEjendomme().map((e) => {
    const betaler = parterForEjendom(e.id).find((p) => p.kobling.rolle === 'BETALER');
    return {
      id: e.id,
      adressetekst: e.adressetekst,
      bfe_nummer: e.bfe_nummer,
      part_navn: betaler?.part.navn ?? null,
    };
  });
  sendJson(res, 200, { ejendomme: liste });
}

/** GET /api/ejendomme/:id - fuld visning. */
function haandterEjendom(res: ServerResponse, id: string): void {
  const ejendom = findEjendom(id);
  if (!ejendom) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  sendJson(res, 200, byggEjendomVisning(ejendom));
}

/** GET /api/adresse/soeg?q= - DAWA autocomplete, beriget med kendt ejendom. */
async function haandterAdressesoeg(res: ServerResponse, q: string): Promise<void> {
  try {
    const forslag = await soegAdresser(q);
    const beriget = forslag.map((f: AdresseForslag) => ({
      ...f,
      kendt_ejendom_id: findSeedEjendomVedAdressetekst(f.adressetekst)?.id ?? null,
    }));
    sendJson(res, 200, { forslag: beriget });
  } catch (e) {
    haandterDawaFejl(res, e);
  }
}

/**
 * GET /api/adresse/opslag?tekst=&husnummer_uuid= - visning for en adresse valgt
 * i DAWA-søgningen. Kender vi ejendommen (seed), vises den direkte. Ellers
 * bygges en visning live: adressedata fra forslaget + jordstykke fra DAWA,
 * uden part og materiel (adressen er ikke oprettet i registret).
 */
async function haandterAdresseopslag(
  res: ServerResponse,
  params: URLSearchParams,
): Promise<void> {
  const tekst = params.get('tekst') ?? '';
  const kendt = findSeedEjendomVedAdressetekst(tekst);
  if (kendt) {
    sendJson(res, 200, { ...byggEjendomVisning(kendt), kilde: 'register' });
    return;
  }

  const adresseUuid = params.get('adresse_uuid') ?? '';
  const husnummerUuid = params.get('husnummer_uuid');
  const lat = params.get('lat');
  const lng = params.get('lng');
  const kommuneNavn = params.get('kommune_navn');

  try {
    const jordstykke = husnummerUuid ? await hentJordstykke(husnummerUuid) : null;
    const ejendom: Ejendom = {
      id: `live-${adresseUuid}`,
      bfe_nummer: '(ukendt - ikke oprettet i registret)',
      adresse_uuid: adresseUuid,
      adressetekst: tekst,
      kommunekode: '0265',
      kommunenavn: kommuneNavn && kommuneNavn.length > 0 ? kommuneNavn : null,
      matrikelnummer: jordstykke?.matrikelnummer ?? '',
      ejerlavskode: jordstykke?.ejerlavskode ?? '',
      ejerlavsnavn: jordstykke?.ejerlavsnavn ?? null,
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
      jordstykke_geojson: jordstykke?.geojson ?? null,
      anvendelseskode: null,
      husnummer_uuid: husnummerUuid,
      oprettet: new Date().toISOString(),
      oprettet_af: 'live-opslag',
    };
    // Ejendommen er ikke i lageret, så parter og materiel bliver tomme.
    sendJson(res, 200, { ...byggEjendomVisning(ejendom), kilde: 'live' });
  } catch (e) {
    haandterDawaFejl(res, e);
  }
}

function haandterDawaFejl(res: ServerResponse, e: unknown): void {
  if (e instanceof DawaFejl) {
    const status = e.kind === 'netvaerksfejl' ? 502 : 502;
    sendJson(res, status, {
      fejl: 'Adresseopslaget mod DAWA kunne ikke gennemføres.',
      detalje: e.message,
      kind: e.kind,
    });
    return;
  }
  sendJson(res, 500, { fejl: 'Uventet serverfejl.', detalje: (e as Error).message });
}

// --- Statiske filer ----------------------------------------------------------

async function serverStatiskFil(res: ServerResponse, urlSti: string): Promise<void> {
  const relativ = urlSti === '/' ? '/index.html' : urlSti;
  // Beskyt mod sti-traversering: normalisér og hold os inden for PUBLIC_DIR.
  const absolut = normalize(join(PUBLIC_DIR, relativ));
  if (!absolut.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { fejl: 'Adgang nægtet.' });
    return;
  }
  const punktum = absolut.lastIndexOf('.');
  const ext = punktum >= 0 ? absolut.slice(punktum) : '';
  try {
    const indhold = await readFile(absolut);
    res.writeHead(200, { 'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream' });
    res.end(indhold);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Filen blev ikke fundet.');
  }
}

// --- Router ------------------------------------------------------------------

async function haandter(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const sti = url.pathname;

  if (req.method !== 'GET') {
    sendJson(res, 405, { fejl: 'Kun GET understøttes.' });
    return;
  }

  if (sti === '/api/ejendomme') return haandterEjendomsliste(res);

  const ejendomMatch = sti.match(/^\/api\/ejendomme\/([^/]+)$/);
  if (ejendomMatch) return haandterEjendom(res, decodeURIComponent(ejendomMatch[1] as string));

  if (sti === '/api/adresse/soeg') return haandterAdressesoeg(res, url.searchParams.get('q') ?? '');

  if (sti === '/api/adresse/opslag') return haandterAdresseopslag(res, url.searchParams);

  if (sti.startsWith('/api/')) {
    sendJson(res, 404, { fejl: 'Ukendt API-endpoint.' });
    return;
  }

  return serverStatiskFil(res, sti);
}

const server = createServer((req, res) => {
  haandter(req, res).catch((e) => {
    haandterDawaFejl(res, e);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Renovation-demo (TESTMILJØ) kører på http://localhost:${PORT}`);
});
