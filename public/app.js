// Sagsbehandlerfladens klientlogik. Ren browser-JS uden framework.
// Henter data fra det lokale API og tegner ejendommens stamdata, part,
// materiel og et Leaflet-kort. Al DAWA-kommunikation sker på serveren.

"use strict";

const el = (id) => document.getElementById(id);

// Aktuel valgt register-ejendom (null for live-adresser uden for registret).
let valgtEjendomId = null;
// Kodelister til tilføj-dialogen (ydelsestyper, bindingsperioder, takster).
let katalog = { ydelsestyper: [], bindingsperioder: [], takster: [] };

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

  // Summary-linjer viser den vigtigste værdi, så panelernes indhold kan ses uden at folde ud.
  el("stamdata-adresse").textContent = e.adressetekst || "";
  el("part-navn-summary").textContent = partNavn ? `${partNavn} (fiktiv)` : "Ingen part";
  // Begge paneler er foldet SAMMEN som udgangspunkt ved hvert nyt opslag.
  el("stamdata-details").open = false;
  el("part-details").open = false;

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

  // Parter
  const parterEl = el("parter");
  parterEl.innerHTML = "";
  if (!data.parter || data.parter.length === 0) {
    const p = document.createElement("p");
    p.className = "tomtilstand";
    p.textContent = "Ingen part tilknyttet i registret.";
    parterEl.append(p);
  } else {
    for (const part of data.parter) {
      const kort = document.createElement("div");
      kort.className = "partkort";
      const navnHtml =
        `<span class="partkort__navn">${escapeHtml(rentNavn(part.navn))}</span>` +
        `<span class="fiktiv-badge">fiktiv</span>`;
      const meta = [
        parttypeTekst(part.parttype),
        `Rolle: ${escapeHtml((part.roller || []).join(", "))}`,
        part.cvr_nummer ? `CVR ${escapeHtml(part.cvr_nummer)}` : null,
        part.email ? escapeHtml(part.email) : null,
        part.telefon ? `Tlf. ${escapeHtml(part.telefon)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      kort.innerHTML = `<div>${navnHtml}</div><div class="partkort__meta">${meta}</div>`;
      parterEl.append(kort);
    }
  }

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
  const svar = await fetch(url);
  const data = await svar.json().catch(() => ({}));
  if (!svar.ok) {
    const err = new Error(data.fejl || `Serverfejl (${svar.status}).`);
    err.detalje = data.detalje;
    throw err;
  }
  return data;
}

async function aabnEjendom(id, knap) {
  try {
    const data = await hentJson(`/api/ejendomme/${encodeURIComponent(id)}`);
    markerAktiv(knap);
    visEjendom(data, "register");
  } catch (e) {
    visSoegefejl(e.message);
  }
}

function markerAktiv(knap) {
  document
    .querySelectorAll(".ejendomsliste button[aria-current='true']")
    .forEach((b) => b.removeAttribute("aria-current"));
  if (knap) knap.setAttribute("aria-current", "true");
}

// --- Venstremenu -------------------------------------------------------------
async function indlaesEjendomsliste() {
  const liste = el("ejendomsliste");
  try {
    const data = await hentJson("/api/ejendomme");
    liste.innerHTML = "";
    for (const e of data.ejendomme) {
      const li = document.createElement("li");
      const knap = document.createElement("button");
      knap.type = "button";
      knap.innerHTML =
        `<span class="li-adresse">${escapeHtml(e.adressetekst)}</span>` +
        `<span class="li-part">${escapeHtml(rentNavn(e.part_navn || "—"))} · BFE ${escapeHtml(e.bfe_nummer)}</span>`;
      knap.addEventListener("click", () => aabnEjendom(e.id, knap));
      li.append(knap);
      liste.append(li);
    }
  } catch (e) {
    liste.innerHTML = `<li class="tomtilstand">Kunne ikke indlæse ejendomme: ${escapeHtml(e.message)}</li>`;
  }
}

// --- Adressesøgning med autocomplete (ARIA combobox) -------------------------
const soegefelt = el("soegefelt");
const forslagsliste = el("forslagsliste");
const soegefejl = el("soegefejl");
let forslag = [];
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

function lukForslag() {
  forslagsliste.hidden = true;
  forslagsliste.innerHTML = "";
  soegefelt.setAttribute("aria-expanded", "false");
  soegefelt.removeAttribute("aria-activedescendant");
  forslag = [];
  aktivtIndeks = -1;
}

function tegnForslag() {
  forslagsliste.innerHTML = "";
  if (forslag.length === 0) {
    lukForslag();
    return;
  }
  forslag.forEach((f, i) => {
    const li = document.createElement("li");
    li.id = `forslag-${i}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === aktivtIndeks));
    li.innerHTML =
      escapeHtml(f.adressetekst) +
      (f.kendt_ejendom_id ? '<span class="forslag__kendt">i registret</span>' : "");
    li.addEventListener("mousedown", (ev) => {
      ev.preventDefault(); // bevar fokus i inputfeltet
      vaelgForslag(i);
    });
    forslagsliste.append(li);
  });
  forslagsliste.hidden = false;
  soegefelt.setAttribute("aria-expanded", "true");
  if (aktivtIndeks >= 0) {
    soegefelt.setAttribute("aria-activedescendant", `forslag-${aktivtIndeks}`);
  } else {
    soegefelt.removeAttribute("aria-activedescendant");
  }
}

