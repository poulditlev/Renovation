// Sagsbehandlerfladens klientlogik. Ren browser-JS uden framework.
// Henter data fra det lokale API og tegner ejendommens stamdata, part,
// materiel og et Leaflet-kort. Al DAWA-kommunikation sker på serveren.

"use strict";

const el = (id) => document.getElementById(id);

// Aktuel valgt register-ejendom (null for live-adresser uden for registret).
let valgtEjendomId = null;
// Parterne på den valgte ejendom (til visning + redigering af kontaktoplysninger).
let aktuelleParter = [];
// Feltklassifikationen (selvbetjening vs. registerdata) hentet fra serveren.
let partfelter = { felter: [], register_forklaring: "" };
// Kodelister til tilføj-dialogen (ydelsestyper, bindingsperioder, takster).
let katalog = { ydelsestyper: [], bindingsperioder: [], takster: [] };

// --- Rolle / fake-auth (styrer X-Bruger-headeren) ----------------------------
// VIGTIGT: dette er kun testmiljøets rolleskifter. Den rigtige adgangskontrol
// håndhæves på SERVEREN - at skjule knapper her er alene brugervenlighed.
let aktuelBruger = { rolle: "SAGSBEHANDLER", part_id: null, navn: "Sagsbehandler ABC" };
function erSagsbehandler() {
  return aktuelBruger.rolle === "SAGSBEHANDLER";
}
function brugerHeader() {
  return aktuelBruger.rolle === "SAGSBEHANDLER" ? "SAGSBEHANDLER" : `BORGER:${aktuelBruger.part_id}`;
}

const kroneFormat = new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" });
/** Formaterer hele øre som kronebeløb, fx 202000 -> "2.020,00 kr." */
function formatOere(oere) {
  if (oere == null) return "—";
  return kroneFormat.format(oere / 100);
}

// --- Leaflet-kort (genbruges mellem opslag) ---------------------------------
let kort = null;
let kortLag = null;

function nulstilKort() {
  if (kort) {
    kort.remove();
    kort = null;
    kortLag = null;
  }
}

function tegnKort(ejendom, materiel) {
  const kortEl = el("kort");
  // Degradér pænt, hvis Leaflet ikke kunne indlæses (fx uden netadgang til CDN).
  if (typeof L === "undefined") {
    nulstilKort();
    kortEl.innerHTML =
      '<p class="tomtilstand" style="padding:1rem">Kortet kunne ikke indlæses (Leaflet er ikke tilgængelig). ' +
      "De geografiske oplysninger findes også i stamdata.</p>";
    return;
  }
  kortEl.innerHTML = "";
  nulstilKort();
  kort = L.map("kort", { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap-bidragydere",
  }).addTo(kort);
  kortLag = L.featureGroup().addTo(kort);

  let harGeometri = false;

  // Grundens polygon fra jordstykke-opslaget.
  if (ejendom.jordstykke_geojson) {
    const feature = { type: "Feature", geometry: ejendom.jordstykke_geojson, properties: {} };
    const polygon = L.geoJSON(feature, {
      style: { color: "#14395e", weight: 2, fillColor: "#1f4f7a", fillOpacity: 0.15 },
    });
    polygon.addTo(kortLag);
    harGeometri = true;
  }

  // Markører for beholderstandpladser.
  for (const m of materiel) {
    if (typeof m.standplads_lat === "number" && typeof m.standplads_lng === "number") {
      const markoer = L.marker([m.standplads_lat, m.standplads_lng]);
      markoer.bindPopup(
        `<strong>${escapeHtml(m.materieltype_navn)}</strong><br>${escapeHtml(m.standplads_beskrivelse || "")}`
      );
      markoer.addTo(kortLag);
      harGeometri = true;
    }
  }

  if (harGeometri) {
    kort.fitBounds(kortLag.getBounds().pad(0.3));
  } else if (typeof ejendom.latitude === "number" && typeof ejendom.longitude === "number") {
    kort.setView([ejendom.latitude, ejendom.longitude], 17);
  } else {
    // Fald tilbage til Roskilde centrum, hvis vi hverken har polygon eller punkt.
    kort.setView([55.6415, 12.0803], 13);
  }
}

// --- Hjælpere ----------------------------------------------------------------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// Fjerner et evt. "(fiktiv)"-suffiks fra navnet; UI'en viser i stedet et badge.
function rentNavn(navn) {
  return String(navn ?? "").replace(/\s*\(fiktiv\)\s*$/i, "").trim();
}

function parttypeTekst(t) {
  return { PERSON: "Person", VIRKSOMHED: "Virksomhed", FORENING: "Forening" }[t] || t;
}

// --- Rendering af ejendom ----------------------------------------------------
function visEjendom(data, kilde) {
  const e = data.ejendom;

  el("tomtilstand").hidden = true;
  el("ejendomskort").hidden = false;

  valgtEjendomId = kilde === "live" ? null : e.id;

  // Kontekstlinjen viser adresse (h1) + BFE, kommune og part - altid synlig i topzonen.
  el("kontekst-tom").hidden = true;
  el("kontekst-valgt").hidden = false;
  el("valgt-adresse").textContent = e.adressetekst || "(uden adressetekst)";

  const kommuneKort = e.kommunenavn ? `${e.kommunekode} ${e.kommunenavn}` : e.kommunekode || "—";
  const foerstedel = (data.parter || [])[0];
  const partNavn = foerstedel ? rentNavn(foerstedel.navn) : null;
  const metaEl = el("valgt-meta");
  metaEl.innerHTML =
    `BFE ${escapeHtml(e.bfe_nummer)} · Kommune ${escapeHtml(kommuneKort)}` +
    (partNavn
      ? ` · Part: ${escapeHtml(partNavn)} <span class="fiktiv-badge">fiktiv</span>`
      : " · Ingen part i registret");

  // Skuffen med stamdata + part er altid lukket ved et nyt opslag.
  lukSkuffe();

  // Stamdata: kun tekniske felter. Adressen gentages ikke (den står i kontekstlinjen).
  const kommune =
    e.kommunenavn ? `${e.kommunekode} ${e.kommunenavn}` : e.kommunekode || "—";
  const stamdata = el("stamdata");
  stamdata.innerHTML = "";
  const felter = [
    ["Adresse-UUID", e.adresse_uuid],
    ["BFE-nummer", e.bfe_nummer],
    ["Kommune", kommune],
    ["Matrikelnummer", e.matrikelnummer || "—"],
    ["Ejerlav", e.ejerlavsnavn ? `${e.ejerlavsnavn} (${e.ejerlavskode})` : e.ejerlavskode || "—"],
    ["Anvendelseskode", e.anvendelseskode || "—"],
    ["Adgangspunkt", e.latitude != null && e.longitude != null ? `${e.latitude}, ${e.longitude}` : "—"],
  ];
  for (const [navn, vaerdi] of felter) {
    const dt = document.createElement("dt");
    dt.textContent = navn;
    const dd = document.createElement("dd");
    dd.textContent = vaerdi ?? "—";
    stamdata.append(dt, dd);
  }

  // Parter (i skuffens part-kolonne). Kontaktoplysninger kan rettes.
  aktuelleParter = data.parter || [];
  renderParter();

  // Ydelser, opkrævning og sager hentes kun for register-ejendomme; en
  // live-fundet adresse er ikke oprettet i registret.
  if (valgtEjendomId) {
    indlaesYdelser(valgtEjendomId);
    indlaesOpkraevning(valgtEjendomId);
    indlaesSager(valgtEjendomId);
  } else {
    ryddYdelser();
    ryddOpkraevning();
    ryddSager();
  }

  const materiel = data.materiel || [];
  try {
    tegnKort(e, materiel);
  } catch (fejl) {
    el("kort").innerHTML =
      '<p class="tomtilstand" style="padding:1rem">Kortet kunne ikke vises.</p>';
  }
  // Flyt fokus til indholdet, så tastaturbrugere lander det rigtige sted.
  el("indhold").focus();
  // Leaflet skal genberegne størrelsen, når containeren netop er blevet synlig.
  setTimeout(() => kort && kort.invalidateSize(), 0);
}

async function hentJson(url) {
  const svar = await fetch(url, { headers: { "X-Bruger": brugerHeader() } });
  const data = await svar.json().catch(() => ({}));
  if (!svar.ok) {
    const err = new Error(data.fejl || `Serverfejl (${svar.status}).`);
    err.detalje = data.detalje;
    throw err;
  }
  return data;
}

async function aabnEjendom(id) {
  try {
    const data = await hentJson(`/api/ejendomme/${encodeURIComponent(id)}`);
    visEjendom(data, "register");
  } catch (e) {
    visSoegefejl(e.message);
  }
}

// --- Søgefelt som combobox: to grupper (registret + DAWA) i samme listboks ----
const soegefelt = el("soegefelt");
const forslagsliste = el("forslagsliste");
const soegefejl = el("soegefejl");

let registerEjendomme = []; // forregistrerede ejendomme (gruppe 1)
let dawaForslag = []; // seneste DAWA-forslag (gruppe 2)
let dawaSoeger = false;
let komboOptions = []; // flad liste over valgbare rækker (uden gruppeoverskrifter)
let aktivtIndeks = -1;
let debounceId = null;

function visSoegefejl(besked) {
  if (!besked) {
    soegefejl.hidden = true;
    soegefejl.textContent = "";
    return;
  }
  soegefejl.hidden = false;
  soegefejl.textContent = besked;
}

async function indlaesRegisterEjendomme() {
  try {
    const data = await hentJson("/api/ejendomme");
    registerEjendomme = data.ejendomme || [];
  } catch {
    registerEjendomme = [];
  }
}

// Filtrerer gruppe 1 på adresse OG partnavn.
function filtrerEjendomme(q) {
  const n = q.toLowerCase().trim();
  if (!n) return registerEjendomme;
  return registerEjendomme.filter(
    (e) =>
      (e.adressetekst || "").toLowerCase().includes(n) ||
      (e.part_navn || "").toLowerCase().includes(n)
  );
}

