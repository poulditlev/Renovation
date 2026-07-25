import type { SagKanal, SagStatus } from '../sag/index.js';
import type { OpkraevningStatus } from '../opkraevning/index.js';

// -----------------------------------------------------------------------------
// SAGSOVERBLIK — prioriteret sagsoverblik for sagsbehandleren ("Mine sager").
//
// En BEREGNET visning oven på de eksisterende sager, ydelser og opkrævninger.
// Skaber ingen nye data: hastegrad og kategori UDLEDES her som ren logik, uden
// kendskab til HTTP, UI eller database. Hastegrad sættes ALDRIG manuelt.
// -----------------------------------------------------------------------------

export type Hastegrad = 'KRITISK' | 'HOEJ' | 'NORMAL' | 'AFVENTER';
export type Kategori = 'SELVBETJENING' | 'KLAGE' | 'UDLOEB_YDELSE' | 'BETALING' | 'FRIST' | 'OEVRIGT';

/**
 * Grænseværdier ét sted, så de kan justeres uden at lede i koden. Alle i dage.
 */
export const TAERSKLER = {
  /** Sagsfrist overskredet eller inden for så mange dage → KRITISK. */
  KRITISK_FRIST_DAGE: 3,
  /** Sagsfrist inden for så mange dage → HOEJ. */
  HOEJ_FRIST_DAGE: 7,
  /** Løbende ydelse ophører inden for så mange dage uden fornyelse → KRITISK. */
  KRITISK_YDELSE_DAGE: 1,
  /** Løbende ydelse udløber inden for så mange dage → HOEJ. */
  HOEJ_YDELSE_DAGE: 7,
  /** Selvbetjeningsansøgning uberørt i mere end så mange dage → mindst HOEJ. */
  SELVBETJENING_UBEROERT_DAGE: 5,
  /** Betalingsfrist: en opkrævning forfalder så mange dage efter den er dannet. */
  BETALINGSFRIST_DAGE: 30,
} as const;

// Sagstypekode for klager (KLE-koblet). Bruges til kategori KLAGE.
const KLAGE_SAGSTYPE_KODE = 'KLAGE_TOEMNING';

// --- Inputtyper (rene, uden kobling til lageret) -----------------------------

export interface OverblikSag {
  id: string;
  sagsnummer: string;
  sagstype_navn: string;
  sagstype_kode: string;
  ejendom_id: string;
  part_id: string | null;
  status: SagStatus;
  kanal: SagKanal;
  modtaget_dato: string;
  frist_dato: string;
  ansvarlig_bruger: string | null;
  har_ansoegning: boolean;
}

export interface OverblikYdelse {
  id: string;
  ejendom_id: string;
  navn: string;
  gyldig_til: string | null;
  /** Om ydelsen er fornyet (en nyere ydelse peger på den via forrige_ydelse_id). */
  fornyet: boolean;
}

export interface OverblikOpkraevning {
  id: string;
  ejendom_id: string;
  periode_fra: string;
  periode_til: string;
  status: OpkraevningStatus;
  dannet_dato: string;
}

/** En beriget post i overblikket. Kan være en rigtig sag eller en systemsag. */
export interface OverblikPost {
  /** Unik id: sagens id, eller en syntetisk id for en systemsag. */
  id: string;
  /** Om posten stammer fra en sag eller er en afledt systemsag. */
  kilde: 'SAG' | 'YDELSE' | 'OPKRAEVNING';
  /** Sagens id (til at åbne sagen), null for systemsager. */
  sag_id: string | null;
  sagsnummer: string | null;
  titel: string;
  ejendom_id: string;
  part_id: string | null;
  kanal: SagKanal | null;
  hastegrad: Hastegrad;
  kategori: Kategori;
  fristdato: string;
  fristtekst: string;
}

// --- Datohjælp ---------------------------------------------------------------

const MS_PER_DAG = 86_400_000;

