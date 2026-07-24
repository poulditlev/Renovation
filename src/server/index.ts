import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import type { Ejendom } from '../domain/index.js';
import {
  alleEjendomme,
  findEjendom,
  findPart,
  parterForEjendom,
  tilknytningerForEjendom,
} from '../data/store.js';
import {
  HANDLINGER,
  maaRetteKontakt,
  maaSeEjendom,
  maaUdfoere,
  type Bruger,
  type Handling,
} from '../adgang/index.js';
import { byggEjendomVisning } from './ejendomVisning.js';
import { byggYdelserVisning } from './ydelserVisning.js';
import { DawaFejl, hentJordstykke, soegAdresser, type AdresseForslag } from '../adresse/dawa.js';
import { bindingsperioder, ydelsestyper } from '../ydelser/index.js';
import { takster } from '../klassifikationer/index.js';
import {
  engangsForEjendom,
  fornyLoebende,
  loebendeForEjendom,
  registrerVarsling,
  tilfoejEngangs,
  tilfoejLoebende,
} from '../data/ydelserStore.js';
import {
  danOpkraevning,
  linjerForOpkraevning,
  opkraevningerForEjendom,
  skiftOpkraevningStatus,
} from '../data/opkraevningStore.js';
import type { OpkraevningStatus } from '../opkraevning/index.js';
import { findSagstype, sagstyper } from '../sag/index.js';
import type { Afgoerelsesresultat, SagStatus } from '../sag/index.js';
import {
  afgoerelseForSag,
  journalForSag,
  sagerForEjendom,
  skiftStatus as skiftSagStatusStore,
  tilfoejAfgoerelse,
  tilfoejJournalnotat,
  tilfoejSag,
} from '../data/sagStore.js';
import { partFelter, REGISTER_FORKLARING } from '../domain/index.js';
import { kontaktHistorik, retKontakt } from '../data/partStore.js';

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

/** GET /api/ejendomme - kort liste til combobox-gruppen "Ejendomme i registret".
 *  For borgere filtreres der på SERVEREN til kun borgerens egne ejendomme. */