function lukKombo() {
  forslagsliste.hidden = true;
  forslagsliste.innerHTML = "";
  soegefelt.setAttribute("aria-expanded", "false");
  soegefelt.removeAttribute("aria-activedescendant");
  komboOptions = [];
  aktivtIndeks = -1;
}

function tilfoejGruppehoved(tekst) {
  const li = document.createElement("li");
  li.className = "forslag__gruppe";
  li.setAttribute("role", "presentation");
  li.textContent = tekst;
  forslagsliste.append(li);
}

function tilfoejTomGruppe(tekst) {
  const li = document.createElement("li");
  li.className = "forslag__tom-gruppe";
  li.setAttribute("role", "presentation");
  li.textContent = tekst;
  forslagsliste.append(li);
}

function tilfoejOption(item) {
  const i = komboOptions.length;
  komboOptions.push(item);
  const li = document.createElement("li");
  li.id = `kombo-opt-${i}`;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", String(i === aktivtIndeks));
  if (item.type === "ejendom") {
    const e = item.data;
    li.innerHTML =
      `<span class="forslag__adresse">${escapeHtml(e.adressetekst)}</span>` +
      `<span class="forslag__under">${escapeHtml(rentNavn(e.part_navn || "—"))} · BFE ${escapeHtml(e.bfe_nummer)} · ` +
      `${e.antal_loebende} løbende / ${e.antal_engangs} engangs</span>`;
  } else {
    const f = item.data;
    li.innerHTML =
      `<span class="forslag__adresse">${escapeHtml(f.adressetekst)}</span>` +
      (f.kendt_ejendom_id ? '<span class="forslag__kendt">i registret</span>' : "");
  }
  li.addEventListener("mousedown", (ev) => {
    ev.preventDefault(); // bevar fokus i inputfeltet
    vaelgKombo(i);
  });
  forslagsliste.append(li);
}

function renderKombo() {
  const q = soegefelt.value.trim();
  const ejendomme = filtrerEjendomme(q);
  const dawaListe = q.length >= 2 ? dawaForslag : [];
  komboOptions = [];
  forslagsliste.innerHTML = "";

  // Gruppe 1: registret (altid synlig, også uden indtastning).
  tilfoejGruppehoved("Ejendomme i registret");
  if (ejendomme.length === 0) {
    tilfoejTomGruppe(q ? "Ingen registrerede ejendomme matcher." : "Ingen registrerede ejendomme.");
  } else {
    for (const e of ejendomme) tilfoejOption({ type: "ejendom", data: e });
  }

  // Gruppe 2: DAWA (kun ved mindst 2 tegn).
  if (q.length >= 2) {
    tilfoejGruppehoved("Adresser fra DAWA");
    if (dawaListe.length === 0) {
      tilfoejTomGruppe(dawaSoeger ? "Søger…" : "Ingen adresser fundet.");
    } else {
      for (const f of dawaListe) tilfoejOption({ type: "dawa", data: f });
    }
  }

  forslagsliste.hidden = false;
  soegefelt.setAttribute("aria-expanded", "true");
  if (aktivtIndeks >= 0 && aktivtIndeks < komboOptions.length) {
    soegefelt.setAttribute("aria-activedescendant", `kombo-opt-${aktivtIndeks}`);
    el(`kombo-opt-${aktivtIndeks}`)?.scrollIntoView({ block: "nearest" });
  } else {
    soegefelt.removeAttribute("aria-activedescendant");
  }
}

async function hentDawa(q) {
  if (q.trim().length < 2) {
    dawaForslag = [];
    renderKombo();
    return;
  }
  try {
    visSoegefejl("");
    dawaSoeger = true;
    renderKombo();
    const data = await hentJson(`/api/adresse/soeg?q=${encodeURIComponent(q)}`);
    // Kun anvend resultatet hvis søgeteksten stadig er den samme.
    if (soegefelt.value.trim() === q) dawaForslag = data.forslag || [];
  } catch (e) {
    dawaForslag = [];
    visSoegefejl(e.detalje ? `${e.message} (${e.detalje})` : e.message);
  } finally {
    dawaSoeger = false;
    renderKombo();
  }
}

async function vaelgKombo(i) {
  const item = komboOptions[i];
  if (!item) return;
  visSoegefejl(""); // ryd evt. tidligere DAWA-fejl når der vælges
  if (item.type === "ejendom") {
    // Præcis samme handling som et klik i den tidligere sidemenu.
    soegefelt.value = item.data.adressetekst;
    lukKombo();
    aabnEjendom(item.data.id);
    return;
  }
  const valgt = item.data;
  soegefelt.value = valgt.adressetekst;
  lukKombo();
  try {
    if (valgt.kendt_ejendom_id) {
      const data = await hentJson(`/api/ejendomme/${encodeURIComponent(valgt.kendt_ejendom_id)}`);
      visEjendom(data, "register");
    } else {
      const p = new URLSearchParams({
        tekst: valgt.adressetekst,
        adresse_uuid: valgt.adresse_uuid || "",
        husnummer_uuid: valgt.husnummer_uuid || "",
        kommune_navn: valgt.kommune_navn || "",
        lat: valgt.latitude != null ? String(valgt.latitude) : "",
        lng: valgt.longitude != null ? String(valgt.longitude) : "",
      });
      const data = await hentJson(`/api/adresse/opslag?${p.toString()}`);
      visEjendom(data, data.kilde || "live");
    }
  } catch (e) {
    visSoegefejl(e.detalje ? `${e.message} (${e.detalje})` : e.message);
  }
}

// Listen åbner allerede når feltet får fokus - med alle registrerede ejendomme.
soegefelt.addEventListener("focus", () => renderKombo());

soegefelt.addEventListener("input", () => {
  clearTimeout(debounceId);
  aktivtIndeks = -1;
  renderKombo(); // filtrér gruppe 1 med det samme
  const q = soegefelt.value;
  debounceId = setTimeout(() => hentDawa(q), 250); // hent DAWA til gruppe 2
});

soegefelt.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    lukKombo();
    return;
  }
  if (forslagsliste.hidden) {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      renderKombo();
    }
    return;
  }
  if (komboOptions.length === 0) return;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    aktivtIndeks = (aktivtIndeks + 1) % komboOptions.length;
    renderKombo();
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    aktivtIndeks = (aktivtIndeks - 1 + komboOptions.length) % komboOptions.length;
    renderKombo();
  } else if (ev.key === "Enter") {
    if (aktivtIndeks >= 0) {
      ev.preventDefault();
      vaelgKombo(aktivtIndeks);
    }
  }
});

soegefelt.addEventListener("blur", () => {
  // Luk lidt forsinket, så et klik på et forslag når at blive registreret.
  setTimeout(lukKombo, 150);
});

// Klik uden for søgeområdet lukker listen.
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".soegning")) lukKombo();
});

el("soegeform").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (aktivtIndeks >= 0) vaelgKombo(aktivtIndeks);
  else renderKombo();
});

// --- Skuffe med stamdata + part (overlay på kontekstlinjen) ------------------
const stamdataKnap = el("stamdata-knap");
const stamdataSkuffe = el("stamdata-skuffe");

function aabnSkuffe() {
  stamdataSkuffe.hidden = false;
  stamdataKnap.setAttribute("aria-expanded", "true");
  stamdataKnap.textContent = "Skjul stamdata";
  stamdataSkuffe.focus(); // flyt fokus ind i skuffen
}

function lukSkuffe(givFokus) {
  if (stamdataSkuffe.hidden) {
    stamdataKnap.setAttribute("aria-expanded", "false");
    stamdataKnap.textContent = "Vis stamdata";
    return;
  }
  stamdataSkuffe.hidden = true;
  stamdataKnap.setAttribute("aria-expanded", "false");
  stamdataKnap.textContent = "Vis stamdata";
  if (givFokus) stamdataKnap.focus(); // fokus tilbage til knappen
}

stamdataKnap.addEventListener("click", () => {
  if (stamdataSkuffe.hidden) aabnSkuffe();
  else lukSkuffe(true);
});

stamdataSkuffe.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") lukSkuffe(true);
});

// --- Ydelser: to adskilte tabeller + varslinger ------------------------------
async function postJson(url, body) {
  const svar = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Bruger": brugerHeader() },
    body: JSON.stringify(body || {}),
  });
  const data = await svar.json().catch(() => ({}));
  if (!svar.ok) throw new Error(data.fejl || `Serverfejl (${svar.status}).`);
  return data;
}

function statusPil(status) {
  return `<span class="status-pil status-${escapeHtml(status.farve)}">${escapeHtml(status.tekst)}</span>`;
}

function ryddYdelser() {
  el("loebende-tabel").innerHTML = "";
  el("engangs-tabel").innerHTML = "";
  el("varsling-tabel").innerHTML = "";
  el("loebende-tom").hidden = false;
  el("engangs-tom").hidden = false;
  el("varsling-tom").hidden = false;
}

async function indlaesYdelser(ejendomId) {
  try {
    const data = await hentJson(`/api/ejendomme/${encodeURIComponent(ejendomId)}/ydelser`);
    renderLoebende(data.loebende || []);
    renderEngangs(data.engangs || []);
    renderVarslinger(data.varslinger || []);
  } catch (e) {
    ryddYdelser();
  }
}

function renderLoebende(raekker) {
  const tbody = el("loebende-tabel");
  tbody.innerHTML = "";
  el("loebende-tom").hidden = raekker.length > 0;
  for (const y of raekker) {
    const tr = document.createElement("tr");
    if (y.status.kode === "UDLOEBER_SNART") tr.className = "raekke--snart";
    const periode = `${escapeHtml(y.gyldig_fra)} – ${escapeHtml(y.gyldig_til || "løber stadig")}`;
    let handling = "—";
    // Forny/Varsl er sagsbehandlerhandlinger; skjules for borgere (serveren afviser dem uanset).
    if (y.kan_forny && erSagsbehandler()) {
      handling =
        `<button type="button" class="tabelknap" data-forny="${escapeHtml(y.id)}">Forny</button>` +
        `<button type="button" class="tabelknap tabelknap--sekundaer" data-varsl="${escapeHtml(y.id)}">Varsl part</button>`;
    }
    tr.innerHTML =
      `<td>${escapeHtml(y.ydelse_navn)}</td>` +
      `<td>${escapeHtml(y.fraktion_navn || "—")}</td>` +
      `<td>${periode}</td>` +
      `<td>${escapeHtml(y.binding_navn)}</td>` +
      `<td>${formatOere(y.aarlig_takst_oere)}</td>` +
      `<td>${statusPil(y.status)}</td>` +
      `<td>${handling}</td>`;
    tbody.append(tr);
  }
}

