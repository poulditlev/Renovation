// -----------------------------------------------------------------------------
// ADGANGSMODEL (trin 1 af 3). Rene funktioner uden kendskab til HTTP, UI eller
// database. Definerer HVEM der må HVAD.
//
// VIGTIGT — SIKKERHEDSPRINCIP: at skjule knapper i brugerfladen er IKKE
// adgangskontrol. Reglerne her håndhæves i API-laget (src/server/index.ts) på
// SERVEREN, uafhængigt af hvad frontend sender. En borger der selv sammensætter
// en POST-forespørgsel skal afvises af serveren - ikke blot mangle en knap.
// Frontend må gerne skjule/deaktivere handlinger for brugervenlighedens skyld,
// men det er kun pynt oven på den serverhåndhævede regel.
// -----------------------------------------------------------------------------

export type Rolle = 'SAGSBEHANDLER' | 'BORGER';

/** Den handlende bruger. For borgere angiver `part_id` hvilken part de ER. */
export interface Bruger {
  rolle: Rolle;
  part_id: string | null; // sat for BORGER, null for SAGSBEHANDLER
  navn: string;
}

/**
 * Navngivne handlinger. Brug disse konstanter - ikke løse strenge spredt i
 * koden - så rettighedstabellen er den ene kilde til sandhed.
 */
export const HANDLINGER = {
  RET_KONTAKT: 'RET_KONTAKT',
  TILFOEJ_LOEBENDE: 'TILFOEJ_LOEBENDE',
  TILFOEJ_ENGANGS: 'TILFOEJ_ENGANGS',
  FORNY_YDELSE: 'FORNY_YDELSE',
  UDLOES_VARSLING: 'UDLOES_VARSLING',
  DAN_OPKRAEVNING: 'DAN_OPKRAEVNING',
  SKIFT_OPKRAEVNING_STATUS: 'SKIFT_OPKRAEVNING_STATUS',
  OPRET_SAG: 'OPRET_SAG',
  SKIFT_SAG_STATUS: 'SKIFT_SAG_STATUS',
  TRAEF_AFGOERELSE: 'TRAEF_AFGOERELSE',
  SKRIV_JOURNALNOTAT: 'SKRIV_JOURNALNOTAT',
} as const;

export type Handling = (typeof HANDLINGER)[keyof typeof HANDLINGER];

const ALLE_HANDLINGER: Handling[] = Object.values(HANDLINGER);

// Rettighedstabel pr. rolle. SAGSBEHANDLER må alt; BORGER må kun rette
// kontaktoplysninger (og se sine egne ejendomme, jf. maaSeEjendom).
const RETTIGHEDER: Record<Rolle, ReadonlySet<Handling>> = {
  SAGSBEHANDLER: new Set(ALLE_HANDLINGER),
  BORGER: new Set<Handling>([HANDLINGER.RET_KONTAKT]),
};

/** Må brugeren udføre en given handling (uafhængigt af hvilket objekt)? */
export function maaUdfoere(bruger: Bruger, handling: Handling): boolean {
  return RETTIGHEDER[bruger.rolle].has(handling);
}

/** Én periode-tilknytning mellem part og ejendom (delmængde af ejendom_part). */
export interface Tilknytning {
  part_id: string;
  gyldig_fra: string;
  gyldig_til: string | null;
}

// gyldig_fra inklusiv, gyldig_til eksklusiv, null = løber stadig.
function erAktiv(t: Tilknytning, paaDato: string): boolean {
  if (paaDato < t.gyldig_fra) return false;
  if (t.gyldig_til !== null && paaDato >= t.gyldig_til) return false;
  return true;
}

/**
 * Må brugeren se en ejendom? Sagsbehandler må se alle. En borger må kun se
 * ejendomme hvor vedkommende er registreret som part (via ejendom_part) - og
 * kun i den periode tilknytningen er gyldig.
 *
 * `tilknytninger` er ejendom_part-rækkerne for netop den ejendom.
 */
export function maaSeEjendom(bruger: Bruger, tilknytninger: Tilknytning[], paaDato: string): boolean {
  if (bruger.rolle === 'SAGSBEHANDLER') return true;
  if (bruger.part_id === null) return false;
  return tilknytninger.some((t) => t.part_id === bruger.part_id && erAktiv(t, paaDato));
}

/**
 * Må brugeren rette kontaktoplysninger på en bestemt part? Sagsbehandler må på
 * alle; en borger må KUN på sin egen part.
 */
export function maaRetteKontakt(bruger: Bruger, maalPartId: string): boolean {
  if (!maaUdfoere(bruger, HANDLINGER.RET_KONTAKT)) return false;
  if (bruger.rolle === 'SAGSBEHANDLER') return true;
  return bruger.part_id !== null && bruger.part_id === maalPartId;
}
