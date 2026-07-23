import type { Gyldighedsperiode, Id } from './types.js';

/**
 * Én fysisk beholder på en ejendom, med sin egen gyldighedsperiode
 * (opsat / fjernet). Svarer til tabellen `materiel` i datamodellen.
 *
 * Denne opgave bygger kun klassifikationer og takstberegning - felter som
 * `chip_id`, `standplads_beskrivelse` mv. hører til et senere lag (ejendom og
 * materiel som fuld entitet) og er derfor ikke med her. Kun det
 * takstberegningen faktisk har brug for er taget med.
 */
export interface Materiel extends Gyldighedsperiode {
  id: Id;
  ejendom_id: Id;
  materieltype_id: Id;
}
