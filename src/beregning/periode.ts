import type { Gyldighedsperiode } from '../types.js';

// Al periodelogik i systemet skal gå igennem funktionerne i denne fil. Ingen
// andre steder i koden må sammenligne datoer direkte - det er sådan
// konventionen (gyldig_fra inklusiv, gyldig_til eksklusiv, null = løber
// stadig) holder sig konsistent overalt.

const MS_PER_DAG = 24 * 60 * 60 * 1000;

function tilTidsstempel(dato: string): number {
  return Date.parse(`${dato}T00:00:00.000Z`);
}

function tilDatoStreng(tidsstempel: number): string {
  const iso = new Date(tidsstempel).toISOString();
  return iso.slice(0, 10);
}

/**
 * Finder overlappet mellem to perioder efter den fælles konvention:
 * `gyldig_fra` er inklusiv, `gyldig_til` er eksklusiv, og `null` betyder
 * "løber stadig". Returnerer `null` hvis perioderne slet ikke overlapper.
 */
export function periodeOverlap(a: Gyldighedsperiode, b: Gyldighedsperiode): Gyldighedsperiode | null {
  const fra = Math.max(tilTidsstempel(a.gyldig_fra), tilTidsstempel(b.gyldig_fra));
  const tilA = a.gyldig_til === null ? Infinity : tilTidsstempel(a.gyldig_til);
  const tilB = b.gyldig_til === null ? Infinity : tilTidsstempel(b.gyldig_til);
  const til = Math.min(tilA, tilB);

  if (fra >= til) {
    return null; // intet overlap (eller kun et fælles randpunkt, som ikke tæller pga. eksklusiv gyldig_til)
  }

  return {
    gyldig_fra: tilDatoStreng(fra),
    gyldig_til: til === Infinity ? null : tilDatoStreng(til),
  };
}

/**
 * Antal dage to perioder overlapper. 0 hvis perioderne ikke overlapper.
 * Kræver at overlappet har en slutdato (kaster fejl hvis begge perioder
 * løber stadig, da antal dage så ikke er veldefineret).
 */
export function overlapDage(a: Gyldighedsperiode, b: Gyldighedsperiode): number {
  const overlap = periodeOverlap(a, b);
  if (overlap === null) {
    return 0;
  }
  if (overlap.gyldig_til === null) {
    throw new Error('Kan ikke beregne antal dage for en periode uden slutdato.');
  }
  return (tilTidsstempel(overlap.gyldig_til) - tilTidsstempel(overlap.gyldig_fra)) / MS_PER_DAG;
}
