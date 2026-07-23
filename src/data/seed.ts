import type { Ejendom, EjendomPart, Part, Parttype } from '../domain/index.js';
import type { Materiel } from '../materiel.js';
import { materieltyper } from '../klassifikationer/index.js';

// -----------------------------------------------------------------------------
// Seed-data til demonstrationssystemet.
//
// ADVARSEL: Alle parter (personer, forening, virksomheder) er FIKTIVE. Navne er
// tydeligt opdigtede og e-mailadresser bruger @example.dk. Feltet `ekstern_id`
// (CPR) holdes bevidst tomt. Adresserne ligger i Roskilde Kommune, og
// BFE-numre samt DAWA-UUID'er her er illustrative demoværdier - i et rigtigt
// system ville de komme fra Datafordeleren/DAWA.
//
// Hver ejendom har en cachet jordstykke-polygon (et lille kvadrat om
// adgangspunktet), så kortet virker uden netadgang for seed-ejendomme. Ved
// adressesøgning hentes den rigtige polygon live fra DAWA.
// -----------------------------------------------------------------------------

const OPRETTET = '2024-01-15T09:00:00.000Z';
const OPRETTET_AF = 'seed';
const KOMMUNEKODE_ROSKILDE = '0265';

/** materieltype-kode -> id, så seed-materiellet peger på de rigtige typer. */
function materieltypeId(kode: string): string {
  const type = materieltyper.find((t) => t.kode === kode);
  if (!type) throw new Error(`Ukendt materieltype i seed: ${kode}`);
  return type.id;
}

