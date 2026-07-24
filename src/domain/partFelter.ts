// Klassifikation af felterne på en part. Ligger som DATA ét sted, så en senere
// borgerportal kan bruge præcis samme regel uden at gentage den. Adskillelsen
// mellem borgerens egne data og registerdata er selve sikkerhedsgrænsen:
//
//   - SELVBETJENING: borgerens egne oplysninger (e-mail, telefon). Må rettes
//     direkte uden at der oprettes en sag.
//   - REGISTER: kommer fra eksterne registre (CPR/Ejerfortegnelsen/CVR) og må
//     IKKE rettes i denne applikation. Vises skrivebeskyttet.

export type PartFeltKlasse = 'SELVBETJENING' | 'REGISTER';

export interface PartFeltDefinition {
  felt: string;
  navn: string;
  klasse: PartFeltKlasse;
  /** For registerdata: hvor oplysningen kommer fra. */
  kilde?: string;
}

export const partFelter: PartFeltDefinition[] = [
  { felt: 'email', navn: 'E-mail', klasse: 'SELVBETJENING' },
  { felt: 'telefon', navn: 'Telefon', klasse: 'SELVBETJENING' },
  { felt: 'navn', navn: 'Navn', klasse: 'REGISTER', kilde: 'CPR / Ejerfortegnelsen' },
  { felt: 'parttype', navn: 'Parttype', klasse: 'REGISTER', kilde: 'CPR / CVR' },
  { felt: 'cvr_nummer', navn: 'CVR-nummer', klasse: 'REGISTER', kilde: 'CVR' },
];

/** Felter borgeren selv må rette. Den ENE kilde til den regel. */
export const SELVBETJENING_FELTER: string[] = partFelter
  .filter((f) => f.klasse === 'SELVBETJENING')
  .map((f) => f.felt);

/** Registerdata der kun må vises, ikke rettes. */
export const REGISTER_FELTER: string[] = partFelter
  .filter((f) => f.klasse === 'REGISTER')
  .map((f) => f.felt);

/** Standardforklaring der vises ved skrivebeskyttede registerfelter. */
export const REGISTER_FORKLARING = 'Hentes fra eksternt register og kan ikke rettes her.';

export function erSelvbetjeningsfelt(felt: string): boolean {
  return SELVBETJENING_FELTER.includes(felt);
}
