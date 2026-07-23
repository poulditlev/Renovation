# Datamodel — kommunalt renovationssystem

Denne model dækker rygraden: hvem betaler for hvilken ejendom, hvilket materiel
står der, hvad koster det, og hvad opkræves der. Sagsbehandling og tømninger er
med som lag ovenpå.

---

## Gennemgående principper

Disse gælder for **alle** tabeller og bør besluttes én gang, ikke tabel for tabel.

**Nøgler.** Hver tabel har et teknisk surrogat-ID (UUID) som primærnøgle. Eksterne
nøgler som BFE-nummer og adresse-UUID gemmes som almindelige felter med unik
constraint — aldrig som primærnøgle. Så kan eksterne registre ændre sig uden at
rive din database med.

**Perioder.** Alt der kan ændre sig over tid har `gyldig_fra` og `gyldig_til`.
Konventionen er: `gyldig_fra` er **inklusiv**, `gyldig_til` er **eksklusiv**, og
`NULL` betyder "løber stadig". En beholder opsat 1. januar og fjernet 1. juli har
altså `gyldig_fra = 2026-01-01` og `gyldig_til = 2026-07-01`. Den regel skal stå
ét sted i koden og bruges overalt.

**Ingen sletning.** Rækker lukkes ved at sætte `gyldig_til`, ikke ved DELETE.
Historikken skal kunne genskabes — det er et lovkrav, ikke en præference.

**Registreringstid.** Ud over gyldighedsperioden gemmes `oprettet` og `oprettet_af`
på alle rækker. Det giver dig forskellen mellem *hvornår noget gjaldt* og *hvornår
vi vidste det*.

**Beløb.** Gem altid i **hele øre som heltal** (`bigint`), aldrig som decimaltal.
Flydende tal og penge hører ikke sammen.

**Klassifikationer.** Alle kodelister ligger som tabeller i databasen, ikke
hardkodet. De har selv `gyldig_fra`/`gyldig_til`, så en fraktion kan udgå uden at
ødelægge historiske rækker der peger på den.

---

## 1. Klassifikationstabeller

Disse fyldes med data ved opstart og ændres administrativt, ikke ved kodeændring.

### `fraktion`
De affaldstyper kommunen håndterer.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `kode` | text | Officiel kode, unik. Fx `MADAFFALD`, `RESTAFFALD`, `PAPIR`, `PAP`, `GLAS`, `METAL`, `PLAST`, `KARTON`, `FARLIGT`, `TEKSTIL` |
| `navn` | text | Visningsnavn |
| `beskrivelse` | text | Hvad må komme i |
| `gyldig_fra` / `gyldig_til` | date | |

### `materieltype`
Beholdertyper — kombinationen af størrelse og kammerinddeling.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `kode` | text | Fx `240L-2KAMMER` |
| `navn` | text | Fx "240 liter, to-delt" |
| `volumen_liter` | int | |
| `antal_kamre` | int | 1 eller 2 |
| `gyldig_fra` / `gyldig_til` | date | |

### `materieltype_fraktion`
Hvilke fraktioner en materieltype kan rumme. En to-delt beholder har to rækker.

| Felt | Type | Note |
|---|---|---|
| `materieltype_id` | uuid | FK |
| `fraktion_id` | uuid | FK |
| `kammer_nr` | int | 1 eller 2 |

### `ordningstype`
Den løsning en ejendom kan være tilmeldt.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `kode` | text | Fx `HUSSTAND`, `FAELLES_STANDPLADS`, `SOMMERHUS_SAESON` |
| `navn` | text | |
| `gyldig_fra` / `gyldig_til` | date | |

### `afvigelseskode`
Hvorfor en tømning ikke lykkedes. Chaufføren vælger fra denne liste.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `kode` | text | `IKKE_FREMSAT`, `FEJLSORTERET`, `ADGANG_SPAERRET`, `BEHOLDER_DEFEKT`, `OVERFYLDT` |
| `navn` | text | |
| `medfoerer_gebyr` | boolean | Nogle afvigelser udløser et gebyr |

### `sagstype`
Koblet til KLE-journalplanen.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `kode` | text | Fx `ANSOEG_EKSTRA_BEHOLDER` |
| `navn` | text | |
| `kle_nummer` | text | Journalplan-reference |
| `sagsbehandlingsfrist_dage` | int | |

---

## 2. Kerneentiteter

