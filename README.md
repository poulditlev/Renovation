# Renovation

> ## ⚠️ TESTMILJØ — læs dette først
>
> Dette er et **demonstrations- og læringssystem**, ikke et rigtigt kommunalt
> fagsystem, og det **må ikke anvendes til sagsbehandling**. Alle oplysninger om
> personer og parter er **fiktive** (tydeligt opdigtede navne og
> `@example.dk`-adresser, intet CPR). Adressedata er offentlige data fra DAWA.
> BFE-numre og DAWA-UUID'er i seed-dataet er illustrative demoværdier.

Kommunalt renovationssystem. Datamodellen er beskrevet i [`datamodel.md`](./datamodel.md)
og bygges op ét lag ad gangen, jf. modellens byggerækkefølge.

## Hvad er bygget indtil nu

**Lag 1 — Klassifikationer og takstberegning** (`src/klassifikationer/`, `src/beregning/`)

- Typer og seed-data for `fraktion`, `materieltype`, `materieltype_fraktion`,
  `ordningstype` og `takst`.
- `src/beregning/periode.ts` — den ene hjælpefunktion al periodelogik går
  igennem (`gyldig_fra` inklusiv, `gyldig_til` eksklusiv, `null` = "løber stadig").
- `src/beregning/takstberegning.ts` — den rene funktion der ud fra en ejendoms
  materiel og en opkrævningsperiode beregner opkrævningslinjer og totalbeløb,
  forholdsmæssigt efter antal dage.

**Lag 2 — Ejendom, part og brugerflade** (`src/domain/`, `src/data/`, `src/adresse/`, `src/server/`, `public/`)

- Typer og in-memory-lagring for `ejendom`, `part` og `ejendom_part`. Feltet
  `ekstern_id` (CPR) holdes bevidst tomt.
- Seed-data: 20 fiktive parter (personer, en boligforening og et par
  virksomheder) koblet til adresser i Roskilde Kommune, hver med materiel.
- `src/adresse/dawa.ts` — ét isoleret, tyndt lag med al kommunikation mod DAWA
  (adresse-autocomplete og jordstykke-opslag). Returnerer rene objekter, ikke
  DAWA's rå svar. **DAWA lukker 17. august 2026** og skal senere erstattes;
  laget er derfor holdt let at udskifte.
- En simpel sagsbehandlerflade: adressesøgning med autocomplete, ejendommens
  stamdata, tilknyttet part og et Leaflet-kort med en markør for den udsøgte
  adresse (adgangspunktet), grundens polygon og beholdernes standpladser.

**Lag 3 — Ydelser, engangsleverancer og fornyelse** (`src/ydelser/`, `src/data/ydelser*`, `public/`)

- To grundlæggende forskellige slags ydelser, holdt adskilt i data og visning:
  - **Løbende ydelse** (`PERIODISK`): gyldighedsperiode + bindingsperiode
    (6/12/24 mdr. eller sæson, kodeliste i data; minimum 6 mdr., kortere afvises).
    Slutdatoen beregnes af startdato + binding og indgår i den løbende opkrævning.
  - **Engangsleverance** (`ENGANG`): leveringsdato + antal + styk-pris (kan være
    0). Ingen periode; afregnes på leveringsdatoen.
- Rene funktioner (uden database/UI) i `src/ydelser/fornyelse.ts`: udløbs-/
  varslingsvindue, statusberegning og **fornyelse** der opretter en ny periode i
  forlængelse af den gamle — uden hul og uden overlap, og uden at ændre den gamle
  række (historikken bevares).
- Brugerfladen: frossen topzone (banner, søgning, kontekstlinje), sammenfoldelige
  paneler for stamdata og part, to adskilte tabeller (løbende ydelser og
  engangsleverancer) med status i både farve og tekst, "Forny"-knap for ydelser
  der udløber snart, og en tilføj-dialog (`<dialog>`) med typevalg, beregnet
  slutdato og beregnet beløb.

### Varsling er slået fra med vilje

Dette er et **testmiljø med fiktive parter, og der sendes ALDRIG rigtige
e-mails.** Når en løbende ydelse nærmer sig udløb, kan parten "varsles" — men
varslingen bliver **kun registreret som data** (modtager, ydelse, udløbsdato,
tidspunkt) og vist i brugerfladen. Afsendelse er bevidst deaktiveret; se
`src/ydelser/varsling.ts`, hvor kanalen er markeret `EMAIL_DEAKTIVERET`.