function renderEngangs(raekker) {
  const tbody = el("engangs-tabel");
  tbody.innerHTML = "";
  el("engangs-tom").hidden = raekker.length > 0;
  for (const e of raekker) {
    const tr = document.createElement("tr");
    const pris = e.enhedspris_oere === 0 ? "0,00 kr. (gebyrfri)" : formatOere(e.beloeb_oere);
    tr.innerHTML =
      `<td>${escapeHtml(e.ydelse_navn)}</td>` +
      `<td>${e.antal}</td>` +
      `<td>${escapeHtml(e.leveringsdato)}</td>` +
      `<td>${pris}</td>` +
      `<td>${statusPil(e.status)}</td>` +
      `<td>—</td>`;
    tbody.append(tr);
  }
}

function renderVarslinger(raekker) {
  const tbody = el("varsling-tabel");
  tbody.innerHTML = "";
  el("varsling-tom").hidden = raekker.length > 0;
  for (const v of raekker) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(v.modtager_email || "—")}</td>` +
      `<td>${escapeHtml(v.udloebsdato)}</td>` +
      `<td>${escapeHtml(v.tidspunkt)}</td>` +
      `<td>e-mail (deaktiveret)</td>`;
    tbody.append(tr);
  }
}

// Forny / Varsl via event-delegation på indholdet.
el("indhold").addEventListener("click", async (ev) => {
  const fornyId = ev.target.getAttribute?.("data-forny");
  const varslId = ev.target.getAttribute?.("data-varsl");
  try {
    if (fornyId) {
      await postJson(`/api/ydelser/loebende/${encodeURIComponent(fornyId)}/forny`, {});
      if (valgtEjendomId) indlaesYdelser(valgtEjendomId);
    } else if (varslId) {
      await postJson(`/api/ydelser/loebende/${encodeURIComponent(varslId)}/varsling`, {});
      if (valgtEjendomId) indlaesYdelser(valgtEjendomId);
    }
  } catch (e) {
    alert(`Handlingen kunne ikke gennemføres: ${e.message}`);
  }
});

// --- Tilføj-dialog -----------------------------------------------------------
const dialog = el("tilfoej-dialog");

async function indlaesKatalog() {
  try {
    katalog = await hentJson("/api/ydelseskatalog");
  } catch {
    katalog = { ydelsestyper: [], bindingsperioder: [], takster: [] };
  }
}

function fyldDialogSelects() {
  const loebendeSel = el("d-loebende-type");
  const engangsSel = el("d-engangs-type");
  const bindingSel = el("d-binding");
  loebendeSel.innerHTML = "";
  engangsSel.innerHTML = "";
  bindingSel.innerHTML = "";

  for (const t of katalog.ydelsestyper) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.navn;
    if (t.afregningsform === "PERIODISK") loebendeSel.append(opt);
    else engangsSel.append(opt);
  }
  for (const b of katalog.bindingsperioder) {
    const opt = document.createElement("option");
    opt.value = b.kode;
    opt.textContent = b.navn;
    bindingSel.append(opt);
  }
}

function valgtType() {
  const valgt = document.querySelector('input[name="ydelsestype"]:checked');
  return valgt ? valgt.value : "loebende";
}

function maanederForKode(kode) {
  const b = katalog.bindingsperioder.find((x) => x.kode === kode);
  return b ? b.maaneder : 0;
}

// Klientside-beregning af slutdato (kun preview; serveren beregner autoritativt).
function addMaaneder(dato, maaneder) {
  if (!dato) return "";
  const d = new Date(`${dato}T00:00:00Z`);
  const dag = d.getUTCDate();
  const maal = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + maaneder, 1));
  const sidste = new Date(Date.UTC(maal.getUTCFullYear(), maal.getUTCMonth() + 1, 0)).getUTCDate();
  maal.setUTCDate(Math.min(dag, sidste));
  return maal.toISOString().slice(0, 10);
}

function takstForMaterieltype(materieltypeId) {
  const idag = new Date().toISOString().slice(0, 10);
  const t = katalog.takster.find(
    (x) => x.materieltype_id === materieltypeId && x.gyldig_fra <= idag && (x.gyldig_til === null || idag < x.gyldig_til)
  );
  return t ? t.beloeb_aarligt_oere : null;
}

function opdaterDialog() {
  const type = valgtType();
  el("felter-loebende").hidden = type !== "loebende";
  el("felter-engangs").hidden = type !== "engangs";
  el("dialog-titel").textContent = type === "loebende" ? "Tilføj løbende ydelse" : "Tilføj engangsleverance";

  // Forudfyld hjemmel fra den valgte ydelsestype (kan overskrives).
  const typeId = type === "loebende" ? el("d-loebende-type").value : el("d-engangs-type").value;
  const ytype = katalog.ydelsestyper.find((t) => t.id === typeId);
  if (ytype && !el("d-hjemmel").value) el("d-hjemmel").value = ytype.hjemmel || "";

  if (type === "loebende") {
    const slut = addMaaneder(el("d-startdato").value, maanederForKode(el("d-binding").value));
    el("d-slutdato").value = slut;
    const takst = ytype ? takstForMaterieltype(ytype.materieltype_id) : null;
    el("d-beloeb").textContent = takst != null ? `${formatOere(takst)} pr. år` : "—";
  } else {
    const antal = Number(el("d-antal").value) || 0;
    const pris = ytype && ytype.standard_enhedspris_oere != null ? ytype.standard_enhedspris_oere : 0;
    el("d-beloeb").textContent = pris === 0 ? "0,00 kr. (gebyrfri)" : formatOere(antal * pris);
  }
}

function aabnDialog(forvalgtType) {
  if (!valgtEjendomId) {
    alert("Vælg en ejendom i registret først.");
    return;
  }
  fyldDialogSelects();
  document.querySelector(`input[name="ydelsestype"][value="${forvalgtType}"]`).checked = true;
  el("tilfoej-form").reset();
  document.querySelector(`input[name="ydelsestype"][value="${forvalgtType}"]`).checked = true;
  el("d-hjemmel").value = "";
  el("dialog-fejl").hidden = true;
  // Sæt en fornuftig standard-startdato/leveringsdato = i dag.
  const idag = new Date().toISOString().slice(0, 10);
  el("d-startdato").value = idag;
  el("d-leveringsdato").value = idag;
  el("d-antal").value = "1";
  opdaterDialog();
  dialog.showModal();
}

document.querySelectorAll("[data-tilfoej]").forEach((knap) => {
  knap.addEventListener("click", () => aabnDialog(knap.getAttribute("data-tilfoej")));
});
document.querySelectorAll('input[name="ydelsestype"]').forEach((r) => r.addEventListener("change", opdaterDialog));
["d-loebende-type", "d-engangs-type", "d-binding", "d-startdato", "d-antal"].forEach((id) =>
  el(id).addEventListener("change", opdaterDialog)
);
el("d-antal").addEventListener("input", opdaterDialog);
el("dialog-annuller").addEventListener("click", () => dialog.close());

el("tilfoej-form").addEventListener("submit", async (ev) => {
  // <form method="dialog"> lukker normalt dialogen; vi styrer selv via POST.
  ev.preventDefault();
  if (!valgtEjendomId) return;
  el("dialog-fejl").hidden = true;

  const type = valgtType();
  const hjemmel = el("d-hjemmel").value.trim();
  if (!hjemmel) {
    const f = el("d-hjemmel-fejl");
    f.textContent = "Hjemmel er obligatorisk.";
    f.hidden = false;
    el("d-hjemmel").focus();
    return;
  }
  el("d-hjemmel-fejl").hidden = true;

  try {
    if (type === "loebende") {
      const ytype = katalog.ydelsestyper.find((t) => t.id === el("d-loebende-type").value);
      await postJson(`/api/ejendomme/${encodeURIComponent(valgtEjendomId)}/ydelser/loebende`, {
        ydelsestype_id: ytype.id,
        materieltype_id: ytype.materieltype_id,
        bindingsperiode_kode: el("d-binding").value,
        startdato: el("d-startdato").value,
        hjemmel,
      });
    } else {
      const ytype = katalog.ydelsestyper.find((t) => t.id === el("d-engangs-type").value);
      await postJson(`/api/ejendomme/${encodeURIComponent(valgtEjendomId)}/ydelser/engangs`, {
        ydelsestype_id: ytype.id,
        leveringsdato: el("d-leveringsdato").value,
        antal: Number(el("d-antal").value),
        enhedspris_oere: ytype.standard_enhedspris_oere != null ? ytype.standard_enhedspris_oere : 0,
        hjemmel,
      });
    }
    dialog.close();
    indlaesYdelser(valgtEjendomId);
  } catch (e) {
    const f = el("dialog-fejl");
    f.textContent = e.message;
    f.hidden = false;
  }
});

// --- Statusetiketter for opkrævning, sag og afgørelse ------------------------
const OPK_STATUS = {
  KLADDE: { tekst: "Kladde", farve: "graa" },
  GODKENDT: { tekst: "Godkendt", farve: "blaa" },
  SENDT: { tekst: "Sendt", farve: "gul" },
  BETALT: { tekst: "Betalt", farve: "groen" },
  ANNULLERET: { tekst: "Annulleret", farve: "roed" },
};
const SAG_STATUS = {
  MODTAGET: { tekst: "Modtaget", farve: "graa" },
  UNDER_BEHANDLING: { tekst: "Under behandling", farve: "blaa" },
  PARTSHOERING: { tekst: "Partshøring", farve: "gul" },
  AFGJORT: { tekst: "Afgjort", farve: "groen" },
  LUKKET: { tekst: "Lukket", farve: "graa" },
};
const SAG_TRIN = ["MODTAGET", "UNDER_BEHANDLING", "PARTSHOERING", "AFGJORT", "LUKKET"];
const AFG_RESULTAT = {
  IMOEDEKOMMET: { tekst: "Imødekommet", farve: "groen" },
  DELVIST: { tekst: "Delvist imødekommet", farve: "gul" },
  AFSLAG: { tekst: "Afslag", farve: "roed" },
};
function pil(kode, tabel) {
  const v = tabel[kode] || { tekst: kode, farve: "graa" };
  return `<span class="status-pil status-${v.farve}">${escapeHtml(v.tekst)}</span>`;
}
function kanalTekst(kanal) {
  return { SELVBETJENING: "Selvbetjening", SAGSBEHANDLER: "Sagsbehandler" }[kanal] || kanal || "—";
}

// --- Opkrævning --------------------------------------------------------------
function ryddOpkraevning() {
  el("opk-visning").hidden = true;
  el("opk-tom").hidden = false;
}

async function indlaesOpkraevning(ejendomId) {
  try {
    const data = await hentJson(`/api/ejendomme/${encodeURIComponent(ejendomId)}/opkraevninger`);
    if (data.seneste) renderOpkraevning(data.seneste);
    else ryddOpkraevning();
  } catch {
    ryddOpkraevning();
  }
}

function renderOpkraevning(seneste) {
  const o = seneste.opkraevning;
  el("opk-tom").hidden = true;
  el("opk-visning").hidden = false;
  el("opk-periode").textContent = `Periode ${o.periode_fra} – ${o.periode_til}`;
  el("opk-status").innerHTML = pil(o.status, OPK_STATUS);

  const tbody = el("opk-linjer");
  tbody.innerHTML = "";
  seneste.linjer.forEach((l, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${i + 1}</td>` +
      `<td>${escapeHtml(l.beskrivelse)}</td>` +
      `<td>${l.antal_dage != null ? l.antal_dage : "—"}</td>` +
      `<td style="text-align:right">${formatOere(l.beloeb_oere)}</td>`;
    tbody.append(tr);
  });
  el("opk-total").textContent = formatOere(o.beloeb_total_oere);
  el("opk-total").style.textAlign = "right";

  // Handlingsknapper efter status (KLADDE→GODKENDT→SENDT→BETALT).
  const naeste = { KLADDE: ["GODKENDT", "Godkend"], GODKENDT: ["SENDT", "Registrér sendt"], SENDT: ["BETALT", "Registrér betaling"] }[o.status];
  const handling = el("opk-handling");
  handling.innerHTML = "";
  // Statusskift er en sagsbehandlerhandling; skjules for borgere.
  if (naeste && erSagsbehandler()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "knap";
    b.textContent = naeste[1];
    b.addEventListener("click", () => skiftOpkStatus(o.id, naeste[0]));
    handling.append(b);
  }
}