### `ejendom`
Systemets subjekt. Renovation følger matriklen, ikke personen.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `bfe_nummer` | text | Unik. Bestemt Fast Ejendom |
| `adresse_uuid` | text | Fra DAWA/Adressevælger. **Gem UUID, ikke adressetekst** |
| `adressetekst` | text | Cachet visningsværdi, kan blive forældet |
| `kommunekode` | text | |
| `matrikelnummer` | text | |
| `ejerlavskode` | text | |
| `latitude` / `longitude` | numeric | Adgangspunkt |
| `jordstykke_geojson` | jsonb | Grundens polygon, til kortvisning |
| `anvendelseskode` | text | Fra BBR — afgør hvilken ordning der gælder |
| `oprettet` / `oprettet_af` | timestamptz / text | |

### `part`
Den juridiske part der betaler. Kaldes bevidst `part`, ikke `person`, fordi det
lige så ofte er en boligforening eller et selskab.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `parttype` | text | `PERSON`, `VIRKSOMHED`, `FORENING` |
| `navn` | text | |
| `cvr_nummer` | text | Kun for virksomheder. Offentligt tilgængeligt |
| `ekstern_id` | text | Reserveret til CPR i en rigtig løsning — **hold feltet tomt i læringsprojektet** |
| `email` | text | |
| `telefon` | text | |
| `oprettet` / `oprettet_af` | | |

> **Bemærk.** Al persondata i projektet er syntetisk. Brug tydeligt opdigtede
> navne og `@example.dk`-adresser. Feltet `ekstern_id` findes kun for at vise
> hvor CPR *ville* ligge — isoleret i én tabel, ét sted at beskytte og logge.

### `ejendom_part`
Koblingen mellem ejendom og betaler — med periode, for ejere skifter.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `ejendom_id` | uuid | FK |
| `part_id` | uuid | FK |
| `rolle` | text | `EJER`, `ADMINISTRATOR`, `BETALER` |
| `gyldig_fra` / `gyldig_til` | date | |

Constraint værd at bygge: der må kun være **én** aktiv `BETALER` pr. ejendom ad
gangen. Perioderne må ikke overlappe.

### `ordning`
Hvilken ordning ejendommen er tilmeldt, over tid.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `ejendom_id` | uuid | FK |
| `ordningstype_id` | uuid | FK |
| `toemningsfrekvens` | text | `UGENTLIG`, `HVER_14_DAG`, `SAESON` |
| `gyldig_fra` / `gyldig_til` | date | |
| `hjemmel` | text | Reference til regulativet |

### `materiel`
De fysiske beholdere. Hver beholder er én række med sin egen levetid.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `ejendom_id` | uuid | FK |
| `materieltype_id` | uuid | FK |
| `chip_id` | text | Fra beholderens RFID-chip, hvis den har en |
| `standplads_beskrivelse` | text | "Ved carport, bag lågen" |
| `standplads_lat` / `standplads_lng` | numeric | Til kortvisning |
| `gyldig_fra` / `gyldig_til` | date | Opsat / fjernet |
| `oprettet_af_sag_id` | uuid | FK, nullable. Hvilken sag der udløste opsætningen |

---

## 3. Økonomi

### `takst`
Prisen for en materieltype i en given periode. Ændres politisk hvert år.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `materieltype_id` | uuid | FK |
| `ordningstype_id` | uuid | FK, nullable. Samme beholder kan koste forskelligt i forskellige ordninger |
| `beloeb_aarligt_oere` | bigint | I øre |
| `gyldig_fra` / `gyldig_til` | date | |
| `godkendt_dato` | date | Hvornår byrådet vedtog taksten |
| `hjemmel` | text | Reference til takstblad/regulativ |

### `opkraevning`
Regningen for én ejendom for én periode.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `ejendom_id` | uuid | FK |
| `part_id` | uuid | FK. Hvem regningen sendes til |
| `periode_fra` / `periode_til` | date | |
| `beloeb_total_oere` | bigint | Sum af linjerne |
| `status` | text | `KLADDE`, `GODKENDT`, `SENDT`, `BETALT`, `ANNULLERET` |
| `dannet_dato` | date | |

### `opkraevningslinje`
Én linje pr. beholder pr. periode. Det er her sporbarheden ligger.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `opkraevning_id` | uuid | FK |
| `materiel_id` | uuid | FK, nullable |
| `takst_id` | uuid | FK, nullable. **Hvilken takst der faktisk blev brugt** (null for engangslinjer) |
| `beskrivelse` | text | |
| `antal_dage` | int | nullable. Til forholdsmæssig beregning (null for engangslinjer) |
| `beloeb_oere` | bigint | |