/** Antal hele dage fra `fra` til `til` (positiv = til ligger efter fra). */
export function dageMellem(fraISO: string, tilISO: string): number {
  return Math.round((Date.parse(`${tilISO}T00:00:00Z`) - Date.parse(`${fraISO}T00:00:00Z`)) / MS_PER_DAG);
}

function addDage(dato: string, dage: number): string {
  return new Date(Date.parse(`${dato}T00:00:00Z`) + dage * MS_PER_DAG).toISOString().slice(0, 10);
}

/** Fristtekst i klar tale ud fra antal dage til fristen (negativ = overskredet). */
export function fristtekst(dageTil: number): string {
  if (dageTil < 0) {
    const n = -dageTil;
    return `Overskredet ${n} ${n === 1 ? 'dag' : 'dage'}`;
  }
  if (dageTil === 0) return 'Udløber i dag';
  if (dageTil === 1) return 'Udløber i morgen';
  return `Frist om ${dageTil} dage`;
}

// --- Hastegrad og kategori ---------------------------------------------------

/** Hastegrad ud fra antal dage til en frist (bruges til sager og systemsager). */
function hastegradFraFrist(dageTil: number): Hastegrad {
  if (dageTil <= TAERSKLER.KRITISK_FRIST_DAGE) return 'KRITISK'; // inkl. overskredet
  if (dageTil <= TAERSKLER.HOEJ_FRIST_DAGE) return 'HOEJ';
  return 'NORMAL';
}

/**
 * Primær kategori for en rigtig sag. Fast, dokumenteret prioritetsrækkefølge
 * (mest handlingsrelevant først): KLAGE → SELVBETJENING → FRIST → ØVRIGT.
 * (BETALING og UDLOEB_YDELSE hører til systemsagerne.)
 */
function kategoriForSag(sag: OverblikSag, hastegrad: Hastegrad): Kategori {
  if (sag.sagstype_kode === KLAGE_SAGSTYPE_KODE) return 'KLAGE';
  if (sag.kanal === 'SELVBETJENING' || sag.har_ansoegning) return 'SELVBETJENING';
  if (hastegrad === 'KRITISK' || hastegrad === 'HOEJ') return 'FRIST';
  return 'OEVRIGT';
}

// Kun aktive sager indgår i overblikket (afgjorte/lukkede er ikke åbne opgaver).
const AKTIVE_STATUS: ReadonlySet<SagStatus> = new Set<SagStatus>(['MODTAGET', 'UNDER_BEHANDLING', 'PARTSHOERING']);

function berigSag(sag: OverblikSag, paaDato: string): OverblikPost | null {
  if (!AKTIVE_STATUS.has(sag.status)) return null;
  const dageTil = dageMellem(paaDato, sag.frist_dato);

  let hastegrad: Hastegrad;
  if (sag.status === 'PARTSHOERING') {
    // Sagen venter på andre (partshøring) - ikke en aktiv opgave lige nu.
    hastegrad = 'AFVENTER';
  } else {
    hastegrad = hastegradFraFrist(dageTil);
    // En selvbetjeningsansøgning der har ligget uberørt for længe eskaleres.
    const uberoert =
      sag.kanal === 'SELVBETJENING' &&
      sag.status === 'MODTAGET' &&
      dageMellem(sag.modtaget_dato, paaDato) > TAERSKLER.SELVBETJENING_UBEROERT_DAGE;
    if (uberoert && hastegrad === 'NORMAL') hastegrad = 'HOEJ';
  }

  return {
    id: sag.id,
    kilde: 'SAG',
    sag_id: sag.id,
    sagsnummer: sag.sagsnummer,
    titel: sag.sagstype_navn,
    ejendom_id: sag.ejendom_id,
    part_id: sag.part_id,
    kanal: sag.kanal,
    hastegrad,
    kategori: kategoriForSag(sag, hastegrad),
    fristdato: sag.frist_dato,
    fristtekst: fristtekst(dageTil),
  };
}

