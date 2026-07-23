// Sagsbehandlerfladens klientlogik. Ren browser-JS uden framework.
// Henter data fra det lokale API og tegner ejendommens stamdata, part,
// materiel og et Leaflet-kort. Al DAWA-kommunikation sker på serveren.

"use strict";

const el = (id) => document.getElementById(id);

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
      "De geografiske oplysninger findes også i stamdata og materieltabellen.</p>";
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

  el("ejendom-adresse").textContent = e.adressetekst || "(uden adressetekst)";
  el("ejendom-kilde").textContent =
    kilde === "live"
      ? "Kilde: live-opslag i DAWA. Ejendommen er ikke oprettet i registret, så der vises ingen part eller materiel."
      : "Kilde: register (fiktiv demoejendom).";

  // Kontekstlinje
  el("kontekst").innerHTML =
    `Valgt ejendom: <strong>${escapeHtml(e.adressetekst)}</strong> · BFE ${escapeHtml(e.bfe_nummer)}`;

  // Stamdata
  const stamdata = el("stamdata");
  stamdata.innerHTML = "";
  const felter = [
    ["Adresse", e.adressetekst],
    ["Adresse-UUID", e.adresse_uuid],
    ["BFE-nummer", e.bfe_nummer],
    ["Kommunekode", e.kommunekode],
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

  // Materiel
  const tbody = el("materieltabel");
  tbody.innerHTML = "";
  const materiel = data.materiel || [];
  el("materiel-tom").hidden = materiel.length > 0;
  for (const m of materiel) {
    const tr = document.createElement("tr");
    const status = m.aktiv
      ? '<span class="status-aktiv">Aktiv</span>'
      : '<span class="status-inaktiv">Nedlagt</span>';
    tr.innerHTML =
      `<td>${escapeHtml(m.materieltype_navn)}</td>` +
      `<td>${m.volumen_liter} l</td>` +
      `<td>${escapeHtml((m.fraktioner || []).join("; "))}</td>` +
      `<td>${escapeHtml(m.standplads_beskrivelse || "—")}</td>` +
      `<td>${escapeHtml(m.gyldig_fra)}</td>` +
      `<td>${escapeHtml(m.gyldig_til || "—")}</td>` +
      `<td>${status}</td>`;
    tbody.append(tr);
  }

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

// --- Opstart -----------------------------------------------------------------
indlaesEjendomsliste();
