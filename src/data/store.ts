import type { Ejendom, EjendomPart, Part } from '../domain/index.js';
import type { Materiel } from '../materiel.js';
import { ejendomme, ejendomParter, materiel, parter } from './seed.js';

// Simpelt in-memory-lager. Strukturen følger datamodellen, så det senere kan
// lægges direkte i PostgreSQL. Ingen mutationer i denne opgave - kun opslag.

export function alleEjendomme(): Ejendom[] {
  return ejendomme;
}

export function findEjendom(id: string): Ejendom | undefined {
  return ejendomme.find((e) => e.id === id);
}

export function findEjendomVedAdresseUuid(adresseUuid: string): Ejendom | undefined {
  return ejendomme.find((e) => e.adresse_uuid === adresseUuid);
}

export function findPart(id: string): Part | undefined {
  return parter.find((p) => p.id === id);
}

/**
 * Aktive parter for en ejendom på en given dato (default: i dag). Følger
 * periodekonventionen fra datamodellen via de rå datoer - her er et simpelt
 * opslag nok, da vi kun viser den nuværende part i brugerfladen.
 */
export function parterForEjendom(ejendomId: string, paaDato = idagISO()): Array<{ kobling: EjendomPart; part: Part }> {
  return ejendomParter
    .filter((ep) => ep.ejendom_id === ejendomId && erAktiv(ep.gyldig_fra, ep.gyldig_til, paaDato))
    .map((ep) => {
      const part = findPart(ep.part_id);
      if (!part) throw new Error(`Manglende part ${ep.part_id} for ejendom ${ejendomId}`);
      return { kobling: ep, part };
    });
}

/** Al materiel på en ejendom (uanset gyldighed - brugerfladen viser historik med). */
export function materielForEjendom(ejendomId: string): Materiel[] {
  return materiel.filter((m) => m.ejendom_id === ejendomId);
}

/**
 * Rå ejendom_part-tilknytninger for en ejendom (uanset gyldighed). Bruges af
 * adgangskontrollen, der selv afgør om en tilknytning er gyldig på en dato.
 */
export function tilknytningerForEjendom(ejendomId: string): EjendomPart[] {
  return ejendomParter.filter((ep) => ep.ejendom_id === ejendomId);
}

/** Ejendom-id'er en part er (eller har været) tilknyttet - til borgerfiltrering. */
export function ejendommeForPart(partId: string): string[] {
  return ejendomParter.filter((ep) => ep.part_id === partId).map((ep) => ep.ejendom_id);
}

function idagISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// gyldig_fra inklusiv, gyldig_til eksklusiv, null = løber stadig.
function erAktiv(fra: string, til: string | null, paaDato: string): boolean {
  if (paaDato < fra) return false;
  if (til !== null && paaDato >= til) return false;
  return true;
}
