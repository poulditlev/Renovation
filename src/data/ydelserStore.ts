import type { LoebendeYdelse } from '../ydelser/loebendeYdelse.js';
import type { Engangsleverance } from '../ydelser/engangsleverance.js';
import type { Varsling } from '../ydelser/varsling.js';
import { forny, opretLoebendeYdelse } from '../ydelser/fornyelse.js';
import { opretVarsling } from '../ydelser/varsling.js';
import { loebendeYdelserSeed, engangsleverancerSeed } from './ydelserSeed.js';
import { findPart, parterForEjendom } from './store.js';

// In-memory-lager for ydelser og varslinger. Strukturen følger datamodellen,
// så det senere kan lægges direkte i PostgreSQL. Mutationerne kalder de rene
// funktioner i ydelser-modulet - lageret tildeler blot id'er og gemmer rækker.
// Varslinger og fornyelser SLETTER aldrig; historikken bevares.

const loebendeYdelser: LoebendeYdelse[] = loebendeYdelserSeed.map((y) => ({ ...y }));
const engangsleverancer: Engangsleverance[] = engangsleverancerSeed.map((e) => ({ ...e }));
const varslinger: Varsling[] = [];

let løbeNr = 1000;
function nytId(præfiks: string): string {
  løbeNr += 1;
  return `${præfiks}-${løbeNr}`;
}

function nu(): string {
  return new Date().toISOString();
}

// --- Opslag ------------------------------------------------------------------

export function loebendeForEjendom(ejendomId: string): LoebendeYdelse[] {
  return loebendeYdelser.filter((y) => y.ejendom_id === ejendomId);
}

export function engangsForEjendom(ejendomId: string): Engangsleverance[] {
  return engangsleverancer.filter((e) => e.ejendom_id === ejendomId);
}

export function varslingerForEjendom(ejendomId: string): Varsling[] {
  return varslinger.filter((v) => v.ejendom_id === ejendomId);
}

export function findLoebende(id: string): LoebendeYdelse | undefined {
  return loebendeYdelser.find((y) => y.id === id);
}

// --- Mutationer --------------------------------------------------------------

export interface TilfoejLoebendeInput {
  ejendom_id: string;
  ydelsestype_id: string;
  materieltype_id: string;
  bindingsperiode_kode: string;
  startdato: string;
  hjemmel: string;
  oprettet_af?: string;
}

export function tilfoejLoebende(input: TilfoejLoebendeInput): LoebendeYdelse {
  const ydelse = opretLoebendeYdelse({
    id: nytId('ly'),
    ejendom_id: input.ejendom_id,
    ydelsestype_id: input.ydelsestype_id,
    materieltype_id: input.materieltype_id,
    bindingsperiode_kode: input.bindingsperiode_kode,
    startdato: input.startdato,
    hjemmel: input.hjemmel,
    oprettet: nu(),
    oprettet_af: input.oprettet_af ?? 'sagsbehandler',
  });
  loebendeYdelser.push(ydelse);
  return ydelse;
}

export interface TilfoejEngangsInput {
  ejendom_id: string;
  ydelsestype_id: string;
  leveringsdato: string;
  antal: number;
  enhedspris_oere: number;
  hjemmel: string;
  oprettet_af?: string;
}

export function tilfoejEngangs(input: TilfoejEngangsInput): Engangsleverance {
  const leverance: Engangsleverance = {
    id: nytId('el'),
    ejendom_id: input.ejendom_id,
    ydelsestype_id: input.ydelsestype_id,
    leveringsdato: input.leveringsdato,
    antal: input.antal,
    enhedspris_oere: input.enhedspris_oere,
    hjemmel: input.hjemmel,
    oprettet: nu(),
    oprettet_af: input.oprettet_af ?? 'sagsbehandler',
  };
  engangsleverancer.push(leverance);
  return leverance;
}

/**
 * Fornyer en løbende ydelse. Den gamle række bevares uændret; en ny række
 * lægges til i forlængelse. Returnerer den nye ydelse.
 */
export function fornyLoebende(id: string, bindingsperiode_kode?: string, oprettet_af = 'sagsbehandler'): LoebendeYdelse {
  const gammel = findLoebende(id);
  if (!gammel) {
    throw new Error(`Ukendt løbende ydelse: ${id}`);
  }
  const ny = forny(gammel, {
    nyId: nytId('ly'),
    bindingsperiode_kode,
    oprettet: nu(),
    oprettet_af,
  });
  loebendeYdelser.push(ny); // gammel røres ikke
  return ny;
}

/**
 * Registrerer en varsling om en løbende ydelses udløb. Sender IKKE e-mail
 * (afsendelse er deaktiveret i testmiljøet) - gemmer kun varslingen som data.
 */
export function registrerVarsling(ydelseId: string, oprettet_af = 'sagsbehandler'): Varsling {
  const ydelse = findLoebende(ydelseId);
  if (!ydelse) {
    throw new Error(`Ukendt løbende ydelse: ${ydelseId}`);
  }
  // Find betaleren på ejendommen som modtager af varslingen.
  const betaler = parterForEjendom(ydelse.ejendom_id).find((p) => p.kobling.rolle === 'BETALER');
  const part = betaler?.part ?? (parterForEjendom(ydelse.ejendom_id)[0]?.part ?? undefined);
  const partObj = part ? findPart(part.id) : undefined;

  const varsling = opretVarsling(ydelse, {
    id: nytId('v'),
    part_id: partObj?.id ?? 'ukendt',
    modtager_email: partObj?.email ?? null,
    tidspunkt: nu(),
  });
  varslinger.push(varsling);
  return varsling;
}
