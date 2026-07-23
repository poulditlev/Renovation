import type { Gyldighedsperiode, Id } from '../types.js';

export type PartRolle = 'EJER' | 'ADMINISTRATOR' | 'BETALER';

/**
 * Koblingen mellem ejendom og part - med periode, for ejere skifter.
 * Svarer til tabellen `ejendom_part` i datamodellen.
 *
 * Constraint værd at bygge (jf. datamodellen): der må kun være én aktiv
 * `BETALER` pr. ejendom ad gangen, og perioderne må ikke overlappe. Håndhæves
 * endnu ikke i in-memory-laget, men seed-dataet overholder reglen.
 */
export interface EjendomPart extends Gyldighedsperiode {
  id: Id;
  ejendom_id: Id;
  part_id: Id;
  rolle: PartRolle;
}