async function soeg(q) {
  if (q.trim().length < 2) {
    lukForslag();
    return;
  }
  try {
    visSoegefejl("");
    const data = await hentJson(`/api/adresse/soeg?q=${encodeURIComponent(q)}`);
    forslag = data.forslag || [];
    aktivtIndeks = -1;
    if (forslag.length === 0) {
      forslagsliste.innerHTML = '<li class="tomtilstand" style="padding:.45rem .6rem">Ingen adresser fundet.</li>';
      forslagsliste.hidden = false;
      soegefelt.setAttribute("aria-expanded", "true");
    } else {
      tegnForslag();
    }
  } catch (e) {
    lukForslag();
    visSoegefejl(
      e.detalje ? `${e.message} (${e.detalje})` : e.message || "Adresseopslaget kunne ikke gennemføres."
    );
  }
}

async function vaelgForslag(i) {
  const valgt = forslag[i];
  if (!valgt) return;
  soegefelt.value = valgt.adressetekst;
  lukForslag();
  try {
    if (valgt.kendt_ejendom_id) {
      const data = await hentJson(`/api/ejendomme/${encodeURIComponent(valgt.kendt_ejendom_id)}`);
      markerAktiv(null);
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
      markerAktiv(null);
      visEjendom(data, data.kilde || "live");
    }
  } catch (e) {
    visSoegefejl(e.detalje ? `${e.message} (${e.detalje})` : e.message);
  }
}

soegefelt.addEventListener("input", () => {
  clearTimeout(debounceId);
  const q = soegefelt.value;
  debounceId = setTimeout(() => soeg(q), 250);
});

soegefelt.addEventListener("keydown", (ev) => {
  if (forslagsliste.hidden || forslag.length === 0) return;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    aktivtIndeks = (aktivtIndeks + 1) % forslag.length;
    tegnForslag();
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    aktivtIndeks = (aktivtIndeks - 1 + forslag.length) % forslag.length;
    tegnForslag();
  } else if (ev.key === "Enter") {
    if (aktivtIndeks >= 0) {
      ev.preventDefault();
      vaelgForslag(aktivtIndeks);
    }
  } else if (ev.key === "Escape") {
    lukForslag();
  }
});

soegefelt.addEventListener("blur", () => {
  // Luk lidt forsinket, så et klik på et forslag når at blive registreret.
  setTimeout(lukForslag, 150);
});

el("soegeform").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (aktivtIndeks >= 0) {
    vaelgForslag(aktivtIndeks);
  } else {
    soeg(soegefelt.value);
  }
});