async function skiftOpkStatus(opkId, status) {
  try {
    await postJson(`/api/opkraevning/${encodeURIComponent(opkId)}/status`, { status });
    if (valgtEjendomId) indlaesOpkraevning(valgtEjendomId);
  } catch (e) {
    alert(`Kunne ikke skifte status: ${e.message}`);
  }
}

el("dan-opkraevning").addEventListener("click", async () => {
  if (!valgtEjendomId) return;
  try {
    await postJson(`/api/ejendomme/${encodeURIComponent(valgtEjendomId)}/opkraevning/dan`, {
      periode_fra: "2026-01-01",
      periode_til: "2027-01-01",
    });
    indlaesOpkraevning(valgtEjendomId);
  } catch (e) {
    alert(`Kunne ikke danne opkrævning: ${e.message}`);
  }
});

// --- Sagsbehandling ----------------------------------------------------------
let sager = [];
let valgtSagId = null;
let sagskatalog = { sagstyper: [] };
// Sag der ønskes åbnet direkte (fx fra sagsoverblikket).
let oensketSagId = null;

function ryddSager() {
  sager = [];
  valgtSagId = null;
  el("sagsliste").innerHTML = "";
  el("sager-tom").hidden = false;
  el("sag-detalje").innerHTML = '<p class="tomtilstand">Vælg en sag i listen for at se detaljer.</p>';
}

async function indlaesSager(ejendomId) {
  try {
    const data = await hentJson(`/api/ejendomme/${encodeURIComponent(ejendomId)}/sager`);
    sager = data.sager || [];
    renderSagsliste();
    // Kommer man fra sagsoverblikket, vælges den ønskede sag direkte.
    const oensket = oensketSagId ? sager.find((s) => s.sag.id === oensketSagId) : null;
    oensketSagId = null;
    if (oensket) {
      vaelgSag(oensket.sag.id);
    } else {
      // Behold valgt sag hvis den stadig findes, ellers vælg den første.
      const stadig = sager.find((s) => s.sag.id === valgtSagId);
      if (stadig) renderSagDetalje(stadig);
      else if (sager.length > 0) vaelgSag(sager[0].sag.id);
      else el("sag-detalje").innerHTML = '<p class="tomtilstand">Ingen sager. Opret en sag med "+ Opret sag".</p>';
    }
  } catch {
    ryddSager();
  }
}

function renderSagsliste() {
  const ul = el("sagsliste");
  ul.innerHTML = "";
  el("sager-tom").hidden = sager.length > 0;
  for (const s of sager) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    if (s.sag.id === valgtSagId) b.setAttribute("aria-current", "true");
    const kanalMaerke =
      s.sag.kanal === "SELVBETJENING" ? '<span class="kanal-maerke">Selvbetjening</span>' : "";
    b.innerHTML =
      `<span class="nr">${escapeHtml(s.sag.sagsnummer)} ${kanalMaerke}</span>` +
      `<span class="undertekst">${escapeHtml(s.sagstype_navn)} · ${(SAG_STATUS[s.sag.status] || {}).tekst || s.sag.status}</span>` +
      `<span class="undertekst">Kanal: ${escapeHtml(kanalTekst(s.sag.kanal))}</span>` +
      (s.ansoegning_tekst ? `<span class="undertekst">Ansøgt om: ${escapeHtml(s.ansoegning_tekst)}</span>` : "");
    b.addEventListener("click", () => vaelgSag(s.sag.id));
    li.append(b);
    ul.append(li);
  }
}

function vaelgSag(id) {
  valgtSagId = id;
  renderSagsliste();
  const s = sager.find((x) => x.sag.id === id);
  if (s) renderSagDetalje(s);
}

function renderSagDetalje(s) {
  const sag = s.sag;
  const naaetIndeks = SAG_TRIN.indexOf(sag.status);
  const trin = SAG_TRIN.map(
    (t, i) => `<span class="${i <= naaetIndeks ? "naaet" : ""}">${(SAG_STATUS[t] || {}).tekst || t}</span>`
  ).join("");

  let html = `<div class="trin">${trin}</div>`;
  html +=
    `<dl>` +
    `<dt>Sagsnummer</dt><dd>${escapeHtml(sag.sagsnummer)}</dd>` +
    `<dt>Sagstype</dt><dd>${escapeHtml(s.sagstype_navn)}${s.kle_nummer ? ` (KLE ${escapeHtml(s.kle_nummer)})` : ""}</dd>` +
    `<dt>Status</dt><dd>${pil(sag.status, SAG_STATUS)}</dd>` +
    `<dt>Kanal</dt><dd>${escapeHtml(kanalTekst(sag.kanal))}</dd>` +
    `<dt>Modtaget</dt><dd>${escapeHtml(sag.modtaget_dato)}</dd>` +
    `<dt>Frist</dt><dd>${escapeHtml(sag.frist_dato)}</dd>` +
    `<dt>Ansvarlig</dt><dd>${escapeHtml(sag.ansvarlig_bruger || "—")}</dd>` +
    (sag.lukket_dato ? `<dt>Lukket</dt><dd>${escapeHtml(sag.lukket_dato)}</dd>` : "") +
    `</dl>`;

  // Selvbetjeningsansøgning: vis tydeligt hvad borgeren har ansøgt om.
  if (s.ansoegning_tekst) {
    html +=
      `<p class="ansoeg-info"><strong>Ansøgt om:</strong> ${escapeHtml(s.ansoegning_tekst)}` +
      (s.effektueret ? ' <span class="status-pil status-groen">Effektueret</span>' : "") +
      `</p>`;
  }

  // Statushandlinger (næste skridt) + træf afgørelse - kun for sagsbehandlere.
  const naeste = {
    MODTAGET: ["UNDER_BEHANDLING", "Start behandling"],
    UNDER_BEHANDLING: ["PARTSHOERING", "Send i partshøring"],
    PARTSHOERING: ["UNDER_BEHANDLING", "Tilbage til behandling"],
    AFGJORT: ["LUKKET", "Luk sag"],
  }[sag.status];
  if (erSagsbehandler()) {
    html += `<div class="opk-handling">`;
    if (naeste) html += `<button type="button" class="knap knap--sekundaer" data-sagstatus="${naeste[0]}">${naeste[1]}</button>`;
    if (sag.status !== "AFGJORT" && sag.status !== "LUKKET") html += `<button type="button" class="knap" data-afgoerelse="1">Træf afgørelse</button>`;
    html += `</div>`;

    // Effektuér en imødekommet ansøgning: opret den ansøgte ydelse. For løbende
    // ydelser vælges bindingsperioden her; for andre arter er den irrelevant.
    if (s.kan_effektueres) {
      const art = sag.ansoegning ? sag.ansoegning.art : null;
      const erLoebende = art === "EKSTRA_BEHOLDER" || art === "ANDEN_STOERRELSE";
      html += `<div class="opk-handling effektuer-blok">`;
      if (erLoebende) {
        const opts = (katalog.bindingsperioder || [])
          .map((b) => `<option value="${escapeHtml(b.kode)}"${b.kode === "12_MDR" ? " selected" : ""}>${escapeHtml(b.navn)}</option>`)
          .join("");
        html +=
          `<label for="effektuer-binding">Bindingsperiode</label>` +
          `<select id="effektuer-binding">${opts}</select>`;
      }
      html += `<button type="button" class="knap" data-effektuer="1">Effektuér ansøgning</button></div>`;
    }
  }

  // Afgørelse
  if (s.afgoerelse) {
    const a = s.afgoerelse;
    html +=
      `<h3>Afgørelse</h3><dl>` +
      `<dt>Resultat</dt><dd>${pil(a.resultat, AFG_RESULTAT)}</dd>` +
      `<dt>Hjemmel</dt><dd>${escapeHtml(a.hjemmel)}</dd>` +
      `<dt>Begrundelse</dt><dd>${escapeHtml(a.begrundelse || "—")}</dd>` +
      `<dt>Afgjort</dt><dd>${escapeHtml(a.afgjort_dato)} · ${escapeHtml(a.afgjort_af)}</dd>` +
      `<dt>Klagefrist</dt><dd>${escapeHtml(a.klagefrist_dato)}</dd>` +
      `</dl>`;
  }

  // Journalnotater (append-only). Tilføj-feltet er kun for sagsbehandlere.
  html += `<h3>Journalnotater <span class="hjaelptekst" style="color:var(--tekst-daempet)">(kan ikke redigeres/slettes)</span></h3>`;
  for (const j of s.journal) {
    html += `<div class="journal">${escapeHtml(j.tekst)}<div class="meta">${escapeHtml(j.oprettet)} · ${escapeHtml(j.oprettet_af)}</div></div>`;
  }
  if (erSagsbehandler()) {
    html +=
      `<div class="notat-tilfoej">` +
      `<label class="visuelt-skjult" for="nyt-notat">Nyt journalnotat</label>` +
      `<input id="nyt-notat" type="text" placeholder="Tilføj journalnotat…" />` +
      `<button type="button" class="knap knap--sekundaer" id="tilfoej-notat">Tilføj notat</button>` +
      `</div>`;
  }

  el("sag-detalje").innerHTML = html;

  // Bind handlinger
  el("sag-detalje").querySelectorAll("[data-sagstatus]").forEach((b) =>
    b.addEventListener("click", () => skiftSagStatusUI(sag.id, b.getAttribute("data-sagstatus")))
  );
  const afgBtn = el("sag-detalje").querySelector("[data-afgoerelse]");
  if (afgBtn) afgBtn.addEventListener("click", () => aabnAfgoerelse(sag.id));
  el("tilfoej-notat")?.addEventListener("click", () => tilfoejNotat(sag.id));
  const effBtn = el("sag-detalje").querySelector("[data-effektuer]");
  if (effBtn) effBtn.addEventListener("click", () => effektuerSag(sag.id));
}

