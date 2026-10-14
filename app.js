// ─── LANG STATE ───────────────────────────────────────────────────────────────
let currentLang = 'sv';

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
  { 'Satellit': baseSat, 'Karta (CARTO)': baseCarto, 'Karta (OpenStreetMap)': baseOSM, 'Enkel karta': baseStreet },
  null,
  { position: 'bottomright' }
).addTo(map);

// ─── LAYER GROUPS ─────────────────────────────────────────────────────────────
const layerGroups = {};
LAYERS.forEach(l => { layerGroups[l.id] = L.layerGroup().addTo(map); });

// ─── MARKER CREATION ─────────────────────────────────────────────────────────
function makeIcon(color) {
  const isWhite = color === '#FFFFFF' || color === '#ffffff';
  const stroke = isWhite ? '#555' : 'white';
  const innerFill = isWhite ? '#555' : 'white';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 34" width="22" height="32">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="${innerFill}" fill-opacity="0.7"/>
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

function extractMarkerCode(rawName) {
  // Pure codes like R8, K4, B22 with nothing after = just a code, no plant name
  if (/^[A-Z]\d+$/.test(rawName.trim())) return { code: rawName.trim(), cleanName: null };
  // Leading number like "63 Cornus sanguinea..."
  const numMatch = rawName.match(/^(\d+\/?\d*)\s+(.+)/);
  if (numMatch) return { code: numMatch[1], cleanName: numMatch[2] };
  // Leading letter-code like "B2 Abies koreana..."
  const codeMatch = rawName.match(/^([A-Z]\d+)\s+(.+)/);
  if (codeMatch) return { code: codeMatch[1], cleanName: codeMatch[2] };
  // No code
  return { code: null, cleanName: rawName };
}

function buildPopupHTML(place) {
  const layer = LAYERS.find(l => l.id === place.layer);
  const isByggnader = place.layer === 'byggnader';

  if (isByggnader) {
    return `
      <div class="popup-inner">
        <div class="popup-layer-tag">${layer ? layer.tooltip[currentLang] : ''}</div>
        <div class="popup-name">${place.name}</div>
      </div>`;
  }

  const { code, cleanName } = extractMarkerCode(place.name);
  const svTrans = cleanName ? getTranslation(place.name, 'sv') : null;
  const enTrans = cleanName ? getTranslation(place.name, 'en') : null;

  let mainName, mainIsLatin;
  if (currentLang === 'sv' && svTrans) {
    mainName = svTrans; mainIsLatin = false;
  } else if (currentLang === 'en' && enTrans) {
    mainName = enTrans; mainIsLatin = false;
  } else {
    mainName = cleanName || place.name; mainIsLatin = true;
  }

  const markerLabel = currentLang === 'en' ? 'Marker' : 'Markör';

  const rows = [];
  if (!mainIsLatin && cleanName) {
    rows.push(`<span class="popup-latin-row"><span class="trans-label">Latin</span> <span class="trans-latin">${cleanName}</span></span>`);
  }
  if (currentLang !== 'sv') {
    rows.push(`<span class="popup-sv-row"><span class="trans-label">Svenska</span> ${svTrans ? svTrans : '<span class="todo">ej översatt ännu</span>'}</span>`);
  }
  if (currentLang !== 'en') {
    rows.push(`<span class="popup-en-row"><span class="trans-label">English</span> ${enTrans ? enTrans : '<span class="todo">not yet translated</span>'}</span>`);
  }
  if (code) {
    rows.push(`<span class="trans-label">${markerLabel}</span> ${code}`);
  }

  return `
    <div class="popup-inner">
      <div class="popup-layer-tag">${layer ? layer.tooltip[currentLang] : ''}</div>
      <div class="popup-name${mainIsLatin ? ' latin' : ''}">${mainName}</div>
      ${rows.length ? `<div class="popup-translations">${rows.join('<br>')}</div>` : ''}
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
  const color = place.color || LAYERS.find(l => l.id === place.layer)?.color || '#888';
  const icon = place.color ? makeIcon(place.color) : layerIconMap[place.layer];
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
  pill.dataset.layerId = layer.id;
  pill.innerHTML = `<input type="checkbox" checked>
    <span class="dot" style="background:${layer.color}"></span><span class="pill-label">${layer.pill.sv}</span>`;
  pill.title = layer.tooltip.sv;
  pill.querySelector('input').addEventListener('change', e => {
    if (e.target.checked) {
      map.addLayer(layerGroups[layer.id]);
      pill.classList.add('checked');
    } else {
      map.removeLayer(layerGroups[layer.id]);
      pill.classList.remove('checked');
    }
  });

  // ⊞ list button — stopPropagation so it doesn't toggle the checkbox
  const listBtn = document.createElement('button');
  listBtn.className = 'pill-list-btn';
  listBtn.textContent = '⊞';
  listBtn.title = 'Visa lista';
  listBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openListPanel(layer.id);
  });
  pill.appendChild(listBtn);
  panel.appendChild(pill);
});

// ─── LIST PANEL ───────────────────────────────────────────────────────────────
let currentListLayer = null;

function openListPanel(layerId) {
  const layer = LAYERS.find(l => l.id === layerId);
  currentListLayer = layerId;
  const isByggnader = layerId === 'byggnader';

  // Set title
  document.getElementById('list-panel-title').textContent = layer.tooltip[currentLang];

  // Narrow mode for buildings
  const panel = document.getElementById('list-panel');
  if (isByggnader) {
    panel.classList.add('narrow');
  } else {
    panel.classList.remove('narrow');
  }

  // Show/hide table header columns
  document.getElementById('col-latin').style.display = isByggnader ? 'none' : '';
  document.getElementById('col-sv').style.display = isByggnader ? 'none' : '';
  document.getElementById('col-en').style.display = isByggnader ? 'none' : '';
  document.getElementById('col-marker').style.display = isByggnader ? 'none' : '';

  // Build rows
  const entries = allMarkers
    .filter(({ place }) => place.layer === layerId && !place.removed)
    .map(({ place, marker }) => {
      const { code, cleanName } = extractMarkerCode(place.name);
      const latinName = cleanName || place.name;
      const svName = cleanName ? (getTranslation(place.name, 'sv') || '') : '';
      const enName = cleanName ? (getTranslation(place.name, 'en') || '') : '';
      return { latinName, svName, enName, code, marker, place };
    });

  // Deduplicate by latinName+code, sort alphabetically
  const seen = new Set();
  const unique = entries.filter(e => {
    const key = e.latinName + '|' + (e.code || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.latinName.localeCompare(b.latinName, 'sv'));

  const tbody = document.getElementById('list-tbody');
  tbody.innerHTML = '';
  unique.forEach(({ latinName, svName, enName, code, marker, place }) => {
    const tr = document.createElement('tr');
    if (isByggnader) {
      tr.innerHTML = `<td colspan="4">${latinName}</td>`;
    } else {
      tr.innerHTML = `
        <td class="latin list-col-latin">${latinName}</td>
        <td class="list-col-sv ${svName ? '' : 'todo'}">${svName || 'ej översatt'}</td>
        <td class="list-col-en ${enName ? '' : 'todo'}">${enName || 'not translated'}</td>
        <td class="marker">${code || '—'}</td>`;
    }
    tr.addEventListener('click', () => {
      map.setView(marker.getLatLng(), 19);
      marker.openPopup();
    });
    tbody.appendChild(tr);
  });

  updateListHeaders();
  document.getElementById('list-panel').classList.add('open');
  setTimeout(() => map.invalidateSize(), 310);
}

function closeListPanel() {
  document.getElementById('list-panel').classList.remove('open');
  currentListLayer = null;
  setTimeout(() => map.invalidateSize(), 310);
}

function updateListHeaders() {
  const markerLabel = currentLang === 'en' ? 'Marker' : 'Markör';
  document.getElementById('col-latin').textContent = 'Latin';
  document.getElementById('col-sv').textContent = 'Svenska';
  document.getElementById('col-en').textContent = 'English';
  document.getElementById('col-marker').textContent = markerLabel;
  if (currentListLayer) {
    const layer = LAYERS.find(l => l.id === currentListLayer);
    document.getElementById('list-panel-title').textContent = layer.tooltip[currentLang];
  }
}

// ─── LANGUAGE TOGGLE ─────────────────────────────────────────────────────────
const SEARCH_PLACEHOLDER = { sv: 'Sök växt…', en: 'Search plant…', latin: 'Quaere plantam…' };

function setLang(lang) {
  currentLang = lang;
  ['latin','sv','en'].forEach(l => {
    document.getElementById('btn-'+l).classList.toggle('active', l === lang);
  });
  // Update search placeholder
  document.getElementById('search').placeholder = SEARCH_PLACEHOLDER[lang];
  // Update layer pills and tooltips
  document.querySelectorAll('.layer-pill').forEach(pill => {
    const layer = LAYERS.find(l => l.id === pill.dataset.layerId);
    if (!layer) return;
    pill.querySelector('.pill-label').textContent = layer.pill[lang];
    pill.title = layer.tooltip[lang];
  });
  // Rebuild all popup content
  allMarkers.forEach(({ place, marker }) => {
    marker.setPopupContent(buildPopupHTML(place));
  });
  // Update list panel if open
  updateListHeaders();
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
let highlightedMarkers = [];

function makeHighlightIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 34" width="28" height="40">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${color}" stroke="#FFD700" stroke-width="3"/>
    <circle cx="12" cy="12" r="5" fill="white" fill-opacity="0.9"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -38] });
}

function clearHighlights() {
  highlightedMarkers.forEach(({ marker, originalIcon }) => marker.setIcon(originalIcon));
  highlightedMarkers = [];
}

function highlightAll(hits) {
  clearHighlights();
  if (!hits.length) return;
  const bounds = L.latLngBounds();
  hits.forEach(({ place, marker }) => {
    const layer = LAYERS.find(l => l.id === place.layer);
    highlightedMarkers.push({ marker, originalIcon: layerIconMap[place.layer] });
    marker.setIcon(makeHighlightIcon(layer ? layer.color : '#888'));
    bounds.extend(marker.getLatLng());
  });
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
}

function doSearch(query) {
  const box = document.getElementById('search-results');
  if (!query || query.length < 2) { box.style.display = 'none'; clearHighlights(); return; }
  const q = query.toLowerCase();
  const hits = allMarkers.filter(({ place }) => !place.removed && (
    place.name.toLowerCase().includes(q) ||
    (getTranslation(place.name,'sv') || '').toLowerCase().includes(q) ||
    (getTranslation(place.name,'en') || '').toLowerCase().includes(q)
  )).slice(0, 30);

  if (!hits.length) { box.style.display = 'none'; clearHighlights(); return; }

  const showAllBtn = hits.length > 1
    ? `<div class="search-show-all" id="show-all-btn">🔍 Visa alla (${hits.length})</div>`
    : '';

  box.innerHTML = showAllBtn + hits.map(({ place }, i) => {
    const sv = getTranslation(place.name, 'sv');
    const label = currentLang === 'sv' && sv ? sv : place.name;
    return `<div class="search-item" data-idx="${i}">${label}</div>`;
  }).join('');
  box.style.display = 'block';

  if (hits.length > 1) {
    document.getElementById('show-all-btn').addEventListener('click', () => {
      highlightAll(hits);
      box.style.display = 'none';
    });
  }

  box.querySelectorAll('.search-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const { place, marker } = hits[i];
      clearHighlights();
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

document.getElementById('search').addEventListener('input', e => {
  if (!e.target.value) clearHighlights();
});

// Initialise UI to default language
setLang('sv');

// ─── STUDY MENU ───────────────────────────────────────────────────────────────
const studyLangState = { latin: true, sv: true, en: true };

function openStudyMenu() {
  // Build layer picks dynamically
  const picks = document.getElementById('quiz-layer-picks');
  if (!picks.children.length) {
    LAYERS.filter(l => l.id !== 'byggnader').forEach(layer => {
      const lbl = document.createElement('label');
      lbl.className = 'study-toggle-pill active';
      lbl.innerHTML = `<input type="checkbox" value="${layer.id}" checked> ${layer.pill[currentLang]}`;
      lbl.querySelector('input').addEventListener('change', () => {
        lbl.classList.toggle('active', lbl.querySelector('input').checked);
      });
      picks.appendChild(lbl);
    });
  }
  // Sync radio pills
  document.querySelectorAll('[name="qcount"],[name="qlang"],[name="alang"],[name="qmode"]').forEach(radio => {
    const lbl = radio.closest('.study-toggle-pill');
    if (lbl) {
      radio.addEventListener('change', () => {
        document.querySelectorAll(`[name="${radio.name}"]`).forEach(r => {
          r.closest('.study-toggle-pill')?.classList.toggle('active', r.checked);
        });
      });
    }
  });
  document.getElementById('study-overlay').style.display = 'flex';
}

function closeStudyMenu() {
  document.getElementById('study-overlay').style.display = 'none';
}

function toggleStudyLang(lang, visible) {
  studyLangState[lang] = visible;
  const cls = `study-hide-${lang}`;
  document.body.classList.toggle(cls, !visible);
  document.getElementById(`stog-${lang}`).classList.toggle('active', visible);
  // Rebuild all popups so they respect hidden state
  allMarkers.forEach(({ place, marker }) => marker.setPopupContent(buildPopupHTML(place)));
}

// ─── QUIZ ENGINE ──────────────────────────────────────────────────────────────
let quizState = null;

function buildQuizPool(layerIds) {
  // Get all unique plants (by latinName) from chosen layers, excluding byggnader and unknown/pure-code
  const seen = new Set();
  const pool = [];
  allMarkers.forEach(({ place }) => {
    if (!layerIds.includes(place.layer)) return;
    const { cleanName } = extractMarkerCode(place.name);
    if (!cleanName) return;
    const latin = cleanName;
    const sv = getTranslation(place.name, 'sv');
    const en = getTranslation(place.name, 'en');
    // Need at least one translation to be quizzable
    if (!sv && !en) return;
    const key = latin.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ latin, sv: sv || '', en: en || '' });
  });
  return pool;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getPlantName(plant, lang) {
  if (lang === 'latin') return plant.latin;
  return plant[lang] || plant.latin;
}

function startQuiz() {
  const layerIds = [...document.querySelectorAll('#quiz-layer-picks input:checked')].map(i => i.value);
  if (!layerIds.length) { alert('Välj minst en samling!'); return; }

  const count = parseInt(document.querySelector('[name="qcount"]:checked').value);
  const qLang = document.querySelector('[name="qlang"]:checked').value;
  const aLang = document.querySelector('[name="alang"]:checked').value;
  const mode  = document.querySelector('[name="qmode"]:checked').value;

  const pool = buildQuizPool(layerIds);
  if (pool.length < 6) { alert('För få växter i vald samling (behövs minst 6)!'); return; }

  const questions = shuffle(pool).slice(0, Math.min(count, pool.length));

  quizState = {
    questions, qLang, aLang, mode,
    current: 0, correct: 0,
    answers: [], // { question, correctAnswer, userAnswer, wasCorrect }
    pool // for generating distractors
  };

  closeStudyMenu();
  document.getElementById('quiz-overlay').style.display = 'flex';
  document.getElementById('quiz-results').style.display = 'none';
  document.getElementById('quiz-inner').style.display = 'flex';
  renderQuestion();
}

function renderQuestion() {
  const { questions, current, correct, qLang, aLang, mode, pool } = quizState;
  const total = questions.length;
  const plant = questions[current];

  // Progress
  document.getElementById('quiz-progress-bar').style.width = `${(current / total) * 100}%`;
  document.getElementById('quiz-score-text').textContent = `${correct} / ${current}`;

  // Question label
  const langLabels = { latin: 'Latin', sv: 'Svenska', en: 'English' };
  document.getElementById('quiz-q-label').textContent =
    `Vad heter denna på ${langLabels[aLang]}? (${current + 1} / ${total})`;
  document.getElementById('quiz-question').textContent = getPlantName(plant, qLang);
  document.getElementById('quiz-question').style.fontStyle = qLang === 'latin' ? 'italic' : 'normal';

  document.getElementById('quiz-feedback').textContent = '';
  document.getElementById('quiz-feedback').className = '';
  document.getElementById('quiz-next-btn').style.display = 'none';

  const correctAnswer = getPlantName(plant, aLang);

  if (mode === 'multi') {
    document.getElementById('quiz-free-wrap').style.display = 'none';
    document.getElementById('quiz-choices').style.display = 'grid';

    // Pick 5 distractors from pool
    const others = shuffle(pool.filter(p => p.latin !== plant.latin))
      .slice(0, 5)
      .map(p => getPlantName(p, aLang));
    const choices = shuffle([correctAnswer, ...others]);

    const choicesEl = document.getElementById('quiz-choices');
    choicesEl.innerHTML = '';
    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = choice;
      btn.onclick = () => submitMultiChoice(choice, correctAnswer);
      choicesEl.appendChild(btn);
    });
  } else {
    document.getElementById('quiz-choices').style.display = 'none';
    document.getElementById('quiz-free-wrap').style.display = 'flex';
    const input = document.getElementById('quiz-free-input');
    input.value = '';
    input.className = '';
    input.disabled = false;
    document.getElementById('quiz-free-submit').disabled = false;
    setTimeout(() => input.focus(), 50);
  }
}

function submitMultiChoice(chosen, correct) {
  const isCorrect = chosen.trim().toLowerCase() === correct.trim().toLowerCase();
  recordAnswer(chosen, correct, isCorrect);

  // Highlight buttons
  document.querySelectorAll('.quiz-choice').forEach(btn => {
    btn.disabled = true;
    if (btn.textContent.trim().toLowerCase() === correct.trim().toLowerCase()) {
      btn.classList.add('correct');
    } else if (btn.textContent.trim() === chosen.trim() && !isCorrect) {
      btn.classList.add('wrong');
    }
  });

  showFeedback(isCorrect, correct);
}

function submitFreeAnswer() {
  const input = document.getElementById('quiz-free-input');
  const { questions, current, aLang } = quizState;
  const correct = getPlantName(questions[current], aLang);
  const chosen = input.value.trim();
  if (!chosen) return;

  const isCorrect = chosen.toLowerCase() === correct.toLowerCase();
  recordAnswer(chosen, correct, isCorrect);

  input.disabled = true;
  document.getElementById('quiz-free-submit').disabled = true;
  input.classList.add(isCorrect ? 'correct' : 'wrong');
  showFeedback(isCorrect, correct);
}

function recordAnswer(userAnswer, correctAnswer, wasCorrect) {
  const { questions, current, qLang } = quizState;
  if (wasCorrect) quizState.correct++;
  quizState.answers.push({
    question: getPlantName(questions[current], qLang),
    correctAnswer,
    userAnswer,
    wasCorrect
  });
}

function showFeedback(isCorrect, correct) {
  const fb = document.getElementById('quiz-feedback');
  if (isCorrect) {
    fb.textContent = '✓ Rätt!';
    fb.className = '';
  } else {
    fb.textContent = `✗ Rätt svar: ${correct}`;
    fb.className = 'wrong';
  }
  document.getElementById('quiz-next-btn').style.display = 'block';
}

function nextQuestion() {
  quizState.current++;
  if (quizState.current >= quizState.questions.length) {
    showResults();
  } else {
    renderQuestion();
  }
}

function showResults() {
  const { answers, correct, questions } = quizState;
  const total = questions.length;

  document.getElementById('quiz-inner').style.display = 'none';
  document.getElementById('quiz-results').style.display = 'flex';

  document.getElementById('quiz-results-score').textContent =
    `${correct} rätt av ${total} (${Math.round(correct/total*100)}%)`;

  const list = document.getElementById('quiz-results-list');
  list.innerHTML = '';
  answers.forEach(({ question, correctAnswer, userAnswer, wasCorrect }) => {
    const row = document.createElement('div');
    row.className = `result-row ${wasCorrect ? 'correct' : 'wrong'}`;
    row.innerHTML = `
      <span class="result-icon">${wasCorrect ? '✓' : '✗'}</span>
      <span class="result-q">${question}</span>
      <span class="result-a">${wasCorrect
        ? `<span class="correct-ans">${correctAnswer}</span>`
        : `${userAnswer} → <span class="correct-ans">${correctAnswer}</span>`
      }</span>`;
    list.appendChild(row);
  });
}

function exitQuiz() {
  document.getElementById('quiz-overlay').style.display = 'none';
  quizState = null;
}

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
  const KEY = 'skilleby-edits-v13';
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
