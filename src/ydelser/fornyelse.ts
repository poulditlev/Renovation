import type { LoebendeYdelse } from './loebendeYdelse.js';
import { MIN_BINDING_MAANEDER, findBindingsperiode } from './bindingsperiode.js';
import type { LoebendeStatus } from './status.js';

// Rene funktioner til periode-, udløbs- og fornyelseslogik for løbende ydelser.
// Kender intet til database, e-mail eller UI - kun input og output. Følger
// datamodellens perioderegel: gyldig_fra inklusiv, gyldig_til eksklusiv.

const MS_PER_DAG = 24 * 60 * 60 * 1000;

function tilTid(dato: string): number {
  return Date.parse(`${dato}T00:00:00.000Z`);
}

function tilDato(tid: number): string {
  return new Date(tid).toISOString().slice(0, 10);
}

/**
 * Lægger et antal måneder til en dato. Hvis måldagen ikke findes i
 * målmåneden (fx 31. januar + 1 måned), klippes der til månedens sidste dag.
 */
export function addMaaneder(dato: string, maaneder: number): string {
  const d = new Date(`${dato}T00:00:00.000Z`);
  const aar = d.getUTCFullYear();
  const maaned = d.getUTCMonth();
  const dag = d.getUTCDate();

  const mål = new Date(Date.UTC(aar, maaned + maaneder, 1));
  const sidsteDagIMålmåned = new Date(Date.UTC(mål.getUTCFullYear(), mål.getUTCMonth() + 1, 0)).getUTCDate();
  mål.setUTCDate(Math.min(dag, sidsteDagIMålmåned));
  return mål.toISOString().slice(0, 10);
}

/** Antal hele dage fra `fra` (inkl.) til `til` (ekskl.). */
export function dageMellem(fra: string, til: string): number {
  return Math.round((tilTid(til) - tilTid(fra)) / MS_PER_DAG);
}

/**
 * Validerer en bindingsperiode i måneder. Kaster hvis den er kortere end
 * minimumet - kortere binding kræver dispensation og skal håndteres som en sag.
 */
export function validerBindingMaaneder(maaneder: number): void {
  if (!Number.isInteger(maaneder) || maaneder < MIN_BINDING_MAANEDER) {
    throw new Error(
      `Bindingsperioden skal være mindst ${MIN_BINDING_MAANEDER} måneder. ` +
        `Kortere kræver dispensation og skal oprettes som en sag.`,
    );
  }
}

/** Slår måneder op for en bindingsperiode-kode fra kodelisten. */
export function maanederForBinding(kode: string): number {
  const b = findBindingsperiode(kode);
  if (!b) {
    throw new Error(`Ukendt bindingsperiode: ${kode}`);
  }
  return b.maaneder;
}

/**
 * Beregner en gyldighedsperiode ud fra startdato og bindingsperiode i måneder.
 * Slutdatoen kan ikke sættes frit - den følger af startdato + binding.
 * Kaster hvis bindingen er under minimum.
 */
export function beregnPeriode(startdato: string, maaneder: number): { gyldig_fra: string; gyldig_til: string } {
  validerBindingMaaneder(maaneder);
  return { gyldig_fra: startdato, gyldig_til: addMaaneder(startdato, maaneder) };
}

export interface OpretLoebendeInput {
  id: string;
  ejendom_id: string;
  ydelsestype_id: string;
  materieltype_id: string;
  bindingsperiode_kode: string;
  startdato: string;
  hjemmel: string;
  oprettet: string;
  oprettet_af: string;
}

/**
 * Opretter en løbende ydelse. Beregner slutdatoen ud fra bindingsperioden og
 * afviser bindinger under minimum. Ren funktion - genererer ikke selv id
 * (kalderen leverer det), så den er deterministisk og testbar.
 */
export function opretLoebendeYdelse(input: OpretLoebendeInput): LoebendeYdelse {
  const maaneder = maanederForBinding(input.bindingsperiode_kode);
  const periode = beregnPeriode(input.startdato, maaneder);
  return {
    id: input.id,
    ejendom_id: input.ejendom_id,
    ydelsestype_id: input.ydelsestype_id,
    materieltype_id: input.materieltype_id,
    bindingsperiode_kode: input.bindingsperiode_kode,
    hjemmel: input.hjemmel,
    forrige_ydelse_id: null,
    oprettet: input.oprettet,
    oprettet_af: input.oprettet_af,
    gyldig_fra: periode.gyldig_fra,
    gyldig_til: periode.gyldig_til,
  };
}