// Effektuerer en imødekommet ansøgning: opretter den ansøgte ydelse på serveren
// (genbrug af den eksisterende ydelses-oprettelse) og genindlæser sag + ydelser.
async function effektuerSag(sagId) {
  const bindingSel = el("effektuer-binding");
  const binding = bindingSel ? bindingSel.value : "";
  try {
    await postJson(`/api/sager/${encodeURIComponent(sagId)}/effektuer`, binding ? { bindingsperiode_kode: binding } : {});
    if (valgtEjendomId) {
      indlaesSager(valgtEjendomId);
      indlaesYdelser(valgtEjendomId);
    }
  } catch (e) {
    alert(`Kunne ikke effektuere ansøgningen: ${e.message}`);
  }
}

async function skiftSagStatusUI(sagId, status) {
  try {
    await postJson(`/api/sager/${encodeURIComponent(sagId)}/status`, { status });
    if (valgtEjendomId) indlaesSager(valgtEjendomId);
  } catch (e) {
    alert(`Kunne ikke skifte status: ${e.message}`);
  }
}

async function tilfoejNotat(sagId) {
  const input = el("nyt-notat");
  const tekst = (input.value || "").trim();
  if (!tekst) return;
  try {
    await postJson(`/api/sager/${encodeURIComponent(sagId)}/journalnotat`, { tekst });
    if (valgtEjendomId) indlaesSager(valgtEjendomId);
  } catch (e) {
    alert(`Kunne ikke tilføje notat: ${e.message}`);
  }
}

// Opret sag-dialog
const sagDialog = el("sag-dialog");
async function indlaesSagskatalog() {
  try {
    sagskatalog = await hentJson("/api/sagskatalog");
  } catch {
    sagskatalog = { sagstyper: [] };
  }
}
el("opret-sag").addEventListener("click", () => {
  if (!valgtEjendomId) {
    alert("Vælg en ejendom i registret først.");
    return;
  }
  const sel = el("s-sagstype");
  sel.innerHTML = "";
  for (const t of sagskatalog.sagstyper) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.navn} (KLE ${t.kle_nummer})`;
    opt.dataset.frist = t.sagsbehandlingsfrist_dage;
    sel.append(opt);
  }
  opdaterFristHint();
  el("sag-dialog-fejl").hidden = true;
  sagDialog.showModal();
});
function opdaterFristHint() {
  const opt = el("s-sagstype").selectedOptions[0];
  el("s-frist-hint").textContent = opt ? `Sagsbehandlingsfrist: ${opt.dataset.frist} dage fra i dag.` : "";
}
el("s-sagstype").addEventListener("change", opdaterFristHint);
el("sag-annuller").addEventListener("click", () => sagDialog.close());
el("sag-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    await postJson(`/api/ejendomme/${encodeURIComponent(valgtEjendomId)}/sager`, {
      sagstype_id: el("s-sagstype").value,
    });
    sagDialog.close();
    indlaesSager(valgtEjendomId);
  } catch (e) {
    const f = el("sag-dialog-fejl");
    f.textContent = e.message;
    f.hidden = false;
  }
});

// Træf afgørelse-dialog
const afgDialog = el("afg-dialog");
let afgSagId = null;
function aabnAfgoerelse(sagId) {
  afgSagId = sagId;
  el("afg-form").reset();
  el("afg-dialog-fejl").hidden = true;
  afgDialog.showModal();
}
el("afg-annuller").addEventListener("click", () => afgDialog.close());
el("afg-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const hjemmel = el("a-hjemmel").value.trim();
  if (!hjemmel) {
    const f = el("afg-dialog-fejl");
    f.textContent = "Hjemmel er obligatorisk — uden hjemmel er afgørelsen ikke gyldig.";
    f.hidden = false;
    el("a-hjemmel").focus();
    return;
  }
  try {
    await postJson(`/api/sager/${encodeURIComponent(afgSagId)}/afgoerelse`, {
      resultat: el("a-resultat").value,
      begrundelse: el("a-begrundelse").value,
      hjemmel,
    });
    afgDialog.close();
    indlaesSager(valgtEjendomId);
  } catch (e) {
    const f = el("afg-dialog-fejl");
    f.textContent = e.message;
    f.hidden = false;
  }
});

// --- Part: visning + redigering af kontaktoplysninger ------------------------
function renderParter() {
  const parterEl = el("parter");
  parterEl.innerHTML = "";
  if (!aktuelleParter.length) {
    const p = document.createElement("p");
    p.className = "tomtilstand";
    p.textContent = "Ingen part tilknyttet i registret.";
    parterEl.append(p);
    return;
  }
  for (const part of aktuelleParter) {
    const kort = document.createElement("div");
    kort.className = "partkort";
    const meta = [
      parttypeTekst(part.parttype),
      `Rolle: ${escapeHtml((part.roller || []).join(", "))}`,
      part.cvr_nummer ? `CVR ${escapeHtml(part.cvr_nummer)}` : null,
      part.email ? `E-mail: ${escapeHtml(part.email)}` : null,
      part.telefon ? `Tlf. ${escapeHtml(part.telefon)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    kort.innerHTML =
      `<div><span class="partkort__navn">${escapeHtml(rentNavn(part.navn))}</span>` +
      `<span class="fiktiv-badge">fiktiv</span></div>` +
      `<div class="partkort__meta">${meta}</div>`;
    const knap = document.createElement("button");
    knap.type = "button";
    knap.className = "knap knap--sekundaer partkort__ret";
    knap.textContent = "Ret kontaktoplysninger";
    knap.addEventListener("click", () => aabnKontaktDialog(part));
    kort.append(knap);
    parterEl.append(kort);
  }
}

async function indlaesPartfelter() {
  try {
    partfelter = await hentJson("/api/partfelter");
  } catch {
    partfelter = { felter: [], register_forklaring: "" };
  }
}