function berigYdelse(y: OverblikYdelse, paaDato: string): OverblikPost | null {
  if (!y.gyldig_til || y.fornyet) return null;
  const dageTil = dageMellem(paaDato, y.gyldig_til);
  // Kun ydelser tæt på (eller lige efter) ophør er relevante - begrænser støj.
  if (dageTil > TAERSKLER.HOEJ_YDELSE_DAGE || dageTil < -TAERSKLER.HOEJ_YDELSE_DAGE) return null;
  const hastegrad: Hastegrad = dageTil <= TAERSKLER.KRITISK_YDELSE_DAGE ? 'KRITISK' : 'HOEJ';
  return {
    id: `sys-ydelse-${y.id}`,
    kilde: 'YDELSE',
    sag_id: null,
    sagsnummer: null,
    titel: `Ydelse ophører uden fornyelse: ${y.navn}`,
    ejendom_id: y.ejendom_id,
    part_id: null,
    kanal: null,
    hastegrad,
    kategori: 'UDLOEB_YDELSE',
    fristdato: y.gyldig_til,
    fristtekst: fristtekst(dageTil),
  };
}

function berigOpkraevning(o: OverblikOpkraevning, paaDato: string): OverblikPost | null {
  // Kun sendte opkrævninger kan være forfaldne (kladde/godkendt er ikke krævet
  // ind endnu; betalte/annullerede er afsluttede).
  if (o.status !== 'SENDT') return null;
  const forfald = addDage(o.dannet_dato, TAERSKLER.BETALINGSFRIST_DAGE);
  const dageTil = dageMellem(paaDato, forfald);
  if (dageTil >= 0) return null; // ikke forfalden endnu
  return {
    id: `sys-opk-${o.id}`,
    kilde: 'OPKRAEVNING',
    sag_id: null,
    sagsnummer: null,
    titel: `Forfalden opkrævning: ${o.periode_fra} – ${o.periode_til}`,
    ejendom_id: o.ejendom_id,
    part_id: null,
    kanal: null,
    hastegrad: 'KRITISK',
    kategori: 'BETALING',
    fristdato: forfald,
    fristtekst: fristtekst(dageTil),
  };
}

// --- Sortering ---------------------------------------------------------------

const HASTEGRAD_RANG: Record<Hastegrad, number> = { KRITISK: 0, HOEJ: 1, NORMAL: 2, AFVENTER: 3 };

function sammenlign(a: OverblikPost, b: OverblikPost): number {
  const r = HASTEGRAD_RANG[a.hastegrad] - HASTEGRAD_RANG[b.hastegrad];
  if (r !== 0) return r;
  return a.fristdato.localeCompare(b.fristdato); // tidligste frist først
}

// --- Hovedfunktion -----------------------------------------------------------

export interface OverblikInput {
  paaDato: string;
  sager: OverblikSag[];
  ydelser: OverblikYdelse[];
  opkraevninger: OverblikOpkraevning[];
}

/**
 * Bygger det prioriterede overblik: hver relevant sag beriges med hastegrad,
 * kategori og fristtekst, og der udledes systemsager for ydelser der ophører
 * uden fornyelse og for forfaldne opkrævninger. Resultatet er sorteret:
 * hastegrad (kritisk først), derefter fristdato stigende.
 */
export function byggSagsoverblik(input: OverblikInput): OverblikPost[] {
  const poster: OverblikPost[] = [];
  for (const s of input.sager) {
    const p = berigSag(s, input.paaDato);
    if (p) poster.push(p);
  }
  for (const y of input.ydelser) {
    const p = berigYdelse(y, input.paaDato);
    if (p) poster.push(p);
  }
  for (const o of input.opkraevninger) {
    const p = berigOpkraevning(o, input.paaDato);
    if (p) poster.push(p);
  }
  poster.sort(sammenlign);
  return poster;
}

/** Totaler pr. hastegrad, så frontend kan vise tællerne uden selv at regne. */
export function taelPerHastegrad(poster: OverblikPost[]): Record<Hastegrad, number> {
  const total: Record<Hastegrad, number> = { KRITISK: 0, HOEJ: 0, NORMAL: 0, AFVENTER: 0 };
  for (const p of poster) total[p.hastegrad] += 1;
  return total;
}