> **Vigtigt beregningsprincip.** En beholder der stod fra 1. marts skal kun koste
> for de dage den stod. Linjen gemmer både `antal_dage` og `takst_id`, så
> beregningen altid kan efterprøves — også efter taksten er ændret.
> Periodiske linjer (materiel/løbende ydelser) beregnes forholdsmæssigt via
> takstberegningen; engangsleverancer i perioden tilføjes som linjer uden dage
> og takst (`antal_dage` og `takst_id` er da `null`).

---

## 3b. Ydelser — to grundlæggende forskellige slags

Der findes to slags ydelser, og de må **ikke** ligge i samme tabel eller samme
visning. Typen bestemmes af `ydelsestype.afregningsform`, og afregningsformen
afgør hvilke felter der overhovedet giver mening.

### `ydelsestype`
Kodeliste over ydelser. `afregningsform` er `PERIODISK` eller `ENGANG`.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `kode` | text | Unik |
| `navn` | text | |
| `afregningsform` | text | `PERIODISK` eller `ENGANG` — bestemmer hvilke felter der gælder |
| `materieltype_id` | uuid | FK, nullable. For periodiske beholderydelser: takstopslag |
| `fraktion_id` | uuid | FK, nullable |
| `standard_enhedspris_oere` | bigint | nullable. Standard styk-pris for engangsydelser. Kan være 0 (gebyrfri) |
| `hjemmel` | text | Reference til regulativet |
| `gyldig_fra` / `gyldig_til` | date | |

### `bindingsperiode`
Kodeliste over tilladte bindingsperioder for løbende ydelser. Ligger som data,
ikke i koden. Minimum er **6 måneder**; kortere kræver dispensation og skal
oprettes som en sag. Værdier: `6_MDR` (6), `12_MDR` (12), `24_MDR` (24) og
`SAESON` (sæson for haveaffald, ca. 8 mdr.).

| Felt | Type | Note |
|---|---|---|
| `kode` | text | PK |
| `navn` | text | |
| `maaneder` | int | ≥ 6 |

### `loebende_ydelse` (afregningsform `PERIODISK`)
En løbende ydelse med gyldighedsperiode og bindingsperiode. Indgår i den
løbende opkrævning via takstberegningen (samme felter som `materiel` læser).

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `ejendom_id` | uuid | FK |
| `ydelsestype_id` | uuid | FK, `afregningsform = PERIODISK` |
| `materieltype_id` | uuid | FK. Takstopslag |
| `bindingsperiode_kode` | text | FK til `bindingsperiode` |
| `gyldig_fra` / `gyldig_til` | date | `gyldig_til` **beregnes** af startdato + binding og sættes aldrig frit |
| `forrige_ydelse_id` | uuid | FK, nullable. Ved fornyelse peger den nye række på den gamle |
| `hjemmel` | text | |
| `oprettet` / `oprettet_af` | | |

> **Fornyelse.** En ydelse fornyes ved at oprette en **ny** række i forlængelse
> af den gamle. Den gamle røres aldrig — historikken bevares, så gamle
> opkrævninger fortsat kan efterprøves. Da `gyldig_til` er eksklusiv, starter
> den nye periode præcis på den gamles `gyldig_til`: hverken hul eller overlap.
> En ydelse der ikke fornyes, er udløbet og medregnes ikke efter `gyldig_til`.

### `engangsleverance` (afregningsform `ENGANG`)
En engangsleverance. **Ingen** periode, binding eller slutdato. Afregnes på
leveringsdatoen og indgår ikke i den periodiske beregning.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `ejendom_id` | uuid | FK |
| `ydelsestype_id` | uuid | FK, `afregningsform = ENGANG` |
| `leveringsdato` | date | |
| `antal` | int | |
| `enhedspris_oere` | bigint | Styk-pris i øre. Kan være 0 (gebyrfri) |
| `hjemmel` | text | |
| `oprettet` / `oprettet_af` | | |

### `varsling`
Registrerer at en part **er varslet** om en løbende ydelses udløb. Gemmes som
data (et sporbarhedskrav), ikke som en logfil.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `ydelse_id` | uuid | FK til `loebende_ydelse` |
| `ejendom_id` | uuid | FK |
| `part_id` | uuid | FK. Hvem der er varslet |
| `modtager_email` | text | E-mail fra parten (fiktiv i testmiljøet) |
| `udloebsdato` | date | Ydelsens `gyldig_til` |
| `tidspunkt` | timestamptz | Hvornår varslingen blev registreret |
| `kanal` | text | I testmiljøet altid `EMAIL_DEAKTIVERET` |