**Lag 4 — Opkrævning og sagsbehandling** (`src/opkraevning/`, `src/sag/`, `src/data/opkraevningStore.ts`, `src/data/sagStore.ts`, `public/`)

- **Opkrævning** (`src/opkraevning/opkraevning.ts`): den rene `dannOpkraevning`
  danner en regning (`opkraevning` + `opkraevningslinje`) for en ejendom og
  periode. Den **genbruger den eksisterende takstberegning** til de periodiske
  linjer (løbende ydelser) og tilføjer engangsleverancer leveret i perioden —
  intet nyt beregningsprincip. Hver linje gemmer `antal_dage` og `takst_id`, så
  regningen kan efterprøves. Status følger KLADDE → GODKENDT → SENDT → BETALT.
- **Sagsbehandling** (`src/sag/`): `sagstype` (KLE-kodeliste med
  sagsbehandlingsfrist), `sag`, `afgoerelse` og `journalnotat`. Rene funktioner:
  `opretSag` (frist beregnet af sagstypen), `traefAfgoerelse`
  (**hjemmel er obligatorisk** — uden hjemmel afvises afgørelsen) og
  statusforløb MODTAGET → UNDER_BEHANDLING → PARTSHØRING → AFGJORT → LUKKET.
  Journalnotater er **append-only** (rettelser sker ved nyt notat).
- Brugerfladen: et Opkrævning-panel (dan/godkend/send/betal, linjer, total) og
  et Sagsbehandling-panel (sagsliste + sagsdetalje med statusforløb, afgørelse og
  journal), begge med dialoger til oprettelse.

### Fiktiv kommune: Korsbæk

Systemet er "brandet" som **Korsbæk Kommune** (opdigtet) med et fiktivt
våbenskjold øverst til højre. Adresserne bag er reelle Roskilde-demoadresser, så
DAWA-adresseopslaget fortsat virker. Både kommune og parter er tydeligt mærket
som fiktive.

**Lag 5 — Adgangsmodel: to brugertyper** (`src/adgang/`, `src/server/`, `public/`)

- To brugertyper: **SAGSBEHANDLER** (må alt, som hidtil) og **BORGER** (må kun se
  sine egne ejendomme og rette kontaktoplysninger på sin egen part). Reglerne er
  beskrevet i [`datamodel.md`](./datamodel.md) afsnit 6.
- Adgangsreglerne er **ren logik** i `src/adgang/adgang.ts` uden kendskab til
  HTTP, UI eller database: `maaSeEjendom`, `maaUdfoere` (med navngivne handlinger)
  og `maaRetteKontakt`, med rettighederne som data pr. rolle.
- **Håndhævelsen sker på serveren.** Hver API-forespørgsel skal have en gyldig
  identitet, og hver rute (GET som POST) tjekkes. `GET /api/ejendomme` filtreres
  til borgerens egne ejendomme **på serveren**, og forbudte handlinger afvises med
  **HTTP 403** og en dansk fejlbesked. At skjule knapper i brugerfladen er kun
  brugervenlighed — serveren afviser uanset hvad frontend sender.
- **Sporbarhed.** Audit-log gemmer både *hvem* og *i hvilken rolle* (borger vs.
  sagsbehandler), og hver `sag` får en `kanal` (`SELVBETJENING`/`SAGSBEHANDLER`),
  så man kan måle hvor stor en andel der klares uden en sagsbehandler.

> **Ingen rigtig autentifikation i testmiljøet.** Identiteten sendes med hver
> forespørgsel i headeren `X-Bruger`, og en **rolleskifter i det gule testbanner**
> ("Logget ind som: …") styrer hvilken der sendes — man kan skifte mellem
> sagsbehandleren og de fiktive borgere og se fladen ændre sig. Dette **erstatter
> rigtig login**; i drift ville det være MitID/NemLog-in. Rolleskifteren er
> tastaturbetjenbar og tydeligt mærket som fake-auth.

**Lag 6 — Borgerens selvbetjeningsflade (læseflade)** (`src/server/` GET `/api/mine`, `public/`)

Systemet har nu **to visninger af samme domæne**, styret af rolleskifteren:

- **Sagsbehandlerfladen** (rolle SAGSBEHANDLER): den fulde flade, uændret —
  søgning, stamdata, ydelser, opkrævning, sagsbehandling, kort.
