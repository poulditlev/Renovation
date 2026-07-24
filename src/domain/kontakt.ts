import type { Part } from './part.js';
import type { AuditLog } from './audit.js';
import { SELVBETJENING_FELTER } from './partFelter.js';

// Ren logik for redigering af en parts kontaktoplysninger. Kender intet til
// UI, database eller HTTP. Det er her sikkerheden for den senere
// selvbetjeningsmodel ligger: forsøg på at ændre registerdata AFVISES her -
// ikke kun i brugerfladen.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normaliserer et dansk telefonnummer: fjerner mellemrum og en evt. landekode
 * (+45 eller 0045), så "+45 12 34 56 78" og "12 34 56 78" bliver til samme
 * værdi. Tom værdi giver tom streng (man må gerne fjerne sit nummer).
 */
export function normaliserTelefon(raw: string | null | undefined): string {
  if (raw == null) return '';
  let t = String(raw).replace(/\s+/g, '');
  if (t === '') return '';
  if (t.startsWith('+45')) t = t.slice(3);
  else if (t.startsWith('0045')) t = t.slice(4);
  return t;
}

export interface RetKontaktKontekst {
  bruger: string;
  tidspunkt: string;
  nyAuditId: () => string;
}

export interface RetKontaktResultat {
  part: Part;
  auditPoster: AuditLog[];
}

/**
 * Validerer og anvender en ændring af kontaktoplysninger (e-mail/telefon).
 *
 * - Kun selvbetjeningsfelter må sendes; et forsøg på at ændre registerdata
 *   (navn, parttype, cvr) afvises med en klar fejl.
 * - E-mail skal have gyldig form; telefon normaliseres til dansk 8-cifret.
 * - Tomme værdier er tilladt, men mindst én kontaktmulighed skal blive tilbage,
 *   ellers kan der ikke sendes varsling.
 * - Der skrives præcis én audit-post pr. felt der faktisk ændrer værdi;
 *   uændrede felter skriver ingen post.
 *
 * Ren funktion: ændrer ikke input-parten, men returnerer en ny.
 */
export function retKontaktoplysninger(
  part: Part,
  aendringer: Record<string, string | null | undefined>,
  ctx: RetKontaktKontekst,
): RetKontaktResultat {
  // Afvis forsøg på at ændre registerdata (bærer sikkerheden senere).
  for (const felt of Object.keys(aendringer)) {
    if (!SELVBETJENING_FELTER.includes(felt)) {
      throw new Error(`Feltet "${felt}" er registerdata og kan ikke rettes her.`);
    }
  }

  // Beregn de nye værdier; felter der ikke er med, beholder deres eksisterende værdi.
  const nyEmailRaw = 'email' in aendringer ? aendringer.email : part.email;
  const nyTelefonRaw = 'telefon' in aendringer ? aendringer.telefon : part.telefon;

  const nyEmail = nyEmailRaw == null || String(nyEmailRaw).trim() === '' ? null : String(nyEmailRaw).trim();
  const nyTelefonNorm = normaliserTelefon(nyTelefonRaw);
  const nyTelefon = nyTelefonNorm === '' ? null : nyTelefonNorm;

  if (nyEmail !== null && !EMAIL_RE.test(nyEmail)) {
    throw new Error('E-mailadressen har ikke en gyldig form.');
  }
  if (nyTelefon !== null && !/^\d{8}$/.test(nyTelefon)) {
    throw new Error('Telefonnummeret skal være et gyldigt dansk 8-cifret nummer.');
  }
  if (nyEmail === null && nyTelefon === null) {
    throw new Error('Mindst én kontaktmulighed skal være udfyldt, ellers kan der ikke sendes varsling.');
  }

  // Skriv audit-poster for de felter der faktisk ændrer værdi.
  const auditPoster: AuditLog[] = [];
  const nyPart: Part = { ...part };
  const felter: Array<['email' | 'telefon', string | null]> = [
    ['email', nyEmail],
    ['telefon', nyTelefon],
  ];
  for (const [felt, nyVaerdi] of felter) {
    if (!(felt in aendringer)) continue; // kun felter der blev sendt
    const gammel = part[felt] ?? null;
    if (gammel === nyVaerdi) continue; // uændret -> ingen audit-post
    nyPart[felt] = nyVaerdi;
    auditPoster.push({
      id: ctx.nyAuditId(),
      tidspunkt: ctx.tidspunkt,
      bruger: ctx.bruger,
      handling: 'RET',
      tabel: 'part',
      raekke_id: part.id,
      foer: { [felt]: gammel },
      efter: { [felt]: nyVaerdi },
    });
  }

  return { part: nyPart, auditPoster };
}