> **Afsendelse er slået fra med vilje.** Dette er et testmiljø med fiktive
> parter. Der sendes aldrig rigtige e-mails; en varsling er kun en dataregistrering.

---

## 4. Drift

### `toemning`
Den faktiske hændelse.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `materiel_id` | uuid | FK |
| `planlagt_dato` | date | |
| `udfoert_tidspunkt` | timestamptz | Nullable |
| `resultat` | text | `TOEMT`, `IKKE_TOEMT` |
| `afvigelseskode_id` | uuid | FK, nullable. Kun udfyldt ved `IKKE_TOEMT` |
| `bemaerkning` | text | |

---

## 5. Sagsbehandling

### `sag`

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `sagsnummer` | text | Unik, menneskeligt læsbar. Fx `REN-2026-00123` |
| `sagstype_id` | uuid | FK |
| `ejendom_id` | uuid | FK |
| `part_id` | uuid | FK. Hvem der er part i sagen |
| `status` | text | `MODTAGET`, `UNDER_BEHANDLING`, `PARTSHOERING`, `AFGJORT`, `LUKKET` |
| `modtaget_dato` | date | |
| `frist_dato` | date | Beregnet ud fra sagstypen |
| `ansvarlig_bruger` | text | |
| `lukket_dato` | date | |

### `afgoerelse`

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `sag_id` | uuid | FK |
| `resultat` | text | `IMOEDEKOMMET`, `DELVIST`, `AFSLAG` |
| `begrundelse` | text | |
| `hjemmel` | text | **Obligatorisk.** Uden hjemmel er afgørelsen ikke gyldig |
| `afgjort_dato` | date | |
| `afgjort_af` | text | |
| `klagefrist_dato` | date | |

### `journalnotat`

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `sag_id` | uuid | FK |
| `tekst` | text | |
| `oprettet` | timestamptz | |
| `oprettet_af` | text | |

Journalnotater må **aldrig** kunne redigeres eller slettes. Rettelser sker ved at
tilføje et nyt notat.

### `audit_log`
På tværs af det hele. Skrives automatisk, ikke af forretningskoden.

| Felt | Type | Note |
|---|---|---|
| `id` | uuid | PK |
| `tidspunkt` | timestamptz | |
| `bruger` | text | |
| `handling` | text | `LAES`, `OPRET`, `RET`, `LUK` |
| `tabel` | text | |
| `raekke_id` | uuid | |
| `foer` / `efter` | jsonb | Værdier før og efter ændringen |

---

## Relationsoverblik

```
part ──< ejendom_part >── ejendom ──< ordning
                              │
                              ├──< materiel ──< toemning
                              │        │
                              │        └── materieltype ──< materieltype_fraktion >── fraktion
                              │                  │
                              │                  └──< takst
                              │
                              ├──< opkraevning ──< opkraevningslinje ──> takst
                              │                              └────────> materiel
                              │
                              └──< sag ──< journalnotat
                                    └──── afgoerelse
```

---

## Byggerækkefølge

Byg ét lag ad gangen, med tests, før du går videre:

1. **Klassifikationer** — fraktion, materieltype, ordningstype, takst. Ren
   opsætning, ingen logik. Nemt at komme i gang med.
2. **Ejendom og part** — inklusiv adresseopslag mod DAWA og kortvisning.
3. **Ordning og materiel** — her møder du periodelogikken for første gang.
4. **Takstberegning** — den funktion der givet en ejendom og en periode returnerer
   det beløb der skal opkræves. Det er systemets *rene funktion*, præcis som
   `convert.js` var det i temperatur-appen, og den vigtigste at teste grundigt.
5. **Opkrævning** — dannelse og lagring af regningen.
6. **Sag, afgørelse, journal** — sagsbehandlingen ovenpå.
7. **Tømninger** — driftshistorik.

---

## Testtilfælde der bør skrives først

Disse afslører om periodelogikken holder:

- Én beholder hele året → fuld årstakst.
- Beholder opsat 1. juli → halv takst.
- Beholder fjernet 1. juli → halv takst.
- Beholder byttet til større størrelse midt i året → to linjer, hver forholdsmæssig.
- Takst ændret 1. januar → ny takst gælder kun fra den dato.
- Ejendom uden materiel → opkrævning på 0 kr., ikke en fejl.
- Ejerskifte midt i perioden → hvem får regningen? (Beslut reglen, og test den.)
- Skudår → 366 dage, ikke 365.
