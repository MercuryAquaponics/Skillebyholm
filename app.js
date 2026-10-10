// ─── LANG STATE ───────────────────────────────────────────────────────────────
let currentLang = 'latin';

function extractLatinKey(rawName) {
  // Strip leading number/code and trailing suffixes like FK, E, fk, etc.
  let s = rawName.trim();
  s = s.replace(/^\d+\/?\d*\s+/, ''); // leading numbers
  s = s.replace(/^[A-Z]\d+\s+/, '');  // leading B-codes like B27
  s = s.replace(/^[KR]\d+$/, '');     // pure K4, R8 codes
  // Strip cultivar in quotes for lookup
  const base = s.replace(/'[^']*'/g, '').replace(/`[^`]*´/g, '').trim();
  // Strip trailing provenance codes
  const clean = base.replace(/\s+(FK|fk|E|ssp\.|var\.|f\.|x)\b.*/i, '').trim();
  return clean.toLowerCase();
}

function getTranslation(rawName, lang) {
  if (lang === 'latin') return null;
  const key = extractLatinKey(rawName);
  if (!key) return null;
  // Try direct match first, then partial
  for (const [k, v] of Object.entries(TRANSLATIONS)) {
    if (key.startsWith(k) || k.startsWith(key)) {
      return v[lang] || null;
    }
  }
  return null;
}

function getDisplayName(rawName, lang) {
  if (lang === 'latin') return rawName;
  const t = getTranslation(rawName, lang);
  return t || rawName; // fallback to latin if no translation
}

// ─── MAP INIT ─────────────────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true }).setView([59.0426, 17.608], 17);

const baseCarto = L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_4gc8_1_b373b5e4d77b2f6c1d83108e', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
  maxZoom: 21, maxNativeZoom: 19
});
const baseOSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
});
const baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri',
  maxZoom: 21, maxNativeZoom: 18
});
const baseStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri',
  maxZoom: 19
});
baseSat.addTo(map);
L.control.layers(
  { 'Karta (CARTO)': baseCarto, 'Karta (OpenStreetMap)': baseOSM, 'Satellit': baseSat, 'Enkel karta': baseStreet },
  null,
  { position: 'bottomright' }
).addTo(map);

// ─── LAYER GROUPS ─────────────────────────────────────────────────────────────
const layerGroups = {};
LAYERS.forEach(l => { layerGroups[l.id] = L.layerGroup().addTo(map); });

// ─── MARKER CREATION ─────────────────────────────────────────────────────────
function makeIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 34" width="22" height="32">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="white" fill-opacity="0.7"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [22, 32],
    iconAnchor: [11, 32],
    popupAnchor: [0, -30],
  });
}

const layerIconMap = {};
LAYERS.forEach(l => { layerIconMap[l.id] = makeIcon(l.color); });

// Markers array for search and lang updates
const allMarkers = [];

function buildPopupHTML(place) {
  const layer = LAYERS.find(l => l.id === place.layer);
  const svTrans = getTranslation(place.name, 'sv');
  const enTrans = getTranslation(place.name, 'en');
  return `
    <div class="popup-inner">
      <div class="popup-layer-tag">${layer ? layer.name : ''}</div>
      <div class="popup-name latin">${place.name}</div>
      <div class="popup-translations">
        🇸🇪 ${svTrans ? svTrans : '<span class="todo">ej översatt ännu</span>'}<br>
        🇬🇧 ${enTrans ? enTrans : '<span class="todo">not yet translated</span>'}
      </div>
    </div>`;
}

// ─── POSITION CORRECTION ─────────────────────────────────────────────────────
// Moves ALL pins together. Meters north (+) / east (+). Set these once aligned.
const OFFSET_NORTH_M = 0;
const OFFSET_EAST_M  = 0;
const M_LAT = 1 / 111320;                                   // degrees per meter (north)
const M_LNG = 1 / (111320 * Math.cos(59.042 * Math.PI / 180)); // degrees per meter (east)
function shifted(place, n, e) {
  return [place.lat + n * M_LAT, place.lng + e * M_LNG];
}

