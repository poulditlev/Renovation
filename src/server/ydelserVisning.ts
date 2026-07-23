import { fraktioner, takster } from '../klassifikationer/index.js';
import type { Takst } from '../klassifikationer/index.js';
import {
  beregnEngangsbeloeb,
  beregnEngangsStatus,
  beregnLoebendeStatus,
  findBindingsperiode,
  findYdelsestype,
  statusVisninger,
  STANDARD_VARSLINGSVINDUE_DAGE,
} from '../ydelser/index.js';
import type { Status } from '../ydelser/index.js';
import { engangsForEjendom, loebendeForEjendom, varslingerForEjendom } from '../data/ydelserStore.js';

// Samler ydelses-rækker til de visningsobjekter brugerfladen skal bruge:
// to adskilte lister (løbende og engangs), status med både farve og tekst, og
// de registrerede varslinger. Holdt adskilt fra HTTP-laget, så det kan testes.

export interface StatusDto {
  kode: Status;
  tekst: string;
  farve: string;
}

function statusDto(kode: Status): StatusDto {
  const v = statusVisninger[kode];
  return { kode, tekst: v.tekst, farve: v.farve };
}

function fraktionNavn(fraktionId: string | null): string | null {
  if (!fraktionId) return null;
  return fraktioner.find((f) => f.id === fraktionId)?.navn ?? fraktionId;
}

/** Den takst der er gældende for en materieltype på en given dato (perioderegel). */
export function gaeldendeTakst(materieltypeId: string, paaDato: string): Takst | undefined {
  return takster.find(
    (t) =>
      t.materieltype_id === materieltypeId &&
      t.gyldig_fra <= paaDato &&
      (t.gyldig_til === null || paaDato < t.gyldig_til),
  );
}

export interface LoebendeYdelseDto {
  id: string;
  ydelse_navn: string;
  fraktion_navn: string | null;
  gyldig_fra: string;
  gyldig_til: string | null;
  binding_navn: string;
  aarlig_takst_oere: number | null;
  takst_id: string | null;
  status: StatusDto;
  kan_forny: boolean;
}

export interface EngangsleveranceDto {
  id: string;
  ydelse_navn: string;
  fraktion_navn: string | null;
  antal: number;
  leveringsdato: string;
  enhedspris_oere: number;
  beloeb_oere: number;
  status: StatusDto;
}

export interface VarslingDto {
  id: string;
  ydelse_id: string;
  modtager_email: string | null;
  udloebsdato: string;
  tidspunkt: string;
  note: string;
}

export interface YdelserVisning {
  loebende: LoebendeYdelseDto[];
  engangs: EngangsleveranceDto[];
  varslinger: VarslingDto[];
  varslingsvindue_dage: number;
}

export function byggYdelserVisning(
  ejendomId: string,
  paaDato: string = new Date().toISOString().slice(0, 10),
  varslingsvindueDage: number = STANDARD_VARSLINGSVINDUE_DAGE,
): YdelserVisning {
  const loebende: LoebendeYdelseDto[] = loebendeForEjendom(ejendomId).map((y) => {
    const type = findYdelsestype(y.ydelsestype_id);
    const binding = findBindingsperiode(y.bindingsperiode_kode);
    const status = beregnLoebendeStatus(y, paaDato, varslingsvindueDage);
    const takst = gaeldendeTakst(y.materieltype_id, paaDato);
    return {
      id: y.id,
      ydelse_navn: type?.navn ?? y.ydelsestype_id,
      fraktion_navn: fraktionNavn(type?.fraktion_id ?? null),
      gyldig_fra: y.gyldig_fra,
      gyldig_til: y.gyldig_til,
      binding_navn: binding?.navn ?? y.bindingsperiode_kode,
      aarlig_takst_oere: takst?.beloeb_aarligt_oere ?? null,
      takst_id: takst?.id ?? null,
      status: statusDto(status),
      // Kun ydelser der udløber snart eller er udløbet kan fornyes meningsfuldt.
      kan_forny: y.gyldig_til !== null && (status === 'UDLOEBER_SNART' || status === 'UDLOEBET'),
    };
  });

  const engangs: EngangsleveranceDto[] = engangsForEjendom(ejendomId).map((e) => {
    const type = findYdelsestype(e.ydelsestype_id);
    return {
      id: e.id,
      ydelse_navn: type?.navn ?? e.ydelsestype_id,
      fraktion_navn: fraktionNavn(type?.fraktion_id ?? null),
      antal: e.antal,
      leveringsdato: e.leveringsdato,
      enhedspris_oere: e.enhedspris_oere,
      beloeb_oere: beregnEngangsbeloeb(e),
      status: statusDto(beregnEngangsStatus(e, paaDato)),
    };
  });

  const varslinger: VarslingDto[] = varslingerForEjendom(ejendomId).map((v) => ({
    id: v.id,
    ydelse_id: v.ydelse_id,
    modtager_email: v.modtager_email,
    udloebsdato: v.udloebsdato,
    tidspunkt: v.tidspunkt,
    note: v.note,
  }));

  return { loebende, engangs, varslinger, varslingsvindue_dage: varslingsvindueDage };
}