// Klientside-spejling af serverens validering (autoritativ regel ligger i domain/kontakt).
function normaliserTelefonJS(raw) {
  let t = String(raw || "").replace(/\s+/g, "");
  if (t === "") return "";
  if (t.startsWith("+45")) t = t.slice(3);
  else if (t.startsWith("0045")) t = t.slice(4);
  return t;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const kontaktDialog = el("kontakt-dialog");
let aktuelPartId = null;

function saetFejl(inputId, fejlId, besked) {
  const input = el(inputId);
  const fejl = el(fejlId);
  if (besked) {
    input.setAttribute("aria-invalid", "true");
    fejl.textContent = besked;
    fejl.hidden = false;
  } else {
    input.removeAttribute("aria-invalid");
    fejl.textContent = "";
    fejl.hidden = true;
  }
}

async function aabnKontaktDialog(part) {
  aktuelPartId = part.id;
  // Registerdata skrivebeskyttet + forklaring.
  const reg = el("kontakt-register");
  const registerFelter = (partfelter.felter || []).filter((f) => f.klasse === "REGISTER");
  const rows = registerFelter
    .map((f) => {
      const vaerdi = f.felt === "parttype" ? parttypeTekst(part.parttype) : part[f.felt];
      if (vaerdi == null || vaerdi === "") return "";
      return `<div class="kontakt-reg__felt"><dt>${escapeHtml(f.navn)}</dt><dd>${escapeHtml(String(vaerdi))}</dd></div>`;
    })
    .filter(Boolean)
    .join("");
  reg.innerHTML =
    `<dl class="kontakt-reg">${rows}</dl>` +
    `<p class="hjaelptekst kontakt-reg__note">${escapeHtml(partfelter.register_forklaring || "")}</p>`;

  el("k-email").value = part.email || "";
  el("k-telefon").value = part.telefon || "";
  saetFejl("k-email", "k-email-fejl", "");
  saetFejl("k-telefon", "k-telefon-fejl", "");
  el("kontakt-fejl").hidden = true;

  renderKontaktHistorik([]);
  hentKontaktHistorik(part.id);

  kontaktDialog.showModal();
  el("k-email").focus();
}

async function hentKontaktHistorik(partId) {
  try {
    const data = await hentJson(`/api/parter/${encodeURIComponent(partId)}/kontakt-historik`);
    renderKontaktHistorik(data.historik || []);
  } catch {
    renderKontaktHistorik([]);
  }
}

function beskrivFelt(felt) {
  return { email: "E-mail", telefon: "Telefon" }[felt] || felt;
}
function beskrivVaerdi(v) {
  return v == null || v === "" ? "(tom)" : v;
}

function renderKontaktHistorik(poster) {
  const c = el("kontakt-historik");
  if (!poster.length) {
    c.innerHTML = '<p class="tomtilstand">Ingen tidligere ændringer.</p>';
    return;
  }
  c.innerHTML = poster
    .map((a) => {
      const felt = Object.keys(a.efter || {})[0];
      const foer = beskrivVaerdi((a.foer || {})[felt]);
      const efter = beskrivVaerdi((a.efter || {})[felt]);
      return (
        `<div class="journal"><strong>${escapeHtml(beskrivFelt(felt))}</strong>: ` +
        `${escapeHtml(String(foer))} → ${escapeHtml(String(efter))}` +
        `<div class="meta">${escapeHtml(a.tidspunkt)} · ${escapeHtml(a.bruger)}</div></div>`
      );
    })
    .join("");
}

el("kontakt-annuller").addEventListener("click", () => kontaktDialog.close());

el("kontakt-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  el("kontakt-fejl").hidden = true;
  saetFejl("k-email", "k-email-fejl", "");
  saetFejl("k-telefon", "k-telefon-fejl", "");

  const emailRaw = el("k-email").value.trim();
  const telRaw = el("k-telefon").value.trim();
  const telNorm = normaliserTelefonJS(telRaw);
  let fejl = false;

  if (emailRaw !== "" && !EMAIL_RE.test(emailRaw)) {
    saetFejl("k-email", "k-email-fejl", "E-mailadressen har ikke en gyldig form.");
    fejl = true;
  }
  if (telNorm !== "" && !/^\d{8}$/.test(telNorm)) {
    saetFejl("k-telefon", "k-telefon-fejl", "Telefonnummeret skal være et gyldigt dansk 8-cifret nummer.");
    fejl = true;
  }
  if (!fejl && emailRaw === "" && telNorm === "") {
    const f = el("kontakt-fejl");
    f.textContent = "Mindst én kontaktmulighed skal være udfyldt, ellers kan der ikke sendes varsling.";
    f.hidden = false;
    fejl = true;
  }
  if (fejl) {
    if (el("k-email").getAttribute("aria-invalid")) el("k-email").focus();
    else if (el("k-telefon").getAttribute("aria-invalid")) el("k-telefon").focus();
    return;
  }

  try {
    const data = await postJson(`/api/parter/${encodeURIComponent(aktuelPartId)}/kontakt`, {
      email: emailRaw,
      telefon: telRaw,
    });
    // Opdatér visningen med det samme.
    const idx = aktuelleParter.findIndex((p) => p.id === aktuelPartId);
    if (idx >= 0) {
      aktuelleParter[idx] = { ...aktuelleParter[idx], email: data.part.email, telefon: data.part.telefon };
      renderParter();
    }
    kontaktDialog.close();
    // Bekræftelse vises det rette sted alt efter rolle/flade.
    const bekId = erSagsbehandler() ? "kontakt-bekraeft" : "borger-kontakt-bekraeft";
    const bek = el(bekId);
    bek.textContent = erSagsbehandler()
      ? "Kontaktoplysninger opdateret."
      : "Dine kontaktoplysninger er opdateret.";
    bek.hidden = false;
    setTimeout(() => {
      bek.hidden = true;
    }, 5000);
    // Borgerfladen genindlæses, så de nye oplysninger vises med det samme.
    if (!erSagsbehandler()) indlaesMine();
  } catch (e) {
    const f = el("kontakt-fejl");
    f.textContent = e.message;
    f.hidden = false;
  }
});

// --- Rolleskifter (fake-auth i testbanneret) ---------------------------------
// VIGTIGT: dette styrer kun hvilken X-Bruger-header frontend sender, og hvad
// der VISES. Den egentlige adgangskontrol håndhæves på serveren, som afviser
// (403) uanset hvad denne flade sender.
let brugerliste = { sagsbehandler: null, borgere: [] };

async function indlaesBrugere() {
  const vaelger = el("rolle-vaelger");
  try {
    brugerliste = await hentJson("/api/brugere");
  } catch {
    brugerliste = { sagsbehandler: { rolle: "SAGSBEHANDLER", navn: "Sagsbehandler ABC" }, borgere: [] };
  }
  vaelger.innerHTML = "";
  // Sagsbehandler først (systemets standardrolle).
  const sb = brugerliste.sagsbehandler || { navn: "Sagsbehandler ABC" };
  const optSb = document.createElement("option");
  optSb.value = "SAGSBEHANDLER";
  optSb.textContent = sb.navn;
  vaelger.append(optSb);
  // Derefter de fiktive borgere med deres adresse som holdepunkt.
  for (const b of brugerliste.borgere) {
    const opt = document.createElement("option");
    opt.value = `BORGER:${b.part_id}`;
    const adresse = b.adresser && b.adresser[0] ? ` – ${b.adresser[0]}` : "";
    opt.textContent = `${rentNavn(b.navn)} (borger)${adresse}`;
    vaelger.append(opt);
  }
  vaelger.value = brugerHeader();
  opdaterRolleNote();
}

function skiftRolle(vaerdi) {
  if (vaerdi === "SAGSBEHANDLER") {
    aktuelBruger = {
      rolle: "SAGSBEHANDLER",
      part_id: null,
      navn: (brugerliste.sagsbehandler || {}).navn || "Sagsbehandler ABC",
    };
  } else {
    const partId = vaerdi.slice("BORGER:".length);
    const b = brugerliste.borgere.find((x) => x.part_id === partId);
    aktuelBruger = { rolle: "BORGER", part_id: partId, navn: b ? b.navn : partId };
  }
  // Skjuler sagsbehandler-handlinger i UI (kun brugervenlighed - serveren
  // håndhæver reglen uanset).
  document.body.classList.toggle("rolle-borger", !erSagsbehandler());
  // Brand-teksten følger rollen (borgeren er ikke i "sagsbehandling").
  const titel = document.querySelector(".topbar__titel");
  if (titel) titel.textContent = erSagsbehandler() ? "Renovation · Sagsbehandling" : "Renovation · Selvbetjening";
  opdaterRolleNote();
  nulstilVisning();
  if (erSagsbehandler()) {
    indlaesRegisterEjendomme();
    // Sagsbehandlerens standardvisning er det prioriterede sagsoverblik.
    visFane("overblik", false);
  } else {
    // Borgerens egen læseflade. Al filtrering sker på serveren (GET /api/mine).
    borgerValgtEjendomId = null;
    indlaesMine();
  }
}

function opdaterRolleNote() {
  const note = el("rolle-note");
  if (erSagsbehandler()) {
    note.hidden = true;
    note.textContent = "";
  } else {
    note.hidden = false;
    note.textContent =
      `Du ser systemet som ${rentNavn(aktuelBruger.navn)} (borger). Du kan kun se dine egne ` +
      "ejendomme og rette dine egne kontaktoplysninger. Handlinger, som kun en sagsbehandler " +
      "må udføre, er skjult.";
  }
}

// Nulstiller fladen ved rolleskift, så man ikke bliver siddende på en ejendom
// den nye rolle ikke må se.
function nulstilVisning() {
  valgtEjendomId = null;
  aktuelleParter = [];
  soegefelt.value = "";
  lukKombo();
  lukSkuffe();
  el("ejendomskort").hidden = true;
  el("tomtilstand").hidden = false;
  el("kontekst-valgt").hidden = true;
  el("kontekst-tom").hidden = false;
  registerEjendomme = [];
  dawaForslag = [];
  visSoegefejl("");
  // Nulstil overbliksfiltrene ved rolleskift. Selve fanevalget sættes af
  // skiftRolle (sagsbehandleren starter på "Mine sager").
  nulstilOverblikFiltre();
  visFane("ejendom", false);
}

el("rolle-vaelger").addEventListener("change", (ev) => skiftRolle(ev.target.value));

// --- Borgerflade: selvbetjeningsoverblik (kun læsning) -----------------------
// Tynd frontend oven på GET /api/mine. Serveren bygger og filtrerer data til
// borgerens egne ejendomme; her oversættes kun til borgervenligt sprog.
let mineData = { borger: null, ejendomme: [] };
let borgerValgtEjendomId = null;

const borgerDatoFormat = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", year: "numeric" });
function formaterDatoBorger(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : borgerDatoFormat.format(d);
}

// Oversættelse af interne koder til borgersprog.
function regningStatusBorger(kode) {
  return (
    { KLADDE: "Under udarbejdelse", GODKENDT: "Godkendt", SENDT: "Sendt til dig", BETALT: "Betalt", ANNULLERET: "Annulleret" }[
      kode
    ] || "—"
  );
}
function sagStatusBorger(kode) {
  return (
    {
      MODTAGET: "Modtaget",
      UNDER_BEHANDLING: "Under behandling",
      PARTSHOERING: "Partshøring (vi henter dine bemærkninger)",
      AFGJORT: "Afgjort",
      LUKKET: "Afsluttet",
    }[kode] || kode
  );
}
function afgResultatBorger(kode) {
  return { IMOEDEKOMMET: "Imødekommet", DELVIST: "Delvist imødekommet", AFSLAG: "Afslag" }[kode] || kode;
}
function kanalBorger(kode) {
  return kode === "SELVBETJENING" ? "Oprettet af dig via selvbetjening" : "Oprettet af kommunen";
}