placesData.forEach(place => {
  const icon = layerIconMap[place.layer];
  const marker = L.marker(shifted(place, OFFSET_NORTH_M, OFFSET_EAST_M), { icon })
    .bindPopup(buildPopupHTML(place), { maxWidth: 300 });
  layerGroups[place.layer].addLayer(marker);
  allMarkers.push({ place, marker });
});

// ─── LAYER TOGGLE UI ─────────────────────────────────────────────────────────
const panel = document.getElementById('layer-panel');
LAYERS.forEach(layer => {
  const pill = document.createElement('label');
  pill.className = 'layer-pill checked';
  pill.innerHTML = `<input type="checkbox" checked>
    <span class="dot" style="background:${layer.color}"></span>${layer.name}`;
  pill.querySelector('input').addEventListener('change', e => {
    if (e.target.checked) {
      map.addLayer(layerGroups[layer.id]);
      pill.classList.add('checked');
    } else {
      map.removeLayer(layerGroups[layer.id]);
      pill.classList.remove('checked');
    }
  });
  panel.appendChild(pill);
});

// ─── LANGUAGE TOGGLE ─────────────────────────────────────────────────────────
function setLang(lang) {
  currentLang = lang;
  ['latin','sv','en'].forEach(l => {
    document.getElementById('btn-'+l).classList.toggle('active', l === lang);
  });
  // Update all open popups (they auto-update on next open since content is rebuilt)
  // Rebuild popup content for any already-open popups
  allMarkers.forEach(({ place, marker }) => {
    marker.setPopupContent(buildPopupHTML(place));
  });
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
function doSearch(query) {
  const box = document.getElementById('search-results');
  if (!query || query.length < 2) { box.style.display = 'none'; return; }
  const q = query.toLowerCase();
  const hits = allMarkers.filter(({ place }) => !place.removed && (
    place.name.toLowerCase().includes(q) ||
    (getTranslation(place.name,'sv') || '').toLowerCase().includes(q) ||
    (getTranslation(place.name,'en') || '').toLowerCase().includes(q)
  )).slice(0, 12);

  if (!hits.length) { box.style.display = 'none'; return; }
  box.innerHTML = hits.map(({ place }, i) => {
    const sv = getTranslation(place.name, 'sv');
    const label = currentLang === 'sv' && sv ? sv : place.name;
    return `<div class="search-item" data-idx="${i}">${label}</div>`;
  }).join('');
  box.style.display = 'block';

  box.querySelectorAll('.search-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const { place, marker } = hits[i];
      map.setView(marker.getLatLng(), 19);
      marker.openPopup();
      box.style.display = 'none';
      document.getElementById('search').value = '';
    });
  });
}

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) {
    document.getElementById('search-results').style.display = 'none';
  }
});

