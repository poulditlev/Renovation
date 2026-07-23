import type { Id } from '../types.js';
import type { Materiel } from '../materiel.js';
import type { Takst } from '../klassifikationer/index.js';
import { beregnOpkraevningslinjer, type OpkraevningsPeriode } from '../beregning/index.js';
import { beregnEngangsbeloeb, type Engangsleverance } from '../ydelser/index.js';

// Dannelse af selve regningen (opkraevning + opkraevningslinjer). Ren funktion:
// kender intet til database, e-mail eller UI. Genbruger den eksisterende rene
// takstberegning til de periodiske linjer og tilføjer engangsleverancer der
// falder i perioden - intet nyt beregningsprincip.

export type OpkraevningStatus = 'KLADDE' | 'GODKENDT' | 'SENDT' | 'BETALT' | 'ANNULLERET';

/** Svarer til tabellen `opkraevning` i datamodellen. */
export interface Opkraevning {
  id: Id;
  ejendom_id: Id;
  part_id: Id | null; // hvem regningen sendes til (betaleren)
  periode_fra: string;
  periode_til: string;
  beloeb_total_oere: number;
  status: OpkraevningStatus;
  dannet_dato: string;
}

/** Svarer til tabellen `opkraevningslinje`. Sporbarheden ligger her. */
export interface Opkraevningslinje {
  id: Id;
  opkraevning_id: Id;
  materiel_id: Id | null;
  takst_id: Id | null; // hvilken takst der faktisk blev brugt (null for engangs)
  beskrivelse: string;
  antal_dage: number | null; // null for engangsleverancer
  beloeb_oere: number;
}

export interface DannOpkraevningInput {
  id: string;
  ejendom_id: string;
  part_id: string | null;
  periode: OpkraevningsPeriode;
  dannet_dato: string;
  /** Periodisk materiel OG løbende ydelser (begge er strukturelt kompatible). */
  periodiskeYdelser: Materiel[];
  engangsleverancer: Engangsleverance[];
  takster: Takst[];
  /** Valgfrit opslag til pæne linjebeskrivelser for engangsleverancer. */
  navnForYdelsestype?: (ydelsestypeId: string) => string;
}

export interface DannetOpkraevning {
  opkraevning: Opkraevning;
  linjer: Opkraevningslinje[];
}

/** Er en dato i perioden [periode_fra inkl., periode_til ekskl.)? */
function iPeriode(dato: string, periode: OpkraevningsPeriode): boolean {
  return dato >= periode.periode_fra && dato < periode.periode_til;
}

/**
 * Danner en opkrævning i status KLADDE med én linje pr. beholder/ydelse.
 * Periodiske linjer kommer fra takstberegningen (forholdsmæssigt efter dage,
 * med `antal_dage` og `takst_id`). Engangsleverancer i perioden får hver en
 * linje uden dage/takst. `beloeb_total_oere` er defineret som summen af
 * linjerne, så de altid stemmer.
 */
export function dannOpkraevning(input: DannOpkraevningInput): DannetOpkraevning {
  const linjer: Opkraevningslinje[] = [];
  let nr = 0;
  const nyLinjeId = () => `${input.id}-l${(nr += 1)}`;

  // Periodiske linjer via den eksisterende takstberegning.
  const periodisk = beregnOpkraevningslinjer(input.periodiskeYdelser, input.periode, input.takster);
  for (const l of periodisk.linjer) {
    linjer.push({
      id: nyLinjeId(),
      opkraevning_id: input.id,
      materiel_id: l.materiel_id,
      takst_id: l.takst_id,
      beskrivelse: l.beskrivelse,
      antal_dage: l.antal_dage,
      beloeb_oere: l.beloeb_oere,
    });
  }

  // Engangsleverancer der er leveret i perioden.
  for (const e of input.engangsleverancer) {
    if (!iPeriode(e.leveringsdato, input.periode)) continue;
    const navn = input.navnForYdelsestype ? input.navnForYdelsestype(e.ydelsestype_id) : e.ydelsestype_id;
    linjer.push({
      id: nyLinjeId(),
      opkraevning_id: input.id,
      materiel_id: null,
      takst_id: null,
      beskrivelse: `${navn} (${e.antal} stk., leveret ${e.leveringsdato})`,
      antal_dage: null,
      beloeb_oere: beregnEngangsbeloeb(e),
    });
  }

  const beloeb_total_oere = linjer.reduce((sum, l) => sum + l.beloeb_oere, 0);

  return {
    opkraevning: {
      id: input.id,
      ejendom_id: input.ejendom_id,
      part_id: input.part_id,
      periode_fra: input.periode.periode_fra,
      periode_til: input.periode.periode_til,
      beloeb_total_oere,
      status: 'KLADDE',
      dannet_dato: input.dannet_dato,
    },
    linjer,
  };
}

// Tilladte statusovergange. En regning følger KLADDE → GODKENDT → SENDT →
// BETALT, og kan annulleres undervejs (dog ikke når den er betalt).
const OVERGANGE: Record<OpkraevningStatus, OpkraevningStatus[]> = {
  KLADDE: ['GODKENDT', 'ANNULLERET'],
  GODKENDT: ['SENDT', 'ANNULLERET'],
  SENDT: ['BETALT', 'ANNULLERET'],
  BETALT: [],
  ANNULLERET: [],
};

export function kanSkifteStatus(fra: OpkraevningStatus, til: OpkraevningStatus): boolean {
  return OVERGANGE[fra].includes(til);
}

/**
 * Returnerer en NY opkrævning med ændret status. Kaster ved en ugyldig
 * overgang. Ændrer ikke input (historik/immutabilitet).
 */
export function skiftStatus(opkraevning: Opkraevning, til: OpkraevningStatus): Opkraevning {
  if (!kanSkifteStatus(opkraevning.status, til)) {
    throw new Error(`Ugyldig statusovergang: ${opkraevning.status} → ${til}.`);
  }
  return { ...opkraevning, status: til };
}
