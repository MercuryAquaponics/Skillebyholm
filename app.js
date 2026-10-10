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
  maxZoom: 19
});
const baseStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri',
  maxZoom: 19
});
baseCarto.addTo(map);
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
  const hits = allMarkers.filter(({ place }) =>
    place.name.toLowerCase().includes(q) ||
    (getTranslation(place.name,'sv') || '').toLowerCase().includes(q) ||
    (getTranslation(place.name,'en') || '').toLowerCase().includes(q)
  ).slice(0, 12);

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