export interface FornyInput {
  nyId: string;
  /** Ny bindingsperiode. Udelades den, genbruges den gamles binding. */
  bindingsperiode_kode?: string;
  oprettet: string;
  oprettet_af: string;
}

/**
 * Fornyer en løbende ydelse ved at oprette en NY række i forlængelse af den
 * gamle. Den gamle række ændres eller slettes ALDRIG - historikken bevares,
 * så gamle opkrævninger fortsat kan efterprøves.
 *
 * Den nye periode starter præcis hvor den gamle sluttede: da `gyldig_til` er
 * eksklusiv, er `nyGyldigFra = gammel.gyldig_til`. Det giver hverken hul eller
 * overlap mellem de to halvåbne intervaller [fra, til) og [til, nyTil).
 *
 * Kræver at den gamle ydelse har en slutdato (en uafgrænset ydelse kan ikke
 * fornyes).
 */
export function forny(gammel: LoebendeYdelse, input: FornyInput): LoebendeYdelse {
  if (gammel.gyldig_til === null) {
    throw new Error('Kan ikke forny en ydelse uden slutdato.');
  }
  const bindingKode = input.bindingsperiode_kode ?? gammel.bindingsperiode_kode;
  const maaneder = maanederForBinding(bindingKode);
  const nyGyldigFra = gammel.gyldig_til; // dagen efter den gamle sluttede (eksklusiv til)
  return {
    id: input.nyId,
    ejendom_id: gammel.ejendom_id,
    ydelsestype_id: gammel.ydelsestype_id,
    materieltype_id: gammel.materieltype_id,
    bindingsperiode_kode: bindingKode,
    hjemmel: gammel.hjemmel,
    forrige_ydelse_id: gammel.id,
    oprettet: input.oprettet,
    oprettet_af: input.oprettet_af,
    gyldig_fra: nyGyldigFra,
    gyldig_til: addMaaneder(nyGyldigFra, maaneder),
  };
}

export const STANDARD_VARSLINGSVINDUE_DAGE = 60;

export interface UdloebsResultat {
  udloeberSnart: LoebendeYdelse[];
  udloebet: LoebendeYdelse[];
}

/**
 * Finder løbende ydelser der enten allerede er udløbet eller udløber inden for
 * varslingsvinduet, set fra en given dato.
 *
 * - `udloebet`: `gyldig_til` <= dato (perioden er slut, da til er eksklusiv).
 * - `udloeberSnart`: 0 < dage til `gyldig_til` <= varslingsvindue.
 *
 * Ydelser uden slutdato eller med rigelig tid tilbage kommer ikke med.
 */
export function findUdloebende(
  ydelser: LoebendeYdelse[],
  paaDato: string,
  varslingsvindueDage: number = STANDARD_VARSLINGSVINDUE_DAGE,
): UdloebsResultat {
  const udloeberSnart: LoebendeYdelse[] = [];
  const udloebet: LoebendeYdelse[] = [];

  for (const y of ydelser) {
    if (y.gyldig_til === null) continue;
    const dage = dageMellem(paaDato, y.gyldig_til);
    if (dage <= 0) {
      udloebet.push(y);
    } else if (dage <= varslingsvindueDage) {
      udloeberSnart.push(y);
    }
  }
  return { udloeberSnart, udloebet };
}

/**
 * Beregner statussen for en løbende ydelse på en given dato:
 * `UDLOEBET` (perioden er slut), `UDLOEBER_SNART` (inden for vinduet) eller
 * `AKTIV`.
 */
export function beregnLoebendeStatus(
  ydelse: LoebendeYdelse,
  paaDato: string,
  varslingsvindueDage: number = STANDARD_VARSLINGSVINDUE_DAGE,
): LoebendeStatus {
  if (ydelse.gyldig_til === null) return 'AKTIV';
  const dage = dageMellem(paaDato, ydelse.gyldig_til);
  if (dage <= 0) return 'UDLOEBET';
  if (dage <= varslingsvindueDage) return 'UDLOEBER_SNART';
  return 'AKTIV';
}
