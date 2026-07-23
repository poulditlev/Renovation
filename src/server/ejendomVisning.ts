import type { Ejendom } from '../domain/index.js';
import {
  fraktioner,
  materieltypeFraktioner,
  materieltyper,
} from '../klassifikationer/index.js';
import { materielForEjendom, parterForEjendom } from '../data/store.js';

// Samler de rå in-memory-rækker til de visningsobjekter brugerfladen skal
// bruge. Holdt adskilt fra HTTP-laget, så det kan testes uden en server.

export interface PartVisning {
  id: string;
  parttype: string;
  navn: string;
  cvr_nummer: string | null;
  email: string | null;
  telefon: string | null;
  roller: string[]; // en part kan have flere roller, fx EJER og BETALER
}

export interface MaterielVisning {
  id: string;
  materieltype_kode: string;
  materieltype_navn: string;
  volumen_liter: number;
  antal_kamre: number;
  fraktioner: string[];
  standplads_beskrivelse: string | null;
  standplads_lat: number | null;
  standplads_lng: number | null;
  gyldig_fra: string;
  gyldig_til: string | null;
  aktiv: boolean;
}

export interface EjendomVisning {
  ejendom: Ejendom;
  parter: PartVisning[];
  materiel: MaterielVisning[];
}

function fraktionerForMaterieltype(materieltypeId: string): string[] {
  return materieltypeFraktioner
    .filter((mf) => mf.materieltype_id === materieltypeId)
    .sort((a, b) => a.kammer_nr - b.kammer_nr)
    .map((mf) => {
      const frak = fraktioner.find((f) => f.id === mf.fraktion_id);
      const navn = frak?.navn ?? mf.fraktion_id;
      return mf.kammer_nr ? `Kammer ${mf.kammer_nr}: ${navn}` : navn;
    });
}

function erAktiv(gyldigFra: string, gyldigTil: string | null, paaDato: string): boolean {
  if (paaDato < gyldigFra) return false;
  if (gyldigTil !== null && paaDato >= gyldigTil) return false;
  return true;
}

/**
 * Bygger visningsobjektet for en ejendom ud fra in-memory-lageret.
 * `ejendom` leveres udefra, så både seed-ejendomme og ejendomme fundet live
 * via DAWA kan vises med samme funktion.
 */
export function byggEjendomVisning(ejendom: Ejendom, paaDato = new Date().toISOString().slice(0, 10)): EjendomVisning {
  // Saml roller pr. part, så samme part (fx både EJER og BETALER) vises én gang.
  const partMap = new Map<string, PartVisning>();
  for (const { kobling, part } of parterForEjendom(ejendom.id, paaDato)) {
    const eksisterende = partMap.get(part.id);
    if (eksisterende) {
      if (!eksisterende.roller.includes(kobling.rolle)) eksisterende.roller.push(kobling.rolle);
    } else {
      partMap.set(part.id, {
        id: part.id,
        parttype: part.parttype,
        navn: part.navn,
        cvr_nummer: part.cvr_nummer,
        email: part.email,
        telefon: part.telefon,
        roller: [kobling.rolle],
      });
    }
  }
  const parter: PartVisning[] = [...partMap.values()];

  const materiel: MaterielVisning[] = materielForEjendom(ejendom.id).map((m) => {
    const type = materieltyper.find((t) => t.id === m.materieltype_id);
    return {
      id: m.id,
      materieltype_kode: type?.kode ?? m.materieltype_id,
      materieltype_navn: type?.navn ?? m.materieltype_id,
      volumen_liter: type?.volumen_liter ?? 0,
      antal_kamre: type?.antal_kamre ?? 0,
      fraktioner: fraktionerForMaterieltype(m.materieltype_id),
      standplads_beskrivelse: m.standplads_beskrivelse ?? null,
      standplads_lat: m.standplads_lat ?? null,
      standplads_lng: m.standplads_lng ?? null,
      gyldig_fra: m.gyldig_fra,
      gyldig_til: m.gyldig_til,
      aktiv: erAktiv(m.gyldig_fra, m.gyldig_til, paaDato),
    };
  });

  return { ejendom, parter, materiel };
}
