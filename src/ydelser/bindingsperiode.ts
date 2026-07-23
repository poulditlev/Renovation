/**
 * Kodeliste over tilladte bindingsperioder for løbende ydelser. Ligger som
 * DATA, ikke som logik i koden, så en administrator kan ændre dem uden
 * kodeændring.
 *
 * Minimum er 6 måneder. Kortere binding kræver dispensation og skal oprettes
 * som en sag (bygges ikke nu) - valideringen i `fornyelse.ts` afviser det.
 */
export interface Bindingsperiode {
  kode: string;
  navn: string;
  maaneder: number;
}

/** Mindste tilladte bindingsperiode i måneder. Under dette kræves dispensation. */
export const MIN_BINDING_MAANEDER = 6;

export const bindingsperioder: Bindingsperiode[] = [
  { kode: '6_MDR', navn: '6 måneder', maaneder: 6 },
  { kode: '12_MDR', navn: '12 måneder', maaneder: 12 },
  { kode: '24_MDR', navn: '24 måneder', maaneder: 24 },
  // Sæsonbinding til haveaffald: ca. 8 måneder (fx marts-oktober).
  { kode: 'SAESON', navn: 'Sæson (haveaffald)', maaneder: 8 },
];

export function findBindingsperiode(kode: string): Bindingsperiode | undefined {
  return bindingsperioder.find((b) => b.kode === kode);
}
