import type { Afgoerelse, Afgoerelsesresultat, Ansoegning, Journalnotat, Sag, SagStatus } from '../sag/index.js';
import {
  findAnsoegningstype,
  opretJournalnotat,
  opretSag,
  skiftSagStatus,
  traefAfgoerelse,
} from '../sag/index.js';
import { findYdelsestype } from '../ydelser/index.js';
import { parterForEjendom } from './store.js';
import type { Engangsleverance } from '../ydelser/engangsleverance.js';
import type { LoebendeYdelse } from '../ydelser/loebendeYdelse.js';
import { afslutLoebende, findLoebende, tilfoejEngangs, tilfoejLoebende } from './ydelserStore.js';

// In-memory-lager for sager, afgørelser og journalnotater. Journalnotater og
// afgørelser slettes/ændres aldrig. Mutationerne kalder de rene funktioner i
// sag-modulet; lageret tildeler id'er/sagsnumre og gemmer rækker.

const sager: Sag[] = [];
const afgoerelser: Afgoerelse[] = [];
const journalnotater: Journalnotat[] = [];

// Starter over de hardkodede seed-sagsnumre (…00098, …00123), så nye sager
// (fx borgeransøgninger) ikke får et sagsnummer der kolliderer med seed.
let sagLøbeNr = 123;
let idLøbeNr = 6000;