async function indlaesMine() {
  const fejl = el("borger-fejl");
  fejl.hidden = true;
  try {
    mineData = await hentJson("/api/mine");
  } catch (e) {
    mineData = { borger: null, ejendomme: [] };
    fejl.textContent = `Dine oplysninger kunne ikke hentes: ${e.message}`;
    fejl.hidden = false;
  }
  el("borger-navn").textContent = rentNavn((mineData.borger && mineData.borger.navn) || "—");
  // Bevar valgt ejendom hvis den stadig findes, ellers vælg den første.
  const stadig = mineData.ejendomme.find((e) => e.id === borgerValgtEjendomId);
  borgerValgtEjendomId = stadig ? stadig.id : mineData.ejendomme[0]?.id ?? null;
  renderBorgerEjendomsvalg();
  renderBorgerDetalje();
}

function renderBorgerEjendomsvalg() {
  const c = el("borger-ejendomsvalg");
  c.innerHTML = "";
  const liste = mineData.ejendomme;
  if (liste.length === 0) {
    c.innerHTML = '<p class="borger-tom">Der er ingen ejendomme tilknyttet dig.</p>';
    return;
  }
  // Har borgeren kun én ejendom, vises den direkte (ingen valg).
  if (liste.length === 1) {
    const e = liste[0];
    c.innerHTML =
      `<p class="borger-ejendom-enkelt"><strong>${escapeHtml(e.adressetekst)}</strong>` +
      `<span class="borger-ejendom-enkelt__meta">BFE ${escapeHtml(e.bfe_nummer)} · ${escapeHtml(e.kommune)}</span></p>`;
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "borger-ejendomsliste";
  for (const e of liste) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "borger-ejendom-knap";
    if (e.id === borgerValgtEjendomId) b.setAttribute("aria-current", "true");
    b.innerHTML =
      `<span class="borger-ejendom-knap__adresse">${escapeHtml(e.adressetekst)}</span>` +
      `<span class="borger-ejendom-knap__meta">BFE ${escapeHtml(e.bfe_nummer)}</span>`;
    b.addEventListener("click", () => vaelgBorgerEjendom(e.id));
    li.append(b);
    ul.append(li);
  }
  c.append(ul);
}

function vaelgBorgerEjendom(id) {
  borgerValgtEjendomId = id;
  renderBorgerEjendomsvalg();
  renderBorgerDetalje();
}

function renderBorgerDetalje() {
  const detalje = el("borger-detalje");
  const e = mineData.ejendomme.find((x) => x.id === borgerValgtEjendomId);
  if (!e) {
    detalje.hidden = true;
    return;
  }
  detalje.hidden = false;
  renderBorgerLoebende(e.loebende);
  renderBorgerEngangs(e.engangs);
  renderBorgerRegninger(e.regninger);
  renderBorgerSager(e.sager);
  renderBorgerKontakt(e);
}

function renderBorgerLoebende(liste) {
  const ul = el("borger-loebende");
  ul.innerHTML = "";
  el("borger-loebende-tom").hidden = liste.length > 0;
  for (const y of liste) {
    const li = document.createElement("li");
    li.className = "borger-liste__item";
    const gaelder = y.gyldig_til ? `Gælder til ${formaterDatoBorger(y.gyldig_til)}` : "Løber fortsat";
    let maerke = "";
    if (y.status.kode === "UDLOEBER_SNART") maerke = '<span class="borger-maerke borger-maerke--obs">Udløber snart</span>';
    else if (y.status.kode === "UDLOEBET") maerke = '<span class="borger-maerke borger-maerke--obs">Udløbet</span>';
    li.innerHTML =
      `<span class="borger-liste__navn">${escapeHtml(y.ydelse_navn)}</span>` +
      (y.fraktion_navn ? `<span class="borger-liste__under">${escapeHtml(y.fraktion_navn)}</span>` : "") +
      `<span class="borger-liste__under">${escapeHtml(gaelder)} ${maerke}</span>`;
    ul.append(li);
  }
}

function renderBorgerEngangs(liste) {
  const ul = el("borger-engangs");
  ul.innerHTML = "";
  el("borger-engangs-tom").hidden = liste.length > 0;
  for (const eng of liste) {
    const li = document.createElement("li");
    li.className = "borger-liste__item";
    li.innerHTML =
      `<span class="borger-liste__navn">${escapeHtml(eng.ydelse_navn)}</span>` +
      (eng.fraktion_navn ? `<span class="borger-liste__under">${escapeHtml(eng.fraktion_navn)}</span>` : "") +
      `<span class="borger-liste__under">Antal: ${escapeHtml(String(eng.antal))} · ` +
      `Leveringsdato: ${escapeHtml(formaterDatoBorger(eng.leveringsdato))} · ${escapeHtml(eng.status.tekst)}</span>`;
    ul.append(li);
  }
}

