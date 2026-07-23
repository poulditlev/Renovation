import type { Id } from '../types.js';

/**
 * Hvilke fraktioner en materieltype kan rumme. En to-delt beholder har to
 * rækker - én pr. kammer. Svarer til tabellen `materieltype_fraktion`.
 */
export interface MaterieltypeFraktion {
  materieltype_id: Id;
  fraktion_id: Id;
  kammer_nr: number;
}

// Seed-data: en-delte beholdere rummer restaffald. To-delte beholdere er
// indrettet til madaffald i kammer 1 og restaffald i kammer 2 - den mest
// almindelige to-kammer-opdeling i danske kommuner.
export const materieltypeFraktioner: MaterieltypeFraktion[] = [
  { materieltype_id: 'mtype-140-1', fraktion_id: 'frak-restaffald', kammer_nr: 1 },
  { materieltype_id: 'mtype-240-1', fraktion_id: 'frak-restaffald', kammer_nr: 1 },
  { materieltype_id: 'mtype-660-1', fraktion_id: 'frak-restaffald', kammer_nr: 1 },

  { materieltype_id: 'mtype-140-2', fraktion_id: 'frak-madaffald', kammer_nr: 1 },
  { materieltype_id: 'mtype-140-2', fraktion_id: 'frak-restaffald', kammer_nr: 2 },

  { materieltype_id: 'mtype-240-2', fraktion_id: 'frak-madaffald', kammer_nr: 1 },
  { materieltype_id: 'mtype-240-2', fraktion_id: 'frak-restaffald', kammer_nr: 2 },

  { materieltype_id: 'mtype-660-2', fraktion_id: 'frak-madaffald', kammer_nr: 1 },
  { materieltype_id: 'mtype-660-2', fraktion_id: 'frak-restaffald', kammer_nr: 2 },
];
