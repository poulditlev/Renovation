import type { Id } from '../types.js';

/**
 * Systemets subjekt. Renovation følger matriklen, ikke personen.
 * Svarer til tabellen `ejendom` i datamodellen.
 *
 * Bemærk konventionen fra datamodellen: eksterne nøgler (BFE-nummer og
 * adresse-UUID) gemmes som almindelige felter, ikke som primærnøgle. Adressen
 * gemmes som `adresse_uuid` (DAWA/Adressevælger), mens `adressetekst` kun er en
 * cachet visningsværdi der kan blive forældet.
 */
export interface Ejendom {
  id: Id;
  bfe_nummer: string;
  adresse_uuid: string;
  adressetekst: string;
  kommunekode: string;
  kommunenavn: string | null;
  matrikelnummer: string;
  ejerlavskode: string;
  ejerlavsnavn: string | null;
  latitude: number | null;
  longitude: number | null;
  jordstykke_geojson: unknown | null; // GeoJSON-polygon, hentes via DAWA jordstykke-opslag
  anvendelseskode: string | null;
  /** Husnummer-UUID fra DAWA, bruges til jordstykke-opslag. Ikke i datamodellen som selvstændigt felt, men nødvendigt for kortvisningen. */
  husnummer_uuid: string | null;
  oprettet: string;
  oprettet_af: string;
}