- **Borgerfladen** (rolle BORGER): en enklere **læseflade** i borgervenligt
  myndighedssprog, hvor borgeren ser sine egne oplysninger:
  - **Mine ejendomme** — kun ejendomme hvor borgeren er part (har man kun én,
    vises den direkte).
  - **Mine ydelser** — faste ordninger (med hvornår de udløber) og enkelt­leverancer,
    uden teknik (ingen hjemmel, takst-id, bindingsdetaljer eller opkrævningslinjer).
  - **Mine regninger** — beløb og periode, med status i borgersprog.
  - **Mine sager** — egne sager med status i klar tale og hvordan de er oprettet
    (selvbetjening vs. kommunen).
  - **Mine kontaktoplysninger** — genbruger den eksisterende redigering af e-mail
    og telefon; navn og parttype vises skrivebeskyttet.

Borgerfladen er en **tynd frontend** oven på de eksisterende API'er plus én ny
GET-rute, `/api/mine`, der bygger og **filtrerer borgerens overblik på serveren**.
Domænelaget er uændret; borgeren får aldrig andres data sendt over ledningen.

**Lag 7 — Selvbetjeningsansøgning: sløjfen lukkes** (`src/sag/ansoegning.ts`, `src/data/sagStore.ts`, `src/server/`, `public/`)

Borgeren kan nu **ansøge** om ydelser via selvbetjening — og sløjfen lukkes:
borgeren ansøger, systemet opretter en sag, sagsbehandleren afgør den og kan
effektuere den.

- **En ansøgning opretter en SAG, ikke en ydelse.** Borgeren kan ansøge om
  ekstra beholder, anden beholderstørrelse, ekstra sæt sække til farligt affald
  eller afmelding af en løbende ydelse. Ansøgningen bliver til en sag med status
  `MODTAGET` og kanal `SELVBETJENING`; hvad der blev ansøgt om (art, størrelse,
  ønsket dato) gemmes på sagen. Der oprettes **aldrig** en ydelse direkte.
- **Håndhævet på serveren.** Ansøgnings-endpointet (`POST /api/ejendomme/:id/ansoegninger`)
  kræver borgerrettigheden `ANSOEG_SELVBETJENING` og adgang til **egen** ejendom;
  det afviser alt andet end at oprette en sag. En borger må fortsat **aldrig**
  oprette ydelser, forny eller danne opkrævninger — det giver 403.
- **Sagsbehandlerens side.** Selvbetjeningssager er tydeligt markeret i sagslisten
  (kanal + hvad der er ansøgt om). Når sagsbehandleren træffer en imødekommende
  afgørelse (hjemmel obligatorisk, som hidtil), kan ansøgningen **effektueres** —
  en eksplicit handling der opretter den ansøgte ydelse ved at **genbruge** den
  almindelige ydelses-oprettelse (ingen parallel vej), med korrekt periode.
- **Borgerens overblik.** Efter ansøgningen ser borgeren sagen under "Mine sager"
  med status i klar tale (Modtaget → Under behandling → Afgjort). Borgeren kan
  følge sagen, men endnu ikke ændre eller trække den tilbage.
- **Sporbarhed.** Hele forløbet — ansøgning (med hvem og i hvilken rolle),
  afgørelse og effektuering — står i sagens append-only journal.

Domænelaget er uændret; ansøgningsindholdet ligger som data på sagen
([`datamodel.md`](./datamodel.md) afsnit 5), og adgangsreglerne er de samme som
i afsnit 6, blot udvidet med to navngivne handlinger.

**Lag 8 — Prioriteret sagsoverblik "Mine sager"** (`src/sagsoverblik/`, `src/server/`, `public/`)

En **beregnet** visning for sagsbehandleren oven på de eksisterende sager,
ydelser og opkrævninger. Den skaber ingen nye data: **hastegrad** og **kategori**
udledes af rene funktioner og sættes aldrig manuelt.

- **Hastegrad** (KRITISK / HOEJ / NORMAL / AFVENTER) beregnes ud fra sagsfrister,
  ydelsers udløb uden fornyelse og opkrævningers betalingsstatus. Grænseværdierne
  (3/7/1/5 dage m.m.) ligger som navngivne konstanter ét sted.
- **Kategori** (SELVBETJENING, KLAGE, UDLOEB_YDELSE, BETALING, FRIST, ØVRIGT)
  udledes efter en fast, dokumenteret prioritetsrækkefølge.
- **Systemsager** — ydelser der ophører uden fornyelse og forfaldne opkrævninger —
  udledes som **lette afledte poster** (ikke rigtige sager); se
  [`datamodel.md`](./datamodel.md) afsnit 7.
- **API:** `GET /api/sagsoverblik?omfang=mine|alle&hastegrad=&kategori=` er
  **kun for sagsbehandlere** (en borger afvises med 403). Al beregning,
  filtrering og sortering sker på serveren; svaret er allerede sorteret
  (kritisk først, derefter frist) og indeholder totaler pr. hastegrad.