function renderBorgerRegninger(liste) {
  const tbody = el("borger-regninger");
  tbody.innerHTML = "";
  el("borger-regninger-tom").hidden = liste.length > 0;
  for (const r of liste) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${escapeHtml(formaterDatoBorger(r.periode_fra))} – ${escapeHtml(formaterDatoBorger(r.periode_til))}</td>` +
      `<td>${formatOere(r.beloeb_total_oere)}</td>` +
      `<td>${escapeHtml(regningStatusBorger(r.status))}</td>`;
    tbody.append(tr);
  }
}

function renderBorgerSager(liste) {
  const ul = el("borger-sager");
  ul.innerHTML = "";
  el("borger-sager-tom").hidden = liste.length > 0;
  for (const s of liste) {
    const li = document.createElement("li");
    li.className = "borger-liste__item";
    const resultat = s.afgoerelse_resultat ? ` · Resultat: ${afgResultatBorger(s.afgoerelse_resultat)}` : "";
    li.innerHTML =
      `<span class="borger-liste__navn">${escapeHtml(s.sagstype_navn)}</span>` +
      (s.ansoegning_tekst ? `<span class="borger-liste__under">Ansøgt om: ${escapeHtml(s.ansoegning_tekst)}</span>` : "") +
      `<span class="borger-liste__under">Sagsnummer ${escapeHtml(s.sagsnummer)}</span>` +
      `<span class="borger-liste__under">Status: ${escapeHtml(sagStatusBorger(s.status))}${escapeHtml(resultat)}</span>` +
      `<span class="borger-liste__under">${escapeHtml(kanalBorger(s.kanal))}</span>`;
    ul.append(li);
  }
}

function renderBorgerKontakt(ejendom) {
  const c = el("borger-kontakt");
  c.innerHTML = "";
  const part = ejendom.min_part;
  if (!part) {
    c.innerHTML = '<p class="borger-tom">Der er ingen part knyttet til dig på denne adresse.</p>';
    return;
  }
  const rows =
    `<div><dt>Navn</dt><dd>${escapeHtml(rentNavn(part.navn))}</dd></div>` +
    `<div><dt>Type</dt><dd>${escapeHtml(parttypeTekst(part.parttype))}</dd></div>` +
    (part.cvr_nummer ? `<div><dt>CVR</dt><dd>${escapeHtml(part.cvr_nummer)}</dd></div>` : "") +
    `<div><dt>E-mail</dt><dd>${escapeHtml(part.email || "Ikke oplyst")}</dd></div>` +
    `<div><dt>Telefon</dt><dd>${escapeHtml(part.telefon || "Ikke oplyst")}</dd></div>`;
  const blok = document.createElement("dl");
  blok.className = "borger-kontakt__liste";
  blok.innerHTML = rows;
  const hjaelp = document.createElement("p");
  hjaelp.className = "borger-panel__hjaelp";
  hjaelp.textContent =
    "Navn og type kommer fra folkeregister/CVR og kan ikke rettes her. Du kan rette din e-mail og telefon.";
  const knap = document.createElement("button");
  knap.type = "button";
  knap.className = "knap knap--sekundaer";
  knap.textContent = "Ret e-mail og telefon";
  // Genbruger den eksisterende kontakt-dialog (samme validering og historik).
  knap.addEventListener("click", () => aabnKontaktDialog(part));
  c.append(blok, hjaelp, knap);
}

// --- Borgerens ansøgning (opretter KUN en sag) -------------------------------
let ansoegningskatalog = { arter: [], stoerrelser: [] };
async function indlaesAnsoegningskatalog() {
  try {
    ansoegningskatalog = await hentJson("/api/ansoegningskatalog");
  } catch {
    ansoegningskatalog = { arter: [], stoerrelser: [] };
  }
}

const ansoegDialog = el("ansoeg-dialog");
let ansoegForrigeFokus = null;

function aktuelBorgerEjendom() {
  return mineData.ejendomme.find((x) => x.id === borgerValgtEjendomId) || null;
}

function valgtAnsoegType() {
  return ansoegningskatalog.arter.find((a) => a.art === el("an-art").value) || null;
}

function fyldAnsoegArter() {
  const sel = el("an-art");
  sel.innerHTML = "";
  for (const a of ansoegningskatalog.arter) {
    const opt = document.createElement("option");
    opt.value = a.art;
    opt.textContent = a.navn;
    sel.append(opt);
  }
}

function opdaterAnsoegFelter() {
  const t = valgtAnsoegType();
  el("an-art-beskrivelse").textContent = t ? t.beskrivelse : "";
  const visStoerrelse = !!(t && t.kraever_stoerrelse);
  const visAntal = !!(t && t.fast_ydelsestype_id && !t.kraever_stoerrelse && !t.kraever_afmeld_valg);
  const visAfmeld = !!(t && t.kraever_afmeld_valg);
  el("an-stoerrelse-felt").hidden = !visStoerrelse;
  el("an-antal-felt").hidden = !visAntal;
  el("an-afmeld-felt").hidden = !visAfmeld;
  el("an-dato-label").textContent = visAfmeld
    ? "Ønsket ophørsdato"
    : visAntal
      ? "Ønsket leveringsdato"
      : "Ønsket startdato";

  if (visStoerrelse) {
    const sel = el("an-stoerrelse");
    sel.innerHTML = "";
    for (const s of ansoegningskatalog.stoerrelser) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.navn;
      sel.append(opt);
    }
  }
  if (visAfmeld) {
    const sel = el("an-afmeld");
    sel.innerHTML = "";
    const e = aktuelBorgerEjendom();
    const loeb = (e && e.loebende) || [];
    if (loeb.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Du har ingen faste ordninger at afmelde";
      sel.append(opt);
    } else {
      for (const y of loeb) {
        const opt = document.createElement("option");
        opt.value = y.id;
        opt.textContent = y.ydelse_navn;
        sel.append(opt);
      }
    }
  }
}

function aabnAnsoegDialog() {
  if (!borgerValgtEjendomId) return;
  ansoegForrigeFokus = document.activeElement;
  el("ansoeg-form").reset();
  fyldAnsoegArter();
  opdaterAnsoegFelter();
  el("ansoeg-dialog-fejl").hidden = true;
  saetFejl("an-stoerrelse", "an-stoerrelse-fejl", "");
  saetFejl("an-afmeld", "an-afmeld-fejl", "");
  ansoegDialog.showModal();
  el("an-art").focus();
}

el("borger-ansoeg-knap")?.addEventListener("click", aabnAnsoegDialog);
el("an-art").addEventListener("change", opdaterAnsoegFelter);
el("ansoeg-annuller").addEventListener("click", () => ansoegDialog.close());
// Tastatur/fokus: returnér fokus til knappen når dialogen lukkes.
ansoegDialog.addEventListener("close", () => {
  if (ansoegForrigeFokus && typeof ansoegForrigeFokus.focus === "function") ansoegForrigeFokus.focus();
});

el("ansoeg-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  el("ansoeg-dialog-fejl").hidden = true;
  saetFejl("an-stoerrelse", "an-stoerrelse-fejl", "");
  saetFejl("an-afmeld", "an-afmeld-fejl", "");
  const t = valgtAnsoegType();
  if (!t) return;
  const body = {
    art: t.art,
    oensket_startdato: el("an-dato").value || "",
    note: el("an-note").value || "",
  };
  if (t.kraever_stoerrelse) {
    const v = el("an-stoerrelse").value;
    if (!v) {
      saetFejl("an-stoerrelse", "an-stoerrelse-fejl", "Vælg en beholderstørrelse.");
      el("an-stoerrelse").focus();
      return;
    }
    body.ydelsestype_id = v;
  }
  if (t.fast_ydelsestype_id && !t.kraever_stoerrelse && !t.kraever_afmeld_valg) {
    body.antal = Number(el("an-antal").value) || 1;
  }
  if (t.kraever_afmeld_valg) {
    const v = el("an-afmeld").value;
    if (!v) {
      saetFejl("an-afmeld", "an-afmeld-fejl", "Vælg en ordning at afmelde.");
      el("an-afmeld").focus();
      return;
    }
    body.afmeld_ydelse_id = v;
  }
  try {
    await postJson(`/api/ejendomme/${encodeURIComponent(borgerValgtEjendomId)}/ansoegninger`, body);
    ansoegDialog.close();
    await indlaesMine();
    const bek = el("borger-ansoeg-bekraeft");
    bek.textContent = 'Din ansøgning er sendt. Du kan følge den under "Mine sager".';
    bek.hidden = false;
    setTimeout(() => {
      bek.hidden = true;
    }, 6000);
  } catch (e) {
    const f = el("ansoeg-dialog-fejl");
    f.textContent = e.message;
    f.hidden = false;
  }
});

// --- Mine sager: prioriteret sagsoverblik (kun sagsbehandler) ----------------
let overblikOmfang = "mine";
let overblikHastegrad = "";
let overblikKategori = "";

const HASTEGRAD_TEKST = { KRITISK: "Kritisk", HOEJ: "Høj", NORMAL: "Normal", AFVENTER: "Afventer" };
const OVERBLIK_KATEGORI_TEKST = {
  SELVBETJENING: "Selvbetjening",
  KLAGE: "Klage",
  UDLOEB_YDELSE: "Udløb af ydelse",
  BETALING: "Betaling",
  FRIST: "Frist",
  OEVRIGT: "Øvrigt",
};

function setAktivFane(knap, aktiv) {
  // Programmatisk markering (aria-current), ikke kun farve.
  if (aktiv) knap.setAttribute("aria-current", "true");
  else knap.removeAttribute("aria-current");
}

function visFane(fane, giveFokus = true) {
  const overblik = fane === "overblik";
  document.body.classList.toggle("visning-overblik", overblik);
  setAktivFane(el("fane-overblik"), overblik);
  setAktivFane(el("fane-ejendom"), !overblik);
  if (overblik) {
    if (giveFokus) el("sagsoverblik").focus();
    indlaesOverblik();
  }
}

function nulstilOverblikFiltre() {
  overblikOmfang = "mine";
  overblikHastegrad = "";
  overblikKategori = "";
  document.querySelectorAll(".omfang-knap").forEach((x) =>
    x.setAttribute("aria-pressed", String(x.getAttribute("data-omfang") === "mine"))
  );
  document.querySelectorAll(".noegletal-kort").forEach((x) => x.setAttribute("aria-pressed", "false"));
  document.querySelectorAll(".chip").forEach((x) =>
    x.setAttribute("aria-pressed", String(x.getAttribute("data-kategori") === ""))
  );
}

async function indlaesOverblik() {
  const fejl = el("overblik-fejl");
  fejl.hidden = true;
  const p = new URLSearchParams({ omfang: overblikOmfang });
  if (overblikHastegrad) p.set("hastegrad", overblikHastegrad);
  if (overblikKategori) p.set("kategori", overblikKategori);
  try {
    const data = await hentJson(`/api/sagsoverblik?${p.toString()}`);
    renderOverblikTotaler(data.totaler || {});
    renderAfdelingBadge(data.afdeling_ubehandlede || 0);
    renderOverblikTabel(data.poster || []);
  } catch (e) {
    fejl.textContent = `Overblikket kunne ikke hentes: ${e.message}`;
    fejl.hidden = false;
  }
}

// Rød boble med antal UBEHANDLEDE sager for hele afdelingen. Tallet gøres
// tilgængeligt for skærmlæsere via knappens aria-label (boblen er aria-hidden).
function renderAfdelingBadge(antal) {
  const badge = el("afdeling-badge");
  badge.textContent = String(antal);
  badge.hidden = antal === 0;
  badge.title = antal > 0 ? `${antal} ubehandlede sager i afdelingen` : "";
  el("omfang-alle").setAttribute(
    "aria-label",
    antal > 0
      ? `Hele afdelingen, ${antal} ubehandlede ${antal === 1 ? "sag" : "sager"}`
      : "Hele afdelingen"
  );
}

function renderOverblikTotaler(totaler) {
  for (const h of ["KRITISK", "HOEJ", "NORMAL", "AFVENTER"]) {
    el(`tal-${h}`).textContent = totaler[h] != null ? totaler[h] : 0;
  }
}

function renderOverblikTabel(poster) {
  const tbody = el("overblik-tabel");
  tbody.innerHTML = "";
  el("overblik-tom").hidden = poster.length > 0;
  for (const post of poster) {
    const tr = document.createElement("tr");
    tr.className = "overblik-raekke" + (post.hastegrad === "KRITISK" ? " overblik-raekke--kritisk" : "");
    const sagLabel = post.sagsnummer ? post.sagsnummer : "Systemsag";
    const ariaLabel = `Åbn ${sagLabel}: ${post.titel}`;
    tr.innerHTML =
      `<td><span class="hastegrad-pil hastegrad-${escapeHtml(post.hastegrad)}">${escapeHtml(HASTEGRAD_TEKST[post.hastegrad] || post.hastegrad)}</span></td>` +
      `<td class="overblik-titel-celle"><button type="button" class="sagknap" aria-label="${escapeHtml(ariaLabel)}">${escapeHtml(sagLabel)}</button>` +
      `<span class="undertekst">${escapeHtml(post.titel)}</span></td>` +
      `<td>${escapeHtml(OVERBLIK_KATEGORI_TEKST[post.kategori] || post.kategori)}</td>` +
      `<td>${escapeHtml(post.ejendom_adresse || post.ejendom_id)}${post.part_navn ? " · " + escapeHtml(rentNavn(post.part_navn)) : ""}</td>` +
      `<td class="overblik-frist-celle">${escapeHtml(post.fristtekst)}<span class="undertekst">${escapeHtml(post.fristdato)}</span></td>` +
      `<td>${post.kanal ? escapeHtml(kanalTekst(post.kanal)) : "—"}</td>`;
    const aabn = () => aabnSagFraOverblik(post);
    tr.querySelector(".sagknap").addEventListener("click", (ev) => {
      ev.stopPropagation();
      aabn();
    });
    tr.addEventListener("click", aabn);
    tbody.append(tr);
  }
}

async function aabnSagFraOverblik(post) {
  oensketSagId = post.sag_id || null;
  visFane("ejendom");
  await aabnEjendom(post.ejendom_id);
}

el("fane-ejendom").addEventListener("click", () => visFane("ejendom"));
el("fane-overblik").addEventListener("click", () => visFane("overblik"));

document.querySelectorAll(".omfang-knap").forEach((b) =>
  b.addEventListener("click", () => {
    overblikOmfang = b.getAttribute("data-omfang");
    document.querySelectorAll(".omfang-knap").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    indlaesOverblik();
  })
);

// Nøgletalskort = filter på hastegrad (klik igen fjerner filteret).
document.querySelectorAll(".noegletal-kort").forEach((kort) =>
  kort.addEventListener("click", () => {
    const h = kort.getAttribute("data-hastegrad");
    overblikHastegrad = overblikHastegrad === h ? "" : h;
    document.querySelectorAll(".noegletal-kort").forEach((x) =>
      x.setAttribute("aria-pressed", String(x.getAttribute("data-hastegrad") === overblikHastegrad))
    );
    indlaesOverblik();
  })
);

// Kategori-chips (enkeltvalg).
document.querySelectorAll(".chip").forEach((chip) =>
  chip.addEventListener("click", () => {
    overblikKategori = chip.getAttribute("data-kategori");
    document.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === chip)));
    indlaesOverblik();
  })
);

// --- Opstart -----------------------------------------------------------------
indlaesBrugere();
indlaesAnsoegningskatalog();
// Standardvisning for sagsbehandleren er "Mine sager" (uden at flytte fokus).
visFane("overblik", false);
indlaesRegisterEjendomme();
indlaesKatalog();
indlaesSagskatalog();
indlaesPartfelter();
