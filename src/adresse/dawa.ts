// -----------------------------------------------------------------------------
// TYNDT ADRESSELAG MOD DAWA (Danmarks Adressers Web API).
//
// UDSKIFTNING: DAWA (api.dataforsyningen.dk) LUKKER 17. AUGUST 2026 og skal
// erstattes af Datafordelerens adresse-/matrikeltjenester. Dette modul er
// bevidst holdt tyndt og er det ENESTE sted i systemet der kender DAWA's
// URL'er og rå svar-format. Al øvrig kode arbejder kun med de rene objekter
// (`AdresseForslag`, `Jordstykke`) som eksporteres herfra. Når DAWA udskiftes,
// skal kun parserne og URL'erne i denne fil ændres - resten af systemet er
// upåvirket.
//
// Konvention: vi gemmer `adresse_uuid` (og `husnummer_uuid`) som nøgle, ALDRIG
// adressetekst. `adressetekst` er kun en cachet visningsværdi der kan forældes.
// -----------------------------------------------------------------------------

const DAWA_BASISURL = 'https://api.dataforsyningen.dk';

/** Fetch-signaturen vi afhænger af. Kan injiceres i tests, så der ikke kaldes ud på nettet. */
export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Et rent adresseforslag - systemets eget format, uafhængigt af DAWA. */
export interface AdresseForslag {
  adresse_uuid: string; // adgangsadressens UUID - nøglen vi gemmer
  husnummer_uuid: string | null; // bruges til jordstykke-opslag
  adressetekst: string; // cachet visningsværdi
  vejnavn: string;
  husnr: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  kommune_navn: string | null; // fra DAWA-feltet kommune.navn
  latitude: number | null;
  longitude: number | null;
}

/** Et rent jordstykke med geometri til kortvisning. */
export interface Jordstykke {
  matrikelnummer: string;
  ejerlavskode: string;
  ejerlavsnavn: string | null;
  geojson: unknown; // GeoJSON-geometri (Polygon/MultiPolygon)
}

export type DawaFejlKind = 'netvaerksfejl' | 'ugyldigt_svar';

/** Fejl fra adresselaget. `kind` gør det muligt at reagere pænt i UI'en. */
export class DawaFejl extends Error {
  constructor(
    public readonly kind: DawaFejlKind,
    besked: string,
  ) {
    super(besked);
    this.name = 'DawaFejl';
  }
}

// --- Parsere (rene funktioner, testes mod gemte eksempelsvar) -----------------

function somObjekt(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function somTekst(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function somTal(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Parser DAWA's autocomplete-svar for adgangsadresser til rene forslag.
 * Ukendte/ufuldstændige elementer springes over frem for at kaste - et enkelt
 * skævt element må ikke vælte hele søgningen.
 */
export function parseAutocomplete(raw: unknown): AdresseForslag[] {
  if (!Array.isArray(raw)) {
    throw new DawaFejl('ugyldigt_svar', 'Forventede en liste fra DAWA autocomplete.');
  }

  const forslag: AdresseForslag[] = [];
  for (const element of raw) {
    const rk = somObjekt(element);
    const adg = rk && somObjekt(rk['adgangsadresse']);
    const id = adg && somTekst(adg['id']);
    if (!adg || !id) continue; // uden UUID kan vi ikke bruge forslaget

    const husnummerUuid =
      somTekst(adg['husnummerid']) ?? somTekst((somObjekt(adg['husnummer']) ?? {})['id']) ?? null;
    const kommuneNavn = somTekst((somObjekt(adg['kommune']) ?? {})['navn']);

    forslag.push({
      adresse_uuid: id,
      husnummer_uuid: husnummerUuid,
      adressetekst: somTekst(rk?.['tekst']) ?? somTekst(adg['betegnelse']) ?? '',
      vejnavn: somTekst(adg['vejnavn']) ?? '',
      husnr: somTekst(adg['husnr']) ?? '',
      postnr: somTekst(adg['postnr']) ?? '',
      postnrnavn: somTekst(adg['postnrnavn']) ?? '',
      kommunekode: somTekst(adg['kommunekode']) ?? '',
      kommune_navn: kommuneNavn,
      latitude: somTal(adg['y']),
      longitude: somTal(adg['x']),
    });
  }
  return forslag;
}

/**
 * Parser DAWA's jordstykke-svar (GeoJSON FeatureCollection) til ét rent
 * jordstykke. Returnerer `null`, hvis adressen ikke har noget jordstykke
 * (tom FeatureCollection) - det er ikke en fejl.
 */
export function parseJordstykke(raw: unknown): Jordstykke | null {
  const fc = somObjekt(raw);
  const features = fc?.['features'];
  if (!Array.isArray(features)) {
    throw new DawaFejl('ugyldigt_svar', 'Forventede en GeoJSON FeatureCollection fra DAWA.');
  }
  if (features.length === 0) {
    return null; // adresse uden jordstykke
  }

  const feature = somObjekt(features[0]);
  const props = somObjekt(feature?.['properties']) ?? {};
  const geometri = feature?.['geometry'] ?? null;

  const ejerlavkode = props['ejerlavkode'];
  return {
    matrikelnummer: somTekst(props['matrikelnr']) ?? '',
    ejerlavskode: somTekst(ejerlavkode) ?? (somTal(ejerlavkode) !== null ? String(ejerlavkode) : ''),
    ejerlavsnavn: somTekst(props['ejerlavnavn']),
    geojson: geometri,
  };
}

// --- Netværkslag (tyndt; kun her sker HTTP-kald) ------------------------------

async function hentJson(url: string, fetchFn: FetchFn): Promise<unknown> {
  let svar: Awaited<ReturnType<FetchFn>>;
  try {
    svar = await fetchFn(url);
  } catch (e) {
    throw new DawaFejl('netvaerksfejl', `Kunne ikke nå DAWA: ${(e as Error).message}`);
  }
  if (!svar.ok) {
    throw new DawaFejl('netvaerksfejl', `DAWA svarede med status ${svar.status}.`);
  }
  try {
    return await svar.json();
  } catch (e) {
    throw new DawaFejl('ugyldigt_svar', `DAWA-svaret kunne ikke læses som JSON: ${(e as Error).message}`);
  }
}

const standardFetch: FetchFn = (url) => fetch(url);

/**
 * Søger adgangsadresser via DAWA's autocomplete. Returnerer en (evt. tom)
 * liste af rene forslag. Ingen resultater er ikke en fejl - det giver blot en
 * tom liste. Søgningen begrænses til Roskilde Kommune (kommunekode 0265).
 */
export async function soegAdresser(q: string, fetchFn: FetchFn = standardFetch): Promise<AdresseForslag[]> {
  const soegetekst = q.trim();
  if (soegetekst.length === 0) return [];

  const url =
    `${DAWA_BASISURL}/adgangsadresser/autocomplete` +
    `?q=${encodeURIComponent(soegetekst)}&kommunekode=0265&per_side=10`;
  const raw = await hentJson(url, fetchFn);
  return parseAutocomplete(raw);
}

/**
 * Henter jordstykket (matrikel + polygon) for et husnummer-UUID. Returnerer
 * `null`, hvis der ikke findes noget jordstykke for adressen.
 */
export async function hentJordstykke(
  husnummerUuid: string,
  fetchFn: FetchFn = standardFetch,
): Promise<Jordstykke | null> {
  const url = `${DAWA_BASISURL}/jordstykker?husnummerid=${encodeURIComponent(husnummerUuid)}&format=geojson`;
  const raw = await hentJson(url, fetchFn);
  return parseJordstykke(raw);
}