function haandterEjendomsliste(res: ServerResponse, bruger: Bruger): void {
  const idag = new Date().toISOString().slice(0, 10);
  const synlige = alleEjendomme().filter((e) => maaSeEjendom(bruger, tilknytningerForEjendom(e.id), idag));
  const liste = synlige.map((e) => {
    const betaler = parterForEjendom(e.id).find((p) => p.kobling.rolle === 'BETALER');
    return {
      id: e.id,
      adressetekst: e.adressetekst,
      bfe_nummer: e.bfe_nummer,
      part_navn: betaler?.part.navn ?? null,
      antal_loebende: loebendeForEjendom(e.id).length,
      antal_engangs: engangsForEjendom(e.id).length,
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

// --- Ydelser (løbende + engangs), fornyelse og varsling ----------------------

/** GET /api/ejendomme/:id/ydelser - to adskilte lister + varslinger. */
function haandterYdelser(res: ServerResponse, ejendomId: string): void {
  if (!findEjendom(ejendomId)) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  sendJson(res, 200, byggYdelserVisning(ejendomId));
}

/** GET /api/ydelseskatalog - kodelister til tilføj-dialogen. */
function haandterYdelseskatalog(res: ServerResponse): void {
  sendJson(res, 200, {
    ydelsestyper,
    bindingsperioder,
    // Kun det nødvendige fra takster, så dialogen kan vise den beregnede pris.
    takster: takster.map((t) => ({
      id: t.id,
      materieltype_id: t.materieltype_id,
      beloeb_aarligt_oere: t.beloeb_aarligt_oere,
      gyldig_fra: t.gyldig_fra,
      gyldig_til: t.gyldig_til,
    })),
  });
}

/** Læser hele request-kroppen og parser den som JSON. */
async function laesJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const stykker: Buffer[] = [];
  for await (const stykke of req) {
    stykker.push(stykke as Buffer);
    // Simpel beskyttelse mod for store kroppe.
    if (Buffer.concat(stykker).length > 1_000_000) {
      throw new Error('Kroppen er for stor.');
    }
  }
  const raa = Buffer.concat(stykker).toString('utf8').trim();
  if (raa.length === 0) return {};
  return JSON.parse(raa) as Record<string, unknown>;
}

function somStreng(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** POST /api/ejendomme/:id/ydelser/loebende */
async function haandterTilfoejLoebende(req: IncomingMessage, res: ServerResponse, ejendomId: string): Promise<void> {
  if (!findEjendom(ejendomId)) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  try {
    const krop = await laesJson(req);
    const ny = tilfoejLoebende({
      ejendom_id: ejendomId,
      ydelsestype_id: somStreng(krop['ydelsestype_id']),
      materieltype_id: somStreng(krop['materieltype_id']),
      bindingsperiode_kode: somStreng(krop['bindingsperiode_kode']),
      startdato: somStreng(krop['startdato']),
      hjemmel: somStreng(krop['hjemmel']),
    });
    sendJson(res, 201, ny);
  } catch (e) {
    // Fx binding under 6 måneder afvises af de rene funktioner.
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

/** POST /api/ejendomme/:id/ydelser/engangs */
async function haandterTilfoejEngangs(req: IncomingMessage, res: ServerResponse, ejendomId: string): Promise<void> {
  if (!findEjendom(ejendomId)) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  try {
    const krop = await laesJson(req);
    const antal = Number(krop['antal']);
    const enhedspris = Number(krop['enhedspris_oere']);
    if (!Number.isInteger(antal) || antal < 1) {
      throw new Error('Antal skal være et positivt heltal.');
    }
    if (!Number.isInteger(enhedspris) || enhedspris < 0) {
      throw new Error('Styk-pris skal være et heltal i øre og kan ikke være negativ.');
    }
    const ny = tilfoejEngangs({
      ejendom_id: ejendomId,
      ydelsestype_id: somStreng(krop['ydelsestype_id']),
      leveringsdato: somStreng(krop['leveringsdato']),
      antal,
      enhedspris_oere: enhedspris,
      hjemmel: somStreng(krop['hjemmel']),
    });
    sendJson(res, 201, ny);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

/** POST /api/ydelser/loebende/:id/forny */
async function haandterForny(req: IncomingMessage, res: ServerResponse, ydelseId: string): Promise<void> {
  try {
    const krop = await laesJson(req);
    const binding = somStreng(krop['bindingsperiode_kode']);
    const ny = fornyLoebende(ydelseId, binding.length > 0 ? binding : undefined);
    sendJson(res, 201, ny);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

/** POST /api/ydelser/loebende/:id/varsling - registrerer varsling (sender IKKE e-mail). */
function haandterVarsling(res: ServerResponse, ydelseId: string): void {
  try {
    const varsling = registrerVarsling(ydelseId);
    sendJson(res, 201, varsling);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

// --- Opkrævning --------------------------------------------------------------

/** GET /api/ejendomme/:id/opkraevninger - nyeste opkrævning + linjer + historik. */
function haandterOpkraevninger(res: ServerResponse, ejendomId: string): void {
  if (!findEjendom(ejendomId)) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  const liste = opkraevningerForEjendom(ejendomId);
  const seneste = liste[0] ?? null;
  sendJson(res, 200, {
    seneste: seneste ? { opkraevning: seneste, linjer: linjerForOpkraevning(seneste.id) } : null,
    historik: liste,
  });
}

/** POST /api/ejendomme/:id/opkraevning/dan */
async function haandterDanOpkraevning(req: IncomingMessage, res: ServerResponse, ejendomId: string): Promise<void> {
  if (!findEjendom(ejendomId)) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  try {
    const krop = await laesJson(req);
    const fra = somStreng(krop['periode_fra']) || `${new Date().getFullYear()}-01-01`;
    const til = somStreng(krop['periode_til']) || `${new Date().getFullYear() + 1}-01-01`;
    const dannet = danOpkraevning(ejendomId, fra, til);
    sendJson(res, 201, dannet);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

/** POST /api/opkraevning/:id/status */
async function haandterOpkraevningStatus(req: IncomingMessage, res: ServerResponse, opkId: string): Promise<void> {
  try {
    const krop = await laesJson(req);
    const status = somStreng(krop['status']) as OpkraevningStatus;
    const opdateret = skiftOpkraevningStatus(opkId, status);
    sendJson(res, 200, opdateret);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

// --- Sagsbehandling ----------------------------------------------------------

/** Bygger visningen for sagerne på en ejendom (sagstype-navn, afgørelse, journal). */
function byggSagerVisning(ejendomId: string): unknown {
  return sagerForEjendom(ejendomId).map((sag) => {
    const type = findSagstype(sag.sagstype_id);
    return {
      sag,
      sagstype_navn: type?.navn ?? sag.sagstype_id,
      kle_nummer: type?.kle_nummer ?? null,
      afgoerelse: afgoerelseForSag(sag.id) ?? null,
      journal: journalForSag(sag.id),
    };
  });
}

/** GET /api/ejendomme/:id/sager */
function haandterSager(res: ServerResponse, ejendomId: string): void {
  if (!findEjendom(ejendomId)) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  sendJson(res, 200, { sager: byggSagerVisning(ejendomId) });
}

/** GET /api/sagskatalog */
function haandterSagskatalog(res: ServerResponse): void {
  sendJson(res, 200, { sagstyper });
}

/** POST /api/ejendomme/:id/sager */
async function haandterOpretSag(
  req: IncomingMessage,
  res: ServerResponse,
  ejendomId: string,
  bruger: Bruger,
): Promise<void> {
  if (!findEjendom(ejendomId)) {
    sendJson(res, 404, { fejl: 'Ejendommen findes ikke i registret.' });
    return;
  }
  try {
    const krop = await laesJson(req);
    const sag = tilfoejSag(
      { ejendom_id: ejendomId, sagstype_id: somStreng(krop['sagstype_id']) },
      { rolle: bruger.rolle, navn: bruger.navn },
    );
    sendJson(res, 201, sag);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

/** POST /api/sager/:id/status */
async function haandterSagStatus(req: IncomingMessage, res: ServerResponse, sagId: string): Promise<void> {
  try {
    const krop = await laesJson(req);
    const opdateret = skiftSagStatusStore(sagId, somStreng(krop['status']) as SagStatus);
    sendJson(res, 200, opdateret);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

/** POST /api/sager/:id/afgoerelse */
async function haandterAfgoerelse(req: IncomingMessage, res: ServerResponse, sagId: string): Promise<void> {
  try {
    const krop = await laesJson(req);
    const afgoerelse = tilfoejAfgoerelse(sagId, {
      resultat: somStreng(krop['resultat']) as Afgoerelsesresultat,
      begrundelse: somStreng(krop['begrundelse']),
      hjemmel: somStreng(krop['hjemmel']),
    });
    sendJson(res, 201, afgoerelse);
  } catch (e) {
    // Fx manglende hjemmel afvises af den rene funktion.
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

/** POST /api/sager/:id/journalnotat */
async function haandterJournalnotat(req: IncomingMessage, res: ServerResponse, sagId: string): Promise<void> {
  try {
    const krop = await laesJson(req);
    const tekst = somStreng(krop['tekst']).trim();
    if (tekst.length === 0) throw new Error('Notatet må ikke være tomt.');
    const notat = tilfoejJournalnotat(sagId, tekst);
    sendJson(res, 201, notat);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

// --- Part: redigerbare kontaktoplysninger ------------------------------------

/** GET /api/partfelter - feltklassifikationen (selvbetjening vs. registerdata). */
function haandterPartfelter(res: ServerResponse): void {
  sendJson(res, 200, { felter: partFelter, register_forklaring: REGISTER_FORKLARING });
}

/** GET /api/parter/:id/kontakt-historik */
function haandterKontaktHistorik(res: ServerResponse, partId: string): void {
  sendJson(res, 200, { historik: kontaktHistorik(partId) });
}

/** POST /api/parter/:id/kontakt - retter e-mail/telefon via den rene funktion. */
async function haandterRetKontakt(
  req: IncomingMessage,
  res: ServerResponse,
  partId: string,
  bruger: Bruger,
): Promise<void> {
  try {
    const krop = await laesJson(req);
    // Send kun de felter der er relevante; den rene funktion afviser registerdata.
    const aendringer: Record<string, string | null> = {};
    if ('email' in krop) aendringer['email'] = krop['email'] == null ? null : String(krop['email']);
    if ('telefon' in krop) aendringer['telefon'] = krop['telefon'] == null ? null : String(krop['telefon']);
    // Videresend evt. øvrige felter uændret, så et forsøg på registerdata afvises.
    for (const key of Object.keys(krop)) {
      if (key !== 'email' && key !== 'telefon') aendringer[key] = krop[key] as string;
    }
    const resultat = retKontakt(partId, aendringer, { navn: bruger.navn, rolle: bruger.rolle });
    sendJson(res, 200, resultat);
  } catch (e) {
    sendJson(res, 400, { fejl: (e as Error).message });
  }
}

// --- Brugere / rolleskifter (testmiljøets fake-auth) -------------------------

/**
 * GET /api/brugere - listen til rolleskifteren: Sagsbehandler + de fiktive
 * borgere (parter med en ejendom). Dette ER fake-auth i testmiljøet.
 */
function haandterBrugere(res: ServerResponse): void {
  const set = new Map<string, { part_id: string; navn: string; adresser: string[] }>();
  for (const e of alleEjendomme()) {
    for (const { part } of parterForEjendom(e.id)) {
      const rk = set.get(part.id) ?? { part_id: part.id, navn: part.navn, adresser: [] };
      if (!rk.adresser.includes(e.adressetekst)) rk.adresser.push(e.adressetekst);
      set.set(part.id, rk);
    }
  }
  sendJson(res, 200, {
    sagsbehandler: { rolle: 'SAGSBEHANDLER', navn: 'Sagsbehandler ABC' },
    borgere: [...set.values()].map((b) => ({ rolle: 'BORGER', ...b })),
  });
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

// --- Adgangskontrol (håndhæves HER på serveren, ikke i frontend) -------------

function send403(res: ServerResponse, besked: string): void {
  sendJson(res, 403, { fejl: besked });
}

/** Tolker X-Bruger-headeren til en Bruger. Returnerer null hvis ugyldig. */
function tolkBruger(req: IncomingMessage): Bruger | null {
  const raw = req.headers['x-bruger'];
  const vaerdi = Array.isArray(raw) ? raw[0] : raw;
  if (!vaerdi) return null;
  if (vaerdi === 'SAGSBEHANDLER') {
    return { rolle: 'SAGSBEHANDLER', part_id: null, navn: 'Sagsbehandler ABC' };
  }
  const m = /^BORGER:(.+)$/.exec(vaerdi);
  if (m) {
    const partId = m[1] as string;
    const part = findPart(partId);
    if (!part) return null; // ukendt part => ugyldig identitet
    return { rolle: 'BORGER', part_id: partId, navn: part.navn };
  }
  return null;
}

/** Må brugeren se ejendommen? (adgangsregel anvendt på store-data.) */
function kanSeEjendom(bruger: Bruger, ejendomId: string): boolean {
  return maaSeEjendom(bruger, tilknytningerForEjendom(ejendomId), new Date().toISOString().slice(0, 10));
}

const FORBUDT_HANDLING = 'Din rolle må ikke udføre denne handling.';
const FORBUDT_EJENDOM = 'Du har ikke adgang til denne ejendom.';

/** Kræver at brugeren må udføre handlingen; sender 403 og returnerer false hvis ikke. */
function kraevHandling(bruger: Bruger, res: ServerResponse, handling: Handling): boolean {
  if (maaUdfoere(bruger, handling)) return true;
  send403(res, FORBUDT_HANDLING);
  return false;
}

/** Kræver at brugeren må se ejendommen; sender 403 og returnerer false hvis ikke. */
function kraevEjendom(bruger: Bruger, res: ServerResponse, ejendomId: string): boolean {
  if (kanSeEjendom(bruger, ejendomId)) return true;
  send403(res, FORBUDT_EJENDOM);
  return false;
}

// --- Router ------------------------------------------------------------------

async function haandter(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const sti = url.pathname;
  const metode = req.method ?? 'GET';

  // Statiske filer serveres uden identitet (siden skal kunne loade, før den
  // kan sende en X-Bruger-header). Alt under /api kræver en gyldig identitet.
  if (!sti.startsWith('/api/')) {
    if (metode !== 'GET') {
      sendJson(res, 405, { fejl: 'Kun GET og POST understøttes.' });
      return;
    }
    return serverStatiskFil(res, sti);
  }

  // Håndhævelse: hver API-forespørgsel skal have en gyldig X-Bruger-header.
  const bruger = tolkBruger(req);
  if (!bruger) {
    send403(res, 'Manglende eller ugyldig identitet (X-Bruger-headeren).');
    return;
  }

  // --- POST-ruter (mutationer) ---
  if (metode === 'POST') {
    const tilfLoebende = sti.match(/^\/api\/ejendomme\/([^/]+)\/ydelser\/loebende$/);
    if (tilfLoebende) {
      if (!kraevHandling(bruger, res, HANDLINGER.TILFOEJ_LOEBENDE)) return;
      return haandterTilfoejLoebende(req, res, decodeURIComponent(tilfLoebende[1] as string));
    }

    const tilfEngangs = sti.match(/^\/api\/ejendomme\/([^/]+)\/ydelser\/engangs$/);
    if (tilfEngangs) {
      if (!kraevHandling(bruger, res, HANDLINGER.TILFOEJ_ENGANGS)) return;
      return haandterTilfoejEngangs(req, res, decodeURIComponent(tilfEngangs[1] as string));
    }

    const fornyMatch = sti.match(/^\/api\/ydelser\/loebende\/([^/]+)\/forny$/);
    if (fornyMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.FORNY_YDELSE)) return;
      return haandterForny(req, res, decodeURIComponent(fornyMatch[1] as string));
    }

    const varslMatch = sti.match(/^\/api\/ydelser\/loebende\/([^/]+)\/varsling$/);
    if (varslMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.UDLOES_VARSLING)) return;
      return haandterVarsling(res, decodeURIComponent(varslMatch[1] as string));
    }

    const danMatch = sti.match(/^\/api\/ejendomme\/([^/]+)\/opkraevning\/dan$/);
    if (danMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.DAN_OPKRAEVNING)) return;
      return haandterDanOpkraevning(req, res, decodeURIComponent(danMatch[1] as string));
    }

    const opkStatusMatch = sti.match(/^\/api\/opkraevning\/([^/]+)\/status$/);
    if (opkStatusMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.SKIFT_OPKRAEVNING_STATUS)) return;
      return haandterOpkraevningStatus(req, res, decodeURIComponent(opkStatusMatch[1] as string));
    }

    const opretSagMatch = sti.match(/^\/api\/ejendomme\/([^/]+)\/sager$/);
    if (opretSagMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.OPRET_SAG)) return;
      return haandterOpretSag(req, res, decodeURIComponent(opretSagMatch[1] as string), bruger);
    }

    const sagStatusMatch = sti.match(/^\/api\/sager\/([^/]+)\/status$/);
    if (sagStatusMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.SKIFT_SAG_STATUS)) return;
      return haandterSagStatus(req, res, decodeURIComponent(sagStatusMatch[1] as string));
    }

    const afgMatch = sti.match(/^\/api\/sager\/([^/]+)\/afgoerelse$/);
    if (afgMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.TRAEF_AFGOERELSE)) return;
      return haandterAfgoerelse(req, res, decodeURIComponent(afgMatch[1] as string));
    }

    const jnMatch = sti.match(/^\/api\/sager\/([^/]+)\/journalnotat$/);
    if (jnMatch) {
      if (!kraevHandling(bruger, res, HANDLINGER.SKRIV_JOURNALNOTAT)) return;
      return haandterJournalnotat(req, res, decodeURIComponent(jnMatch[1] as string));
    }

    const kontaktMatch = sti.match(/^\/api\/parter\/([^/]+)\/kontakt$/);
    if (kontaktMatch) {
      const partId = decodeURIComponent(kontaktMatch[1] as string);
      // En borger må kun rette sin EGEN parts kontaktoplysninger.
      if (!maaRetteKontakt(bruger, partId)) {
        send403(res, 'Du må kun rette din egen parts kontaktoplysninger.');
        return;
      }
      return haandterRetKontakt(req, res, partId, bruger);
    }

    sendJson(res, 404, { fejl: 'Ukendt API-endpoint.' });
    return;
  }

  if (metode !== 'GET') {
    sendJson(res, 405, { fejl: 'Kun GET og POST understøttes.' });
    return;
  }

  // --- GET-ruter ---
  if (sti === '/api/ejendomme') return haandterEjendomsliste(res, bruger);

  if (sti === '/api/brugere') return haandterBrugere(res);

  const ydelserMatch = sti.match(/^\/api\/ejendomme\/([^/]+)\/ydelser$/);
  if (ydelserMatch) {
    const id = decodeURIComponent(ydelserMatch[1] as string);
    if (!kraevEjendom(bruger, res, id)) return;
    return haandterYdelser(res, id);
  }

  const opkListeMatch = sti.match(/^\/api\/ejendomme\/([^/]+)\/opkraevninger$/);
  if (opkListeMatch) {
    const id = decodeURIComponent(opkListeMatch[1] as string);
    if (!kraevEjendom(bruger, res, id)) return;
    return haandterOpkraevninger(res, id);
  }

  const sagerMatch = sti.match(/^\/api\/ejendomme\/([^/]+)\/sager$/);
  if (sagerMatch) {
    const id = decodeURIComponent(sagerMatch[1] as string);
    if (!kraevEjendom(bruger, res, id)) return;
    return haandterSager(res, id);
  }

  const ejendomMatch = sti.match(/^\/api\/ejendomme\/([^/]+)$/);
  if (ejendomMatch) {
    const id = decodeURIComponent(ejendomMatch[1] as string);
    if (!kraevEjendom(bruger, res, id)) return;
    return haandterEjendom(res, id);
  }

  // Kodelister til dialoger er tilgængelige for begge roller.
  if (sti === '/api/ydelseskatalog') return haandterYdelseskatalog(res);
  if (sti === '/api/sagskatalog') return haandterSagskatalog(res);
  if (sti === '/api/partfelter') return haandterPartfelter(res);

  const kontaktHistMatch = sti.match(/^\/api\/parter\/([^/]+)\/kontakt-historik$/);
  if (kontaktHistMatch) {
    const partId = decodeURIComponent(kontaktHistMatch[1] as string);
    // Borger må kun se sin egen parts historik.
    if (bruger.rolle === 'BORGER' && bruger.part_id !== partId) {
      send403(res, 'Du må kun se din egen parts historik.');
      return;
    }
    return haandterKontaktHistorik(res, partId);
  }

  // Adresseopslag mod DAWA er et sagsbehandlerværktøj.
  if (sti === '/api/adresse/soeg' || sti === '/api/adresse/opslag') {
    if (bruger.rolle !== 'SAGSBEHANDLER') {
      send403(res, 'Adressesøgning er forbeholdt sagsbehandlere.');
      return;
    }
    if (sti === '/api/adresse/soeg') return haandterAdressesoeg(res, url.searchParams.get('q') ?? '');
    return haandterAdresseopslag(res, url.searchParams);
  }

  sendJson(res, 404, { fejl: 'Ukendt API-endpoint.' });
}

export const server = createServer((req, res) => {
  haandter(req, res).catch((e) => {
    haandterDawaFejl(res, e);
  });
});

// Lyt kun når filen køres direkte (fx `tsx src/server/index.ts`) - ikke når den
// importeres i tests, hvor testen selv styrer porten.
const erHovedmodul = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (erHovedmodul) {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Renovation-demo (TESTMILJØ) kører på http://localhost:${PORT}`);
  });
}