- **Brugerflade:** en "Mine sager"-fane med fire klikbare nøgletalskort (filter
  på hastegrad), kategori-chips, og en tabel sorteret efter hastegrad. Kritiske
  rækker fremhæves, hastegrad vises med **både farve og tekst**, og et klik på en
  række åbner sagen i den eksisterende sagsvisning. Skift mellem "Mine" og
  "Hele afdelingen" — sidstnævnte har en **rød notifikationsboble** med antallet
  af **ubehandlede** sager (status `MODTAGET`) for hele afdelingen (serveren
  beregner `afdeling_ubehandlede`; tallet læses op via knappens `aria-label`, så
  boblen ikke kun signalerer med farve).
  Fristerne vises i klar tale ("Overskredet 2 dage", "Udløber i morgen",
  "Frist om 4 dage"). WCAG 2.1 AA: knapper med `aria-pressed`,
  `<th scope="col">`, tastaturnavigation, aldrig farve alene.

## Kør appen lokalt

```bash
npm install
npm start
```

Åbn derefter <http://localhost:3000> i en browser.

**Navigation:** al ejendomsvalg sker i søgefeltet øverst. Feltet er en combobox,
der åbner allerede når det får fokus, og viser resultater i to grupper i samme
liste: **Ejendomme i registret** (de fordefinerede demoejendomme, med partnavn og
antal ydelser) og **Adresser fra DAWA** (adresseforslag, som vises når der er
skrevet mindst to tegn). Indtastning filtrerer registret på adresse og partnavn
og henter samtidig DAWA-forslag. Vælg med mus eller piletaster + Enter.

Ejendommens **stamdata** og **tilknyttede part** ligger i en skuffe, der åbnes
med knappen "Vis stamdata" yderst til højre i kontekstlinjen. Skuffen lægger sig
som et overlay under den fastlåste topzone og skubber ikke tabellerne ned, så man
beholder sin plads. Under kontekstlinjen vises ydelser, opkrævning, sager og kort.

- Sæt en anden port med `PORT=4000 npm start`.
- `npm run dev` starter serveren med automatisk genstart ved ændringer.
- **Netadgang:** adressesøgning og live jordstykke-opslag kræver adgang til
  `api.dataforsyningen.dk` (DAWA), og kortet henter Leaflet + OpenStreetMap fra
  internettet. Seed-ejendommene virker uden netadgang (de har cachede
  polygoner); mangler netadgang, vises en pæn fejl i stedet.

## Hosting (fx Render)

Serveren læser porten fra `PORT` og lytter på alle interfaces, så den kan
hostes uden ændringer. Standardopsætning:

- **Build command:** `npm install`
- **Start command:** `npm start`

`tsx` (som kører TypeScript direkte) ligger bevidst i `dependencies`, ikke
`devDependencies`, så serveren også kan starte når hosten sætter
`NODE_ENV=production` og springer devDependencies over. Slå auto-deploy til på
`main`, så nye merges deployes automatisk.

## Kør testene

```bash
npm install
npm test
```

`npm run typecheck` kører kun TypeScript-typetjek uden at bygge.

Testene ligger ved siden af den kode de tester (`*.test.ts`) og dækker bl.a.:

- Takstberegningens kerneeksempler: fuld årstakst, opsætning/fjernelse midt i
  året, beholderskift, takstskift ved årsskifte, ejendom uden materiel, skudår
  og afrunding.
- Parsning af DAWA-svar ud fra gemte eksempelsvar i `src/adresse/fixtures/`.
  Disse tests kalder **aldrig** ud på nettet.
- Sammenhæng i seed-dataet og opbygning af ejendommens visning.

## Tilgængelighed

Brugerfladen er bygget efter WCAG 2.1 AA: semantisk HTML, tastaturnavigation
(inkl. piletast-styret autocomplete), synligt fokus, labels på alle felter,
fejlbeskeder knyttet til feltet og tilstrækkelig kontrast i grå/blå-paletten.

## Teknologi

Node.js (20+) og TypeScript. [Vitest](https://vitest.dev) som testrunner,
[tsx](https://tsx.is) til at køre serveren direkte fra TypeScript. Kortet
bruger [Leaflet](https://leafletjs.com) fra CDN med OpenStreetMap som
baggrundskort (ingen API-nøgle). Ingen database endnu — al data holdes i
hukommelsen, men følger datamodellens feltnavne, så den senere kan lægges
direkte i PostgreSQL.
