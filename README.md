# Renovation

Kommunalt renovationssystem. Datamodellen er beskrevet i [`datamodel.md`](./datamodel.md)
og bygges op ét lag ad gangen, jf. modellens byggerækkefølge.

## Status

Dette er første byggelag: **klassifikationer og takstberegning**. Der er endnu
ingen database, API eller UI - data ligger i almindelige TypeScript-objekter i
hukommelsen, men følger datamodellens feltnavne og struktur, så det senere kan
lægges direkte i PostgreSQL.

- `src/klassifikationer/` - typer og seed-data for `fraktion`, `materieltype`,
  `materieltype_fraktion`, `ordningstype` og `takst`.
- `src/beregning/periode.ts` - den ene hjælpefunktion al periodelogik i
  systemet går igennem (`gyldig_fra` inklusiv, `gyldig_til` eksklusiv, `null`
  betyder "løber stadig").
- `src/beregning/takstberegning.ts` - den rene funktion der ud fra en
  ejendoms materiel og en opkrævningsperiode beregner opkrævningslinjer og
  totalbeløb, forholdsmæssigt efter antal dage.

## Kør testene

```bash
npm install
npm test
```

`npm run typecheck` kører kun TypeScript-typetjek uden at bygge.

Testene ligger ved siden af den kode de tester (`*.test.ts`) og dækker bl.a.
periodekonventionen og de kerneeksempler datamodellen fremhæver: fuld
årstakst, opsætning/fjernelse midt i året, beholderskift, takstskift ved
årsskifte, ejendom uden materiel og skudår.

## Teknologi

Node.js (20+) og TypeScript. [Vitest](https://vitest.dev) som testrunner.
