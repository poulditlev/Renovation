import type { Gyldighedsperiode, Id } from './types.js';

/**
 * Én fysisk beholder på en ejendom, med sin egen gyldighedsperiode
 * (opsat / fjernet). Svarer til tabellen `materiel` i datamodellen.
 *
 * Takstberegningen bruger kun `id`, `ejendom_id`, `materieltype_id` og
 * gyldighedsperioden. De øvrige felter (standplads mv.) er med her, fordi
 * brugerfladen viser beholdernes standpladser på kortet. De er valgfri, så
 * takstberegningens tests og eksisterende kode er upåvirket.
 */
export interface Materiel extends Gyldighedsperiode {
  id: Id;
  ejendom_id: Id;
  materieltype_id: Id;
  chip_id?: string | null;
  standplads_beskrivelse?: string | null;
  standplads_lat?: number | null;
  standplads_lng?: number | null;
  oprettet_af_sag_id?: Id | null;
}
