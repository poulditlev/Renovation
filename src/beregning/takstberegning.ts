import type { Gyldighedsperiode, Id } from '../types.js';
import type { Materiel } from '../materiel.js';
import type { Takst } from '../klassifikationer/takst.js';
import { overlapDage, periodeOverlap } from './periode.js';

/**
 * Opkrævningsperioden der beregnes for. I modsætning til de fleste andre
 * perioder i systemet SKAL denne have en slutdato - man kan ikke opgøre en
 * regning for en periode der ikke er afgrænset.
 */
export interface OpkraevningsPeriode {
  periode_fra: string;
  periode_til: string;
}

/**
 * Én beregnet opkrævningslinje. Svarer til felterne i `opkraevningslinje` der
 * kommer fra selve beregningen - `id` og `opkraevning_id` tildeles først når
 * linjen gemmes, hvilket ligger uden for denne rene funktions ansvar.
 */
export interface BeregnetLinje {
  materiel_id: Id;
  takst_id: Id;
  beskrivelse: string;
  antal_dage: number;
  beloeb_oere: number;
}

export interface BeregningsResultat {
  linjer: BeregnetLinje[];
  beloeb_total_oere: number;
}

/** Antal dage i et givent kalenderår (365 eller 366 i skudår). */
function dageIAar(aar: number): number {
  const periode: Gyldighedsperiode = { gyldig_fra: `${aar}-01-01`, gyldig_til: `${aar + 1}-01-01` };
  return overlapDage(periode, periode);
}

/**
 * Beregner opkrævningslinjer og totalbeløb for en ejendoms materiel i en
 * given opkrævningsperiode.
 *
 * Ren funktion: kender intet til database, filer eller UI - kun input og
 * output. For hvert stykke materiel findes det tidsrum det reelt var aktivt
 * i opkrævningsperioden. Det tidsrum deles op pr. kalenderår (så den årlige
 * takst altid deles med det korrekte antal dage i netop det år - 365 eller
 * 366) og derefter yderligere op pr. gældende takst, så en takstændring midt
 * i perioden giver flere linjer i stedet for én forkert linje.
 *
 * `beloeb_total_oere` er defineret som summen af linjernes beløb, så summen
 * af linjerne pr. definition altid matcher totalen præcist.
 */
export function beregnOpkraevningslinjer(
  materiel: Materiel[],
  periode: OpkraevningsPeriode,
  takster: Takst[],
): BeregningsResultat {
  const opkraevningsperiode: Gyldighedsperiode = {
    gyldig_fra: periode.periode_fra,
    gyldig_til: periode.periode_til,
  };

  const linjer: BeregnetLinje[] = [];

  for (const m of materiel) {
    const materiellePeriode: Gyldighedsperiode = { gyldig_fra: m.gyldig_fra, gyldig_til: m.gyldig_til };
    const aktivtVindue = periodeOverlap(materiellePeriode, opkraevningsperiode);
    if (aktivtVindue === null) {
      continue; // materiellet var slet ikke til stede i opkrævningsperioden
    }

    // aktivtVindue er skåret til inden for opkraevningsperiode, som altid har
    // en slutdato - derfor har aktivtVindue også altid en slutdato her.
    const startAar = Number(aktivtVindue.gyldig_fra.slice(0, 4));
    const slutAar = Number((aktivtVindue.gyldig_til as string).slice(0, 4));

    for (let aar = startAar; aar <= slutAar; aar++) {
      const aarsPeriode: Gyldighedsperiode = { gyldig_fra: `${aar}-01-01`, gyldig_til: `${aar + 1}-01-01` };
      const aarsVindue = periodeOverlap(aktivtVindue, aarsPeriode);
      if (aarsVindue === null) {
        continue;
      }

      const relevanteTakster = takster.filter((t) => t.materieltype_id === m.materieltype_id);

      for (const takst of relevanteTakster) {
        const takstPeriode: Gyldighedsperiode = { gyldig_fra: takst.gyldig_fra, gyldig_til: takst.gyldig_til };
        const antalDage = overlapDage(aarsVindue, takstPeriode);
        if (antalDage === 0) {
          continue;
        }

        const beloebOere = Math.round((takst.beloeb_aarligt_oere * antalDage) / dageIAar(aar));

        linjer.push({
          materiel_id: m.id,
          takst_id: takst.id,
          beskrivelse: `${antalDage} dages leje af materiel ${m.id} i ${aar}`,
          antal_dage: antalDage,
          beloeb_oere: beloebOere,
        });
      }
    }
  }

  const beloeb_total_oere = linjer.reduce((sum, linje) => sum + linje.beloeb_oere, 0);

  return { linjer, beloeb_total_oere };
}
