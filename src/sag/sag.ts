import type { Id } from '../types.js';
import { findSagstype } from './sagstype.js';

// Rene funktioner for sagsbehandling: oprettelse, statusforløb, afgørelse og
// journalnotater. Kender intet til database, e-mail eller UI. Journalnotater og
// afgørelser slettes/ændres aldrig - rettelser sker ved at tilføje nyt.

export type SagStatus = 'MODTAGET' | 'UNDER_BEHANDLING' | 'PARTSHOERING' | 'AFGJORT' | 'LUKKET';
export type Afgoerelsesresultat = 'IMOEDEKOMMET' | 'DELVIST' | 'AFSLAG';

/**
 * Hvordan en sag er opstået. Bruges senere til at måle hvor stor en andel der
 * klares uden sagsbehandler. Sager oprettet af en borger får `SELVBETJENING`.
 */
export type SagKanal = 'SELVBETJENING' | 'SAGSBEHANDLER';

/** Svarer til tabellen `sag`. */
export interface Sag {
  id: Id;
  sagsnummer: string;
  sagstype_id: Id;
  ejendom_id: Id;
  part_id: Id | null;
  status: SagStatus;
  kanal: SagKanal;
  modtaget_dato: string;
  frist_dato: string;
  ansvarlig_bruger: string | null;
  lukket_dato: string | null;
}

/** Svarer til tabellen `afgoerelse`. `hjemmel` er obligatorisk. */
export interface Afgoerelse {
  id: Id;
  sag_id: Id;
  resultat: Afgoerelsesresultat;
  begrundelse: string;
  hjemmel: string;
  afgjort_dato: string;
  afgjort_af: string;
  klagefrist_dato: string;
}

/** Svarer til tabellen `journalnotat`. Må aldrig redigeres eller slettes. */
export interface Journalnotat {
  id: Id;
  sag_id: Id;
  tekst: string;
  oprettet: string;
  oprettet_af: string;
}

const MS_PER_DAG = 24 * 60 * 60 * 1000;

/** Lægger et antal dage til en ISO-dato. */
export function addDage(dato: string, dage: number): string {
  const t = Date.parse(`${dato}T00:00:00.000Z`) + dage * MS_PER_DAG;
  return new Date(t).toISOString().slice(0, 10);
}

export interface OpretSagInput {
  id: string;
  sagsnummer: string;
  sagstype_id: string;
  ejendom_id: string;
  part_id: string | null;
  modtaget_dato: string;
  ansvarlig_bruger?: string | null;
  /** Hvordan sagen opstod. Default SAGSBEHANDLER; borger-oprettede får SELVBETJENING. */
  kanal?: SagKanal;
}

/**
 * Opretter en sag i status MODTAGET. Fristen beregnes ud fra sagstypens
 * `sagsbehandlingsfrist_dage`. Kaster ved ukendt sagstype.
 */
export function opretSag(input: OpretSagInput): Sag {
  const type = findSagstype(input.sagstype_id);
  if (!type) {
    throw new Error(`Ukendt sagstype: ${input.sagstype_id}`);
  }
  return {
    id: input.id,
    sagsnummer: input.sagsnummer,
    sagstype_id: input.sagstype_id,
    ejendom_id: input.ejendom_id,
    part_id: input.part_id,
    status: 'MODTAGET',
    kanal: input.kanal ?? 'SAGSBEHANDLER',
    modtaget_dato: input.modtaget_dato,
    frist_dato: addDage(input.modtaget_dato, type.sagsbehandlingsfrist_dage),
    ansvarlig_bruger: input.ansvarlig_bruger ?? null,
    lukket_dato: null,
  };
}

// Tilladte statusovergange i sagsforløbet.
const OVERGANGE: Record<SagStatus, SagStatus[]> = {
  MODTAGET: ['UNDER_BEHANDLING', 'LUKKET'],
  UNDER_BEHANDLING: ['PARTSHOERING', 'AFGJORT', 'LUKKET'],
  PARTSHOERING: ['UNDER_BEHANDLING', 'AFGJORT', 'LUKKET'],
  AFGJORT: ['LUKKET'],
  LUKKET: [],
};

export function kanSkifteSagStatus(fra: SagStatus, til: SagStatus): boolean {
  return OVERGANGE[fra].includes(til);
}

/** Returnerer en NY sag med ændret status. Sætter lukket_dato ved LUKKET. */
export function skiftSagStatus(sag: Sag, til: SagStatus, paaDato: string): Sag {
  if (!kanSkifteSagStatus(sag.status, til)) {
    throw new Error(`Ugyldig statusovergang: ${sag.status} → ${til}.`);
  }
  return {
    ...sag,
    status: til,
    lukket_dato: til === 'LUKKET' ? paaDato : sag.lukket_dato,
  };
}

export interface TraefAfgoerelseInput {
  id: string;
  resultat: Afgoerelsesresultat;
  begrundelse: string;
  hjemmel: string;
  afgjort_dato: string;
  afgjort_af: string;
  /** Klagefrist. Udelades den, sættes 4 uger (28 dage) efter afgørelsen. */
  klagefrist_dato?: string;
}

/** Standard klagefrist er 4 uger fra afgørelsen. */
export const KLAGEFRIST_DAGE = 28;

/**
 * Træffer en afgørelse på en sag og sætter sagen til AFGJORT. `hjemmel` er
 * obligatorisk - uden hjemmel er afgørelsen ikke gyldig, og funktionen kaster.
 * Den gamle sag ændres ikke; der returneres en ny.
 */
export function traefAfgoerelse(sag: Sag, input: TraefAfgoerelseInput): { afgoerelse: Afgoerelse; sag: Sag } {
  if (input.hjemmel.trim().length === 0) {
    throw new Error('Hjemmel er obligatorisk - uden hjemmel er afgørelsen ikke gyldig.');
  }
  const afgoerelse: Afgoerelse = {
    id: input.id,
    sag_id: sag.id,
    resultat: input.resultat,
    begrundelse: input.begrundelse,
    hjemmel: input.hjemmel,
    afgjort_dato: input.afgjort_dato,
    afgjort_af: input.afgjort_af,
    klagefrist_dato: input.klagefrist_dato ?? addDage(input.afgjort_dato, KLAGEFRIST_DAGE),
  };
  const opdateretSag: Sag = { ...sag, status: 'AFGJORT' };
  return { afgoerelse, sag: opdateretSag };
}

export interface OpretJournalnotatInput {
  id: string;
  sag_id: string;
  tekst: string;
  oprettet: string;
  oprettet_af: string;
}

/** Opretter et journalnotat. Notater er append-only - der findes ingen rettelse. */
export function opretJournalnotat(input: OpretJournalnotatInput): Journalnotat {
  return {
    id: input.id,
    sag_id: input.sag_id,
    tekst: input.tekst,
    oprettet: input.oprettet,
    oprettet_af: input.oprettet_af,
  };
}
