import type { Part } from '../domain/index.js';
import type { AuditLog } from '../domain/index.js';
import { retKontaktoplysninger } from '../domain/index.js';
import { parter } from './seed.js';

// In-memory-lager for redigering af parter. Muterer parten i lageret og gemmer
// audit-poster. Bruger den rene funktion i domain/kontakt til al validering og
// audit-dannelse - lageret tildeler blot id'er og persisterer.

const auditLog: AuditLog[] = [];

let auditNr = 7000;
function nytAuditId(): string {
  auditNr += 1;
  return `audit-${auditNr}`;
}

export interface RetKontaktStoreResultat {
  part: Part;
  auditPoster: AuditLog[];
}

/**
 * Retter en parts kontaktoplysninger. `aendringer` må kun indeholde
 * selvbetjeningsfelter - registerdata afvises af den rene funktion.
 */
export function retKontakt(
  partId: string,
  aendringer: Record<string, string | null | undefined>,
  bruger = 'borger',
): RetKontaktStoreResultat {
  const idx = parter.findIndex((p) => p.id === partId);
  if (idx < 0) {
    throw new Error(`Ukendt part: ${partId}`);
  }
  const { part, auditPoster } = retKontaktoplysninger(parter[idx] as Part, aendringer, {
    bruger,
    tidspunkt: new Date().toISOString(),
    nyAuditId: nytAuditId,
  });
  parter[idx] = part; // erstat med den opdaterede part (gamle værdier bevares i auditLog)
  auditLog.push(...auditPoster);
  return { part, auditPoster };
}

/** Historik over ændringer af en parts kontaktoplysninger (nyeste først). */
export function kontaktHistorik(partId: string): AuditLog[] {
  return auditLog
    .filter((a) => a.tabel === 'part' && a.raekke_id === partId && a.handling === 'RET')
    .slice()
    .reverse();
}
