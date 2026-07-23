import { takster } from '../klassifikationer/index.js';
import { findYdelsestype } from '../ydelser/index.js';
import {
  dannOpkraevning,
  skiftStatus,
  type Opkraevning,
  type OpkraevningStatus,
  type Opkraevningslinje,
} from '../opkraevning/index.js';
import { parterForEjendom } from './store.js';
import { engangsForEjendom, loebendeForEjendom } from './ydelserStore.js';

// In-memory-lager for opkrævninger. Regningen dannes on demand via de rene
// funktioner i opkraevning-modulet; lageret tildeler id'er og gemmer status.

const opkraevninger: Opkraevning[] = [];
const linjer: Opkraevningslinje[] = [];

let løbeNr = 5000;
function nytId(præfiks: string): string {
  løbeNr += 1;
  return `${præfiks}-${løbeNr}`;
}

export function opkraevningerForEjendom(ejendomId: string): Opkraevning[] {
  // Nyeste først.
  return opkraevninger.filter((o) => o.ejendom_id === ejendomId).reverse();
}

export function linjerForOpkraevning(opkraevningId: string): Opkraevningslinje[] {
  return linjer.filter((l) => l.opkraevning_id === opkraevningId);
}

export function findOpkraevning(id: string): Opkraevning | undefined {
  return opkraevninger.find((o) => o.id === id);
}

/**
 * Danner en ny opkrævning (KLADDE) for en ejendom og periode. Bruger de løbende
 * ydelser (periodisk) + engangsleverancer - ikke det fysiske materiel, så der
 * ikke dobbeltopkræves.
 */
export function danOpkraevning(ejendomId: string, periode_fra: string, periode_til: string): {
  opkraevning: Opkraevning;
  linjer: Opkraevningslinje[];
} {
  const betaler = parterForEjendom(ejendomId).find((p) => p.kobling.rolle === 'BETALER');
  // Løbende ydelser er strukturelt kompatible med takstberegningens materiel-input.
  const periodiske = loebendeForEjendom(ejendomId);

  const dannet = dannOpkraevning({
    id: nytId('opk'),
    ejendom_id: ejendomId,
    part_id: betaler?.part.id ?? null,
    periode: { periode_fra, periode_til },
    dannet_dato: new Date().toISOString().slice(0, 10),
    periodiskeYdelser: periodiske,
    engangsleverancer: engangsForEjendom(ejendomId),
    takster,
    navnForYdelsestype: (id) => findYdelsestype(id)?.navn ?? id,
  });

  opkraevninger.push(dannet.opkraevning);
  linjer.push(...dannet.linjer);
  return dannet;
}

/** Skifter status på en opkrævning (KLADDE→GODKENDT→SENDT→BETALT/ANNULLERET). */
export function skiftOpkraevningStatus(opkraevningId: string, til: OpkraevningStatus): Opkraevning {
  const idx = opkraevninger.findIndex((o) => o.id === opkraevningId);
  if (idx < 0) {
    throw new Error(`Ukendt opkrævning: ${opkraevningId}`);
  }
  const opdateret = skiftStatus(opkraevninger[idx] as Opkraevning, til);
  opkraevninger[idx] = opdateret;
  return opdateret;
}