/** Bygger en lille kvadratisk GeoJSON-polygon (~30 m) om et punkt. */
function polygonOm(lat: number, lng: number): unknown {
  const dLat = 0.000135;
  const dLng = 0.000239;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

interface MaterielSpec {
  kode: string;
  opsat: string;
  fjernet?: string;
  standplads: string;
}

interface SeedRad {
  bfe: string;
  adressetekst: string;
  lat: number;
  lng: number;
  matrikelnummer: string;
  ejerlavskode: string;
  ejerlavsnavn: string;
  anvendelseskode: string;
  parttype: Parttype;
  navn: string;
  cvr?: string;
  email: string;
  telefon: string;
  rolle_ejer_er_ogsaa_betaler?: boolean;
  materiel: MaterielSpec[];
}

// 20 fiktive parter i Roskilde: overvejende personer, én boligforening og
// tre virksomheder. Navnene er bevidst opdigtede.
const raekker: SeedRad[] = [
  {
    bfe: '3010001', adressetekst: 'Stændertorvet 2, 4000 Roskilde', lat: 55.6419, lng: 12.0803,
    matrikelnummer: '210a', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Testa Testesen (fiktiv)', email: 'testa.testesen@example.dk', telefon: '20000001',
    materiel: [
      { kode: '240L-2KAMMER', opsat: '2023-03-01', standplads: 'Ved indgangen mod gården' },
      { kode: '140L-1KAMMER', opsat: '2023-03-01', standplads: 'Ved indgangen mod gården' },
    ],
  },
  {
    bfe: '3010002', adressetekst: 'Algade 14, 4000 Roskilde', lat: 55.6425, lng: 12.0791,
    matrikelnummer: '145b', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Bodil Blomquist (fiktiv)', email: 'bodil.blomquist@example.dk', telefon: '20000002',
    materiel: [
      { kode: '240L-2KAMMER', opsat: '2024-06-01', standplads: 'Bag lågen til venstre' },
    ],
  },
  {
    bfe: '3010003', adressetekst: 'Skomagergade 5, 4000 Roskilde', lat: 55.6412, lng: 12.0808,
    matrikelnummer: '98c', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Carsten Kaktus (fiktiv)', email: 'carsten.kaktus@example.dk', telefon: '20000003',
    materiel: [
      { kode: '140L-2KAMMER', opsat: '2023-01-01', standplads: 'Under halvtag ved gavlen' },
    ],
  },
  {
    bfe: '3010004', adressetekst: 'Hersegade 12, 4000 Roskilde', lat: 55.6437, lng: 12.0817,
    matrikelnummer: '33d', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Dagmar Drivhus (fiktiv)', email: 'dagmar.drivhus@example.dk', telefon: '20000004',
    materiel: [
      { kode: '240L-1KAMMER', opsat: '2022-05-01', standplads: 'Ved carporten' },
      { kode: '140L-1KAMMER', opsat: '2022-05-01', standplads: 'Ved carporten' },
    ],
  },
  {
    bfe: '3010005', adressetekst: 'Allehelgensgade 8, 4000 Roskilde', lat: 55.6431, lng: 12.0829,
    matrikelnummer: '77e', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Egon Egeskov (fiktiv)', email: 'egon.egeskov@example.dk', telefon: '20000005',
    materiel: [
      { kode: '240L-2KAMMER', opsat: '2023-09-15', standplads: 'Ved fortrappen' },
    ],
  },
  {
    bfe: '3010006', adressetekst: 'Kong Valdemars Vej 20, 4000 Roskilde', lat: 55.6388, lng: 12.0762,
    matrikelnummer: '412f', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Frida Ferskvand (fiktiv)', email: 'frida.ferskvand@example.dk', telefon: '20000006',
    materiel: [
      { kode: '140L-2KAMMER', opsat: '2021-11-01', standplads: 'Ved havelågen' },
    ],
  },
  {
    bfe: '3010007', adressetekst: 'Sankt Ols Gade 3, 4000 Roskilde', lat: 55.6443, lng: 12.0796,
    matrikelnummer: '55g', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Gorm Granit (fiktiv)', email: 'gorm.granit@example.dk', telefon: '20000007',
    materiel: [
      { kode: '240L-1KAMMER', opsat: '2020-02-01', fjernet: '2025-07-01', standplads: 'Ved skuret' },
      { kode: '240L-2KAMMER', opsat: '2025-07-01', standplads: 'Ved skuret' },
    ],
  },
  {
    bfe: '3010008', adressetekst: 'Læderstræde 7, 4000 Roskilde', lat: 55.6408, lng: 12.0785,
    matrikelnummer: '61h', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Henny Hyben (fiktiv)', email: 'henny.hyben@example.dk', telefon: '20000008',
    materiel: [
      { kode: '140L-1KAMMER', opsat: '2024-01-10', standplads: 'Til højre for døren' },
    ],
  },
  {
    bfe: '3010009', adressetekst: 'Jernbanegade 18, 4000 Roskilde', lat: 55.6395, lng: 12.0838,
    matrikelnummer: '203i', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Ib Istap (fiktiv)', email: 'ib.istap@example.dk', telefon: '20000009',
    materiel: [
      { kode: '240L-2KAMMER', opsat: '2023-04-01', standplads: 'I gården bag porten' },
    ],
  },
  {
    bfe: '3010010', adressetekst: 'Maglekildevej 4, 4000 Roskilde', lat: 55.6402, lng: 12.0748,
    matrikelnummer: '188j', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Jytte Jordbær (fiktiv)', email: 'jytte.jordbaer@example.dk', telefon: '20000010',
    materiel: [
      { kode: '140L-2KAMMER', opsat: '2022-08-01', standplads: 'Ved terrassen' },
    ],
  },
  {
    bfe: '3010011', adressetekst: 'Byvolden 22, 4000 Roskilde', lat: 55.6461, lng: 12.0854,
    matrikelnummer: '301k', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Karl Klippe (fiktiv)', email: 'karl.klippe@example.dk', telefon: '20000011',
    materiel: [
      { kode: '240L-1KAMMER', opsat: '2021-03-01', standplads: 'Ved indkørslen' },
    ],
  },
  {
    bfe: '3010012', adressetekst: 'Himmelev Bygade 40, 4000 Roskilde', lat: 55.6553, lng: 12.0912,
    matrikelnummer: '9m', ejerlavskode: '20553', ejerlavsnavn: 'Himmelev By, Himmelev', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Lone Lærketræ (fiktiv)', email: 'lone.laerketrae@example.dk', telefon: '20000012',
    materiel: [
      { kode: '240L-2KAMMER', opsat: '2023-10-01', standplads: 'Ved gavlen mod nord' },
    ],
  },
  {
    bfe: '3010013', adressetekst: 'Trekroner Allé 10, 4000 Roskilde', lat: 55.6489, lng: 12.1287,
    matrikelnummer: '14n', ejerlavskode: '20555', ejerlavsnavn: 'Trekroner, Roskilde Jorder', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Mads Mos (fiktiv)', email: 'mads.mos@example.dk', telefon: '20000013',
    materiel: [
      { kode: '140L-2KAMMER', opsat: '2024-02-01', standplads: 'Ved cykelskuret' },
    ],
  },
  {
    bfe: '3010014', adressetekst: 'Vindingevej 32, 4000 Roskilde', lat: 55.6301, lng: 12.1024,
    matrikelnummer: '27o', ejerlavskode: '20557', ejerlavsnavn: 'Vindinge By, Vindinge', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Nanna Nælde (fiktiv)', email: 'nanna.naelde@example.dk', telefon: '20000014',
    materiel: [
      { kode: '240L-1KAMMER', opsat: '2022-01-01', standplads: 'Bag hækken' },
    ],
  },
  {
    bfe: '3010015', adressetekst: 'Store Valbyvej 100, 4000 Roskilde', lat: 55.6602, lng: 12.0561,
    matrikelnummer: '5p', ejerlavskode: '20559', ejerlavsnavn: 'Store Valby By, Ågerup', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Otto Orkan (fiktiv)', email: 'otto.orkan@example.dk', telefon: '20000015',
    materiel: [
      { kode: '140L-1KAMMER', opsat: '2023-06-01', standplads: 'Ved postkassen' },
    ],
  },
  {
    bfe: '3010016', adressetekst: 'Ringstedgade 55, 4000 Roskilde', lat: 55.6371, lng: 12.0709,
    matrikelnummer: '77r', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '120',
    parttype: 'PERSON', navn: 'Preben Piletræ (fiktiv)', email: 'preben.piletrae@example.dk', telefon: '20000016',
    materiel: [
      { kode: '240L-2KAMMER', opsat: '2021-09-01', standplads: 'Ved garagen' },
    ],
  },
  // Boligforening med fælles standplads og store beholdere.
  {
    bfe: '3010017', adressetekst: 'Betonvej 6, 4000 Roskilde', lat: 55.6337, lng: 12.0902,
    matrikelnummer: '502s', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '140',
    parttype: 'FORENING', navn: 'Andelsboligforeningen Solsikken (fiktiv)', email: 'kontakt@example.dk', telefon: '20000017',
    materiel: [
      { kode: '660L-2KAMMER', opsat: '2022-04-01', standplads: 'Fælles miljøstation ved blok A' },
      { kode: '660L-2KAMMER', opsat: '2022-04-01', standplads: 'Fælles miljøstation ved blok B' },
      { kode: '660L-1KAMMER', opsat: '2022-04-01', standplads: 'Fælles miljøstation ved blok A' },
    ],
  },
  // Virksomheder (CVR er offentligt tilgængeligt; disse er opdigtede).
  {
    bfe: '3010018', adressetekst: 'Havnevej 14, 4000 Roskilde', lat: 55.6512, lng: 12.0847,
    matrikelnummer: '610t', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '320',
    parttype: 'VIRKSOMHED', navn: 'Fiktivt Bageri ApS (fiktiv)', cvr: '10000018', email: 'butik@example.dk', telefon: '20000018',
    materiel: [
      { kode: '660L-1KAMMER', opsat: '2023-02-01', standplads: 'Baggården ved læsserampen' },
      { kode: '240L-2KAMMER', opsat: '2023-02-01', standplads: 'Baggården ved læsserampen' },
    ],
  },
  {
    bfe: '3010019', adressetekst: 'Køgevej 80, 4000 Roskilde', lat: 55.6288, lng: 12.0871,
    matrikelnummer: '733u', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '320',
    parttype: 'VIRKSOMHED', navn: 'Demo Autoværksted A/S (fiktiv)', cvr: '10000019', email: 'kontor@example.dk', telefon: '20000019',
    materiel: [
      { kode: '660L-1KAMMER', opsat: '2024-03-01', standplads: 'Ved værkstedsporten' },
    ],
  },
  {
    bfe: '3010020', adressetekst: 'Frederiksborgvej 12, 4000 Roskilde', lat: 55.6478, lng: 12.0788,
    matrikelnummer: '281v', ejerlavskode: '20551', ejerlavsnavn: 'Roskilde Bygrunde', anvendelseskode: '320',
    parttype: 'VIRKSOMHED', navn: 'Prøve Kontorhus IVS (fiktiv)', cvr: '10000020', email: 'reception@example.dk', telefon: '20000020',
    materiel: [
      { kode: '240L-2KAMMER', opsat: '2023-05-01', standplads: 'Kælderskakt mod gården' },
    ],
  },
];

// --- Normalisering til de tre tabeller + materiel -----------------------------

export const parter: Part[] = [];
export const ejendomme: Ejendom[] = [];
export const ejendomParter: EjendomPart[] = [];
export const materiel: Materiel[] = [];

raekker.forEach((rad, i) => {
  const nr = String(i + 1).padStart(2, '0');
  const partId = `part-${nr}`;
  const ejendomId = `ejendom-${nr}`;

  parter.push({
    id: partId,
    parttype: rad.parttype,
    navn: rad.navn,
    cvr_nummer: rad.cvr ?? null,
    ekstern_id: null, // holdes tomt - ingen CPR
    email: rad.email,
    telefon: rad.telefon,
    oprettet: OPRETTET,
    oprettet_af: OPRETTET_AF,
  });

  ejendomme.push({
    id: ejendomId,
    bfe_nummer: rad.bfe,
    // Demo-UUID'er. adresse_uuid er nøglen; adressetekst er kun cachet visning.
    adresse_uuid: `demo-adr-${nr}`,
    adressetekst: rad.adressetekst,
    kommunekode: KOMMUNEKODE_ROSKILDE,
    matrikelnummer: rad.matrikelnummer,
    ejerlavskode: rad.ejerlavskode,
    ejerlavsnavn: rad.ejerlavsnavn,
    latitude: rad.lat,
    longitude: rad.lng,
    jordstykke_geojson: polygonOm(rad.lat, rad.lng),
    anvendelseskode: rad.anvendelseskode,
    husnummer_uuid: `demo-hus-${nr}`,
    oprettet: OPRETTET,
    oprettet_af: OPRETTET_AF,
  });

  // Én aktiv part pr. ejendom, både EJER og BETALER (samme part).
  ejendomParter.push({
    id: `ep-${nr}`,
    ejendom_id: ejendomId,
    part_id: partId,
    rolle: 'EJER',
    gyldig_fra: OPRETTET.slice(0, 10),
    gyldig_til: null,
  });
  ejendomParter.push({
    id: `ep-${nr}-betaler`,
    ejendom_id: ejendomId,
    part_id: partId,
    rolle: 'BETALER',
    gyldig_fra: OPRETTET.slice(0, 10),
    gyldig_til: null,
  });

  rad.materiel.forEach((spec, j) => {
    const mNr = String(j + 1).padStart(2, '0');
    // Spred standpladserne en anelse om adgangspunktet, så markørerne ikke overlapper.
    const offsetLat = (j - (rad.materiel.length - 1) / 2) * 0.00004;
    materiel.push({
      id: `mat-${nr}-${mNr}`,
      ejendom_id: ejendomId,
      materieltype_id: materieltypeId(spec.kode),
      chip_id: `CHIP-${nr}${mNr}`,
      standplads_beskrivelse: spec.standplads,
      standplads_lat: rad.lat + offsetLat,
      standplads_lng: rad.lng,
      gyldig_fra: spec.opsat,
      gyldig_til: spec.fjernet ?? null,
      oprettet_af_sag_id: null,
    });
  });
});
