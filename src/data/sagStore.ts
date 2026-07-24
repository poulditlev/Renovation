import type { Afgoerelse, Afgoerelsesresultat, Journalnotat, Sag, SagStatus } from '../sag/index.js';
import {
  opretJournalnotat,
  opretSag,
  skiftSagStatus,
  traefAfgoerelse,
} from '../sag/index.js';
import { parterForEjendom } from './store.js';

// In-memory-lager for sager, afgørelser og journalnotater. Journalnotater og
// afgørelser slettes/ændres aldrig. Mutationerne kalder de rene funktioner i
// sag-modulet; lageret tildeler id'er/sagsnumre og gemmer rækker.

const sager: Sag[] = [];
const afgoerelser: Afgoerelse[] = [];
const journalnotater: Journalnotat[] = [];

let sagLøbeNr = 122;
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
    ansvarlig_bruger: 'sagsbehandler@korsbaek.example.dk',
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
    ansvarlig_bruger: 'sagsbehandler@korsbaek.example.dk',
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
}

export interface OpretSagStoreInput {
  ejendom_id: string;
  sagstype_id: string;
}
export function tilfoejSag(input: OpretSagStoreInput, bruger: HandlendeBruger): Sag {
  const partId = parterForEjendom(input.ejendom_id).find((p) => p.kobling.rolle === 'BETALER')?.part.id ?? null;
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
  });
  sager.push(sag);
  journalnotater.push(
    opretJournalnotat({
      id: nytId('jn'),
      sag_id: sag.id,
      tekst: `Sag oprettet (${sag.kanal === 'SELVBETJENING' ? 'selvbetjening' : 'sagsbehandler'}).`,
      oprettet: nu(),
      oprettet_af: bruger.navn,
    }),
  );
  return sag;
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
