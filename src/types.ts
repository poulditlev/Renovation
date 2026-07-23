// Fælles typer brugt på tværs af hele datamodellen.

/**
 * Teknisk surrogat-ID. I databasen er dette en uuid, men da vi endnu ikke har
 * en database, er det blot en streng her. Eksterne nøgler (BFE-nummer,
 * adresse-UUID mv.) er bevidst IKKE en del af denne type - de er egne felter
 * med unik constraint, jf. datamodellens princip om at aldrig bruge eksterne
 * nøgler som primærnøgle.
 */
export type Id = string;

/**
 * Den gennemgående periodekonvention for hele systemet:
 * - `gyldig_fra` er INKLUSIV.
 * - `gyldig_til` er EKSKLUSIV.
 * - `null` betyder "løber stadig".
 *
 * Denne konvention må ikke genimplementeres andre steder - al periodelogik
 * skal gå igennem hjælpefunktionerne i `beregning/periode.ts`.
 */
export interface Gyldighedsperiode {
  gyldig_fra: string; // ISO-dato, fx "2026-01-01"
  gyldig_til: string | null;
}
