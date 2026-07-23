// Statusværdier for de to slags ydelser. Bruges af brugerfladen, hvor status
// altid vises med BÅDE farve og tekst.

export type LoebendeStatus = 'AKTIV' | 'UDLOEBER_SNART' | 'UDLOEBET';
export type EngangsStatus = 'AFVENTER_LEVERING' | 'LEVERET' | 'AFSLUTTET';
export type Status = LoebendeStatus | EngangsStatus;

/** Menneskelig etiket + en farvenøgle, så UI kan vise farve OG tekst. */
export interface StatusVisning {
  tekst: string;
  farve: 'groen' | 'blaa' | 'gul' | 'roed' | 'graa';
}

export const statusVisninger: Record<Status, StatusVisning> = {
  AKTIV: { tekst: 'Aktiv', farve: 'groen' },
  AFVENTER_LEVERING: { tekst: 'Afventer levering', farve: 'blaa' },
  UDLOEBER_SNART: { tekst: 'Udløber snart', farve: 'gul' },
  UDLOEBET: { tekst: 'Udløbet', farve: 'roed' },
  LEVERET: { tekst: 'Leveret', farve: 'groen' },
  AFSLUTTET: { tekst: 'Afsluttet', farve: 'graa' },
};