function nytSagsnummer(): string {
  sagLøbeNr += 1;
  const aar = new Date().getFullYear();
  return `REN-${aar}-${String(sagLøbeNr).padStart(5, '0')}`;
}
function nytId(præfiks: string): string {
  idLøbeNr += 1;
  return `${præfiks}-${idLøbeNr}`;
}
function nu(): string {
  return new Date().toISOString();
}
function idag(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Seed: et par sager på ejendom-01, så modulet ikke er tomt ---------------
(function seed() {
  const part = parterForEjendom('ejendom-01').find((p) => p.kobling.rolle === 'BETALER')?.part;
  const partId = part?.id ?? null;

  const s1 = opretSag({
    id: 'sag-seed-1',
    sagsnummer: 'REN-2026-00098',
    sagstype_id: 'stype-ekstra-beholder',
    ejendom_id: 'ejendom-01',
    part_id: partId,
    modtaget_dato: '2026-05-02',
    ansvarlig_bruger: 'Sagsbehandler ABC',
  });
  const s1b = skiftSagStatus(s1, 'UNDER_BEHANDLING', '2026-05-03');
  const afgjort = traefAfgoerelse(s1b, {
    id: 'afg-seed-1',
    resultat: 'IMOEDEKOMMET',
    begrundelse: 'Ekstra beholder bevilget efter regulativet.',
    hjemmel: 'Regulativ for husholdningsaffald § 9, stk. 2',
    afgjort_dato: '2026-05-20',
    afgjort_af: 'sagsbehandler@korsbaek.example.dk',
  });
  sager.push(afgjort.sag);
  afgoerelser.push(afgjort.afgoerelse);
  journalnotater.push(
    opretJournalnotat({
      id: 'jn-seed-1',
      sag_id: 'sag-seed-1',
      tekst: 'Ansøgning modtaget via selvbetjening.',
      oprettet: '2026-05-02T08:30:00.000Z',
      oprettet_af: 'system',
    }),
  );

  const s2 = opretSag({
    id: 'sag-seed-2',
    sagsnummer: 'REN-2026-00123',
    sagstype_id: 'stype-dispensation-binding',
    ejendom_id: 'ejendom-01',
    part_id: partId,
    modtaget_dato: '2026-07-10',
    ansvarlig_bruger: 'Sagsbehandler ABC',
  });
  sager.push(skiftSagStatus(s2, 'UNDER_BEHANDLING', '2026-07-11'));
  journalnotater.push(
    opretJournalnotat({
      id: 'jn-seed-2',
      sag_id: 'sag-seed-2',
      tekst: 'Sag oprettet efter afvist forsøg på under 6 måneders binding.',
      oprettet: '2026-07-10T09:14:00.000Z',
      oprettet_af: 'system',
    }),
  );
})();

// --- Opslag ------------------------------------------------------------------

export function sagerForEjendom(ejendomId: string): Sag[] {
  return sager.filter((s) => s.ejendom_id === ejendomId);
}
/** Alle sager (til det tværgående sagsoverblik). */
export function alleSager(): Sag[] {
  return sager;
}
export function findSag(id: string): Sag | undefined {
  return sager.find((s) => s.id === id);
}
export function afgoerelseForSag(sagId: string): Afgoerelse | undefined {
  return afgoerelser.find((a) => a.sag_id === sagId);
}
export function journalForSag(sagId: string): Journalnotat[] {
  return journalnotater.filter((j) => j.sag_id === sagId);
}

// --- Mutationer --------------------------------------------------------------

/** Hvem der opretter sagen - bestemmer kanal (SELVBETJENING for borgere). */
export interface HandlendeBruger {
  rolle: 'SAGSBEHANDLER' | 'BORGER';
  navn: string;
  /** For borgere: hvilken part de ER (så sagen knyttes til borgerens egen part). */
  part_id?: string | null;
}

export interface OpretSagStoreInput {
  ejendom_id: string;
  sagstype_id: string;
  /** Ansøgningsindhold, hvis sagen kommer fra en borgeransøgning. */
  ansoegning?: Ansoegning | null;
}
export function tilfoejSag(input: OpretSagStoreInput, bruger: HandlendeBruger): Sag {
  // En borgersag knyttes til borgerens egen part; en sagsbehandlersag til
  // ejendommens betaler.
  const partId =
    bruger.rolle === 'BORGER' && bruger.part_id
      ? bruger.part_id
      : parterForEjendom(input.ejendom_id).find((p) => p.kobling.rolle === 'BETALER')?.part.id ?? null;
  const sag = opretSag({
    id: nytId('sag'),
    sagsnummer: nytSagsnummer(),
    sagstype_id: input.sagstype_id,
    ejendom_id: input.ejendom_id,
    part_id: partId,
    modtaget_dato: idag(),
    ansvarlig_bruger: bruger.rolle === 'SAGSBEHANDLER' ? bruger.navn : null,
    // Borger-oprettede sager markeres som selvbetjening; ellers sagsbehandler.
    kanal: bruger.rolle === 'BORGER' ? 'SELVBETJENING' : 'SAGSBEHANDLER',
    ansoegning: input.ansoegning ?? null,
  });
  sager.push(sag);
  journalnotater.push(
    opretJournalnotat({
      id: nytId('jn'),
      sag_id: sag.id,
      // Journalen er sagens sporbarhed: hvem, i hvilken rolle, og hvad der blev
      // ansøgt om. oprettet_af bærer navnet; rollen står eksplicit i teksten.
      tekst: sag.ansoegning
        ? `Ansøgning modtaget via selvbetjening (rolle ${bruger.rolle}, ${bruger.navn}). Ansøgt om: ${beskrivAnsoegning(sag.ansoegning)}.`
        : `Sag oprettet (${sag.kanal === 'SELVBETJENING' ? 'selvbetjening' : 'sagsbehandler'}).`,
      oprettet: nu(),
      oprettet_af: bruger.navn,
    }),
  );
  return sag;
}

/** Kort, læsbar beskrivelse af hvad der er ansøgt om (til journal/visning). */
export function beskrivAnsoegning(a: Ansoegning): string {
  const type = findAnsoegningstype(a.art);
  const navn = type?.navn ?? a.art;
  if (a.art === 'AFMELDING') {
    const ydelse = a.afmeld_ydelse_id ? findLoebende(a.afmeld_ydelse_id) : undefined;
    const ynavn = ydelse ? findYdelsestype(ydelse.ydelsestype_id)?.navn ?? ydelse.ydelsestype_id : 'en løbende ydelse';
    return `${navn} (${ynavn})`;
  }
  const ytypeNavn = a.ydelsestype_id ? findYdelsestype(a.ydelsestype_id)?.navn ?? a.ydelsestype_id : null;
  const dele = [navn];
  if (ytypeNavn) dele.push(ytypeNavn);
  if (a.antal && a.antal > 1) dele.push(`${a.antal} stk.`);
  if (a.oensket_startdato) dele.push(`ønsket dato ${a.oensket_startdato}`);
  return dele.join(' · ');
}

export function skiftStatus(sagId: string, til: SagStatus): Sag {
  const idx = sager.findIndex((s) => s.id === sagId);
  if (idx < 0) throw new Error(`Ukendt sag: ${sagId}`);
  const opdateret = skiftSagStatus(sager[idx] as Sag, til, idag());
  sager[idx] = opdateret;
  return opdateret;
}

export interface TraefAfgoerelseStoreInput {
  resultat: Afgoerelsesresultat;
  begrundelse: string;
  hjemmel: string;
}
export function tilfoejAfgoerelse(sagId: string, input: TraefAfgoerelseStoreInput): Afgoerelse {
  const idx = sager.findIndex((s) => s.id === sagId);
  if (idx < 0) throw new Error(`Ukendt sag: ${sagId}`);
  const { afgoerelse, sag } = traefAfgoerelse(sager[idx] as Sag, {
    id: nytId('afg'),
    resultat: input.resultat,
    begrundelse: input.begrundelse,
    hjemmel: input.hjemmel,
    afgjort_dato: idag(),
    afgjort_af: 'sagsbehandler@korsbaek.example.dk',
  });
  sager[idx] = sag; // gammel status erstattes af AFGJORT; historik i journal
  afgoerelser.push(afgoerelse);
  journalnotater.push(
    opretJournalnotat({
      id: nytId('jn'),
      sag_id: sagId,
      tekst: `Afgørelse truffet: ${input.resultat}.`,
      oprettet: nu(),
      oprettet_af: 'sagsbehandler',
    }),
  );
  return afgoerelse;
}

export function tilfoejJournalnotat(sagId: string, tekst: string): Journalnotat {
  if (!findSag(sagId)) throw new Error(`Ukendt sag: ${sagId}`);
  const notat = opretJournalnotat({
    id: nytId('jn'),
    sag_id: sagId,
    tekst,
    oprettet: nu(),
    oprettet_af: 'sagsbehandler',
  });
  journalnotater.push(notat);
  return notat;
}

// --- Effektuering af en imødekommet ansøgning --------------------------------
// Når sagsbehandleren har imødekommet en ansøgning, kan den EFFEKTUERES: den
// ansøgte ydelse oprettes ved at GENBRUGE den eksisterende ydelses-oprettelse
// (tilfoejLoebende/tilfoejEngangs/afslutLoebende) - ikke en parallel vej.
// Sker på sagsbehandlerens eksplicitte handling; en borger må aldrig selv
// oprette ydelser.

const effektuerede = new Set<string>();

/** Standard bindingsperiode ved effektuering, hvis sagsbehandleren ikke vælger. */
const STANDARD_BINDING = '12_MDR';

export function erEffektueret(sagId: string): boolean {
  return effektuerede.has(sagId);
}

export interface EffektueringResultat {
  effekt: 'LOEBENDE' | 'ENGANGS' | 'AFMELD';
  loebende?: LoebendeYdelse;
  engangs?: Engangsleverance;
  afmeldt?: LoebendeYdelse;
}

/**
 * Effektuerer en imødekommet ansøgning. Kræver at sagen er AFGJORT med en
 * afgørelse med resultat IMOEDEKOMMET (og dermed med hjemmel, jf. traefAfgoerelse).
 * Opretter den ansøgte ydelse via de eksisterende funktioner. Kan kun ske én gang.
 */
export function effektuerAnsoegning(
  sagId: string,
  bruger: HandlendeBruger,
  bindingsperiode_kode: string = STANDARD_BINDING,
): EffektueringResultat {
  const sag = findSag(sagId);
  if (!sag) throw new Error(`Ukendt sag: ${sagId}`);
  if (!sag.ansoegning) throw new Error('Sagen har ingen ansøgning at effektuere.');
  if (sag.status !== 'AFGJORT') throw new Error('Kun en afgjort sag kan effektueres.');
  const afg = afgoerelseForSag(sagId);
  if (!afg) throw new Error('Sagen har ingen afgørelse.');
  if (afg.resultat !== 'IMOEDEKOMMET') {
    throw new Error('Kun en imødekommet ansøgning kan effektueres.');
  }
  if (erEffektueret(sagId)) throw new Error('Ansøgningen er allerede effektueret.');

  const a = sag.ansoegning;
  const type = findAnsoegningstype(a.art);
  if (!type) throw new Error(`Ukendt ansøgningsart: ${a.art}`);
  const dato = a.oensket_startdato ?? idag();

  let resultat: EffektueringResultat;
  if (type.effekt === 'LOEBENDE') {
    if (!a.ydelsestype_id || !a.materieltype_id) {
      throw new Error('Ansøgningen mangler ydelsestype/størrelse.');
    }
    const loebende = tilfoejLoebende({
      ejendom_id: sag.ejendom_id,
      ydelsestype_id: a.ydelsestype_id,
      materieltype_id: a.materieltype_id,
      bindingsperiode_kode,
      startdato: dato,
      hjemmel: afg.hjemmel, // afgørelsens hjemmel bæres videre til ydelsen
      oprettet_af: bruger.navn,
    });
    resultat = { effekt: 'LOEBENDE', loebende };
  } else if (type.effekt === 'ENGANGS') {
    const ydelsestypeId = a.ydelsestype_id ?? type.fast_ydelsestype_id;
    if (!ydelsestypeId) throw new Error('Ansøgningen mangler ydelsestype.');
    const ytype = findYdelsestype(ydelsestypeId);
    const engangs = tilfoejEngangs({
      ejendom_id: sag.ejendom_id,
      ydelsestype_id: ydelsestypeId,
      leveringsdato: dato,
      antal: a.antal ?? 1,
      enhedspris_oere: ytype?.standard_enhedspris_oere ?? 0,
      hjemmel: afg.hjemmel,
      oprettet_af: bruger.navn,
    });
    resultat = { effekt: 'ENGANGS', engangs };
  } else {
    // AFMELD: afslut den valgte løbende ydelse.
    if (!a.afmeld_ydelse_id) throw new Error('Ansøgningen mangler hvilken ydelse der skal afmeldes.');
    const afmeldt = afslutLoebende(a.afmeld_ydelse_id, dato);
    resultat = { effekt: 'AFMELD', afmeldt };
  }

  effektuerede.add(sagId);
  journalnotater.push(
    opretJournalnotat({
      id: nytId('jn'),
      sag_id: sagId,
      tekst: `Afgørelse effektueret: ${beskrivAnsoegning(a)}.`,
      oprettet: nu(),
      oprettet_af: bruger.navn,
    }),
  );
  return resultat;
}
