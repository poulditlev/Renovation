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
  stamdata, tilknyttet part og et Leaflet-kort med grundens polygon og
  beholdernes standpladser.

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

## Kør appen lokalt

```bash
npm install
npm start
```

Åbn derefter <http://localhost:3000> i en browser. Vælg en ejendom i
venstremenuen for at se stamdata, part, materiel og kort, eller søg en adresse
i søgefeltet øverst.

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
