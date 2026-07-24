import type { Id } from '../types.js';

// Svarer til tabellen `audit_log` i datamodellen. Skrives på tværs af systemet
// for at bevare historik: hvornår noget skete, hvem der gjorde det, og
// værdierne før og efter. Gamle værdier overskrives aldrig sporløst.

export type AuditHandling = 'LAES' | 'OPRET' | 'RET' | 'LUK';

export interface AuditLog {
  id: Id;
  tidspunkt: string;
  bruger: string;
  handling: AuditHandling;
  tabel: string;
  raekke_id: Id;
  foer: unknown; // jsonb: værdier før ændringen
  efter: unknown; // jsonb: værdier efter ændringen
}