// --- Ydelser: to adskilte tabeller + varslinger ------------------------------
async function postJson(url, body) {
  const svar = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
    let handling = "";
    if (y.kan_forny) {
      handling =
        `<button type="button" class="tabelknap" data-forny="${escapeHtml(y.id)}">Forny</button>` +
        `<button type="button" class="tabelknap tabelknap--sekundaer" data-varsl="${escapeHtml(y.id)}">Varsl part</button>`;
    } else {
      handling = "—";
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
  if (naeste) {
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
    // Behold valgt sag hvis den stadig findes, ellers vælg den første.
    const stadig = sager.find((s) => s.sag.id === valgtSagId);
    if (stadig) renderSagDetalje(stadig);
    else if (sager.length > 0) vaelgSag(sager[0].sag.id);
    else el("sag-detalje").innerHTML = '<p class="tomtilstand">Ingen sager. Opret en sag med "+ Opret sag".</p>';
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
    b.innerHTML =
      `<span class="nr">${escapeHtml(s.sag.sagsnummer)}</span>` +
      `<span class="undertekst">${escapeHtml(s.sagstype_navn)} · ${(SAG_STATUS[s.sag.status] || {}).tekst || s.sag.status}</span>`;
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
    `<dt>Modtaget</dt><dd>${escapeHtml(sag.modtaget_dato)}</dd>` +
    `<dt>Frist</dt><dd>${escapeHtml(sag.frist_dato)}</dd>` +
    `<dt>Ansvarlig</dt><dd>${escapeHtml(sag.ansvarlig_bruger || "—")}</dd>` +
    (sag.lukket_dato ? `<dt>Lukket</dt><dd>${escapeHtml(sag.lukket_dato)}</dd>` : "") +
    `</dl>`;

  // Statushandlinger (næste skridt) + træf afgørelse.
  const naeste = {
    MODTAGET: ["UNDER_BEHANDLING", "Start behandling"],
    UNDER_BEHANDLING: ["PARTSHOERING", "Send i partshøring"],
    PARTSHOERING: ["UNDER_BEHANDLING", "Tilbage til behandling"],
    AFGJORT: ["LUKKET", "Luk sag"],
  }[sag.status];
  html += `<div class="opk-handling">`;
  if (naeste) html += `<button type="button" class="knap knap--sekundaer" data-sagstatus="${naeste[0]}">${naeste[1]}</button>`;
  if (sag.status !== "AFGJORT" && sag.status !== "LUKKET") html += `<button type="button" class="knap" data-afgoerelse="1">Træf afgørelse</button>`;
  html += `</div>`;

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

  // Journalnotater (append-only) + tilføj
  html += `<h3>Journalnotater <span class="hjaelptekst" style="color:var(--tekst-daempet)">(kan ikke redigeres/slettes)</span></h3>`;
  for (const j of s.journal) {
    html += `<div class="journal">${escapeHtml(j.tekst)}<div class="meta">${escapeHtml(j.oprettet)} · ${escapeHtml(j.oprettet_af)}</div></div>`;
  }
  html +=
    `<div class="notat-tilfoej">` +
    `<label class="visuelt-skjult" for="nyt-notat">Nyt journalnotat</label>` +
    `<input id="nyt-notat" type="text" placeholder="Tilføj journalnotat…" />` +
    `<button type="button" class="knap knap--sekundaer" id="tilfoej-notat">Tilføj notat</button>` +
    `</div>`;

  el("sag-detalje").innerHTML = html;

  // Bind handlinger
  el("sag-detalje").querySelectorAll("[data-sagstatus]").forEach((b) =>
    b.addEventListener("click", () => skiftSagStatusUI(sag.id, b.getAttribute("data-sagstatus")))
  );
  const afgBtn = el("sag-detalje").querySelector("[data-afgoerelse]");
  if (afgBtn) afgBtn.addEventListener("click", () => aabnAfgoerelse(sag.id));
  el("tilfoej-notat")?.addEventListener("click", () => tilfoejNotat(sag.id));
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

// --- Opstart -----------------------------------------------------------------
indlaesEjendomsliste();
indlaesKatalog();
indlaesSagskatalog();