// ─── NUDGE TOOL (open the page with ?nudge at the end of the address) ────────
if (new URLSearchParams(location.search).has('nudge')) {
  let n = OFFSET_NORTH_M, e = OFFSET_EAST_M;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:10000;background:#f5f0e8;border:2px solid #3a5a40;border-radius:8px;padding:10px 12px;font:13px Lato,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3)';
  box.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">Flytta alla pins</div>
    <div style="display:grid;grid-template-columns:repeat(3,40px);gap:4px;justify-content:center">
      <span></span><button data-d="N">▲</button><span></span>
      <button data-d="W">◀</button><button data-d="0">⟲</button><button data-d="E">▶</button>
      <span></span><button data-d="S">▼</button><span></span>
    </div>
    <div style="margin:8px 0 4px">Steg:
      <select id="nudge-step"><option>0.5</option><option selected>1</option><option>3</option><option>10</option></select> m
    </div>
    <div id="nudge-out" style="font-weight:700"></div>`;
  document.body.appendChild(box);
  box.querySelectorAll('button').forEach(b => b.style.cssText = 'height:30px;cursor:pointer;font-size:14px');
  const out = box.querySelector('#nudge-out');
  function apply() {
    allMarkers.forEach(({ place, marker }) => marker.setLatLng(shifted(place, n, e)));
    out.textContent = `Norr ${n.toFixed(1)} m, Öst ${e.toFixed(1)} m`;
  }
  box.addEventListener('click', ev => {
    const d = ev.target.dataset.d; if (!d) return;
    const st = parseFloat(box.querySelector('#nudge-step').value);
    if (d === 'N') n += st; if (d === 'S') n -= st;
    if (d === 'E') e += st; if (d === 'W') e -= st;
    if (d === '0') { n = OFFSET_NORTH_M; e = OFFSET_EAST_M; }
    apply();
  });
  apply();
}

// ─── PIN EDITOR (open the page with ?edit at the end of the address) ─────────
// Drag pins, add new pins, remove pins. Changes are remembered in this browser
// only, until you download them and send them on. Do not use together with ?nudge.
if (new URLSearchParams(location.search).has('edit')) {
  const KEY = 'skilleby-edits';
  const orig = placesData.map(p => [p.lat, p.lng]);
  let st = { moved: {}, removed: [], added: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    st = raw.moved
      ? { moved: raw.moved, removed: raw.removed || [], added: raw.added || [] }
      : { moved: raw, removed: [], added: [] };   // older saved format
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  let nextId = Date.now();

  function setPos(entry, lat, lng) {
    entry.place.lat = lat; entry.place.lng = lng;
    entry.marker.setLatLng(shifted(entry.place, OFFSET_NORTH_M, OFFSET_EAST_M));
  }
  function removeEntry(entry) {
    layerGroups[entry.place.layer].removeLayer(entry.marker);
    entry.place.removed = true;
  }
  function wire(entry) {
    const { place, marker } = entry;
    marker.dragging.enable();
    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      place.lat = ll.lat - OFFSET_NORTH_M * M_LAT;
      place.lng = ll.lng - OFFSET_EAST_M * M_LNG;
      if (entry.addedId) {
        const a = st.added.find(x => x.id === entry.addedId);
        if (a) { a.lat = place.lat; a.lng = place.lng; }
      } else {
        st.moved[entry.idx] = [place.lat, place.lng];
      }
      save(); update();
    });
    marker.on('popupopen', e => {
      const inner = e.popup.getElement().querySelector('.popup-inner');
      if (!inner || inner.querySelector('.del-pin')) return;
      const b = document.createElement('button');
      b.className = 'del-pin';
      b.textContent = 'Ta bort pin';
      b.style.cssText = 'margin-top:8px;padding:4px 8px;cursor:pointer;color:#a00';
      b.onclick = () => {
        if (!confirm('Ta bort "' + place.name + '"?')) return;
        marker.closePopup();
        removeEntry(entry);
        if (entry.addedId) st.added = st.added.filter(x => x.id !== entry.addedId);
        else if (!st.removed.includes(entry.idx)) st.removed.push(entry.idx);
        save(); update();
      };
      inner.appendChild(b);
    });
  }
  function addEntry(rec) {
    const place = { layer: rec.layer, name: rec.name, lat: rec.lat, lng: rec.lng };
    const marker = L.marker(shifted(place, OFFSET_NORTH_M, OFFSET_EAST_M), { icon: layerIconMap[place.layer] })
      .bindPopup(buildPopupHTML(place), { maxWidth: 300 });
    layerGroups[place.layer].addLayer(marker);
    const entry = { place, marker, addedId: rec.id };
    allMarkers.push(entry);
    wire(entry);
    return entry;
  }

  // apply what was saved earlier
  allMarkers.forEach((entry, i) => { entry.idx = i; wire(entry); });
  Object.entries(st.moved).forEach(([i, [lat, lng]]) => { if (allMarkers[i]) setPos(allMarkers[i], lat, lng); });
  st.removed.forEach(i => { if (allMarkers[i]) removeEntry(allMarkers[i]); });
  st.added.forEach(addEntry);

  // panel
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:10000;background:#f5f0e8;border:2px solid #7c5c3e;border-radius:8px;padding:10px 12px;font:13px Lato,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3);width:250px';
  box.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">Redigera pins</div>
    <div style="margin-bottom:8px">Dra en pin för att flytta den. Klicka på en pin för att ta bort den.</div>
    <div style="border-top:1px solid #c8b99a;padding-top:8px;margin-bottom:8px">
      <select id="ed-layer" style="width:100%;margin-bottom:4px">${LAYERS.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}</select>
      <input id="ed-name" placeholder="Namn, t.ex. 12 Syringa vulgaris" style="width:100%;margin-bottom:4px;padding:3px">
      <button id="ed-add" style="width:100%">Lägg till pin</button>
    </div>
    <div id="ed-count" style="margin-bottom:6px;font-weight:700"></div>
    <button id="ed-copy">Kopiera ändringar</button>
    <button id="ed-dl">Ladda ner</button>
    <button id="ed-reset">Ångra alla</button>`;
  document.body.appendChild(box);
  box.querySelectorAll('button').forEach(b => { b.style.padding = '4px 8px'; b.style.cursor = 'pointer'; b.style.margin = '2px 2px 0 0'; });
  const layerSel = box.querySelector('#ed-layer');
  const nameIn = box.querySelector('#ed-name');
  const addBtn = box.querySelector('#ed-add');

  let adding = false;
  function setAdding(v) {
    adding = v;
    map.getContainer().style.cursor = v ? 'crosshair' : '';
    addBtn.textContent = v ? 'Klicka på kartan… (avbryt)' : 'Lägg till pin';
  }
  addBtn.onclick = () => {
    if (adding) return setAdding(false);
    if (!nameIn.value.trim()) return alert('Skriv ett namn först.');
    setAdding(true);
  };
  map.on('click', ev => {
    if (!adding) return;
    const rec = {
      id: ++nextId,
      layer: layerSel.value,
      name: nameIn.value.trim(),
      lat: ev.latlng.lat - OFFSET_NORTH_M * M_LAT,
      lng: ev.latlng.lng - OFFSET_EAST_M * M_LNG,
    };
    st.added.push(rec);
    addEntry(rec);
    save(); update();
    setAdding(false);
    nameIn.value = '';
  });

  function update() {
    box.querySelector('#ed-count').textContent =
      `${Object.keys(st.moved).length} flyttade, ${st.added.length} tillagda, ${st.removed.length} borttagna`;
  }
  function report() {
    const moved = Object.entries(st.moved)
      .filter(([i]) => !st.removed.includes(+i))
      .map(([i, [lat, lng]]) => ({ index: +i, layer: placesData[i].layer, name: placesData[i].name,
        old: orig[i], new: [+lat.toFixed(7), +lng.toFixed(7)] }));
    const removed = st.removed.map(i => ({ index: i, layer: placesData[i].layer, name: placesData[i].name }));
    const added = st.added.map(a => ({ layer: a.layer, name: a.name, lat: +a.lat.toFixed(7), lng: +a.lng.toFixed(7) }));
    return JSON.stringify({ moved, added, removed }, null, 1);
  }
  box.querySelector('#ed-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(report()); alert('Kopierat! Klistra in det i chatten.'); }
    catch (e) { alert('Kunde inte kopiera. Använd Ladda ner i stället.'); }
  };
  box.querySelector('#ed-dl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([report()], { type: 'application/json' }));
    a.download = 'skilleby-pinnar-andringar.json';
    a.click();
  };
  box.querySelector('#ed-reset').onclick = () => {
    if (!confirm('Ångra ALLA ändringar (flyttade, tillagda och borttagna)?')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };
  update();
}
