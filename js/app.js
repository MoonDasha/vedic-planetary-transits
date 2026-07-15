import { TransitPlayback } from './animation.js';
import { TransitChart } from './chart.js';
import { NorthIndianTransitChart } from './north-indian-chart.js?v=20260715-4';
import { SouthIndianTransitChart } from './south-indian-chart.js?v=20260715-1';
import { YEAR_MAX, YEAR_MIN } from './constants.js?v=20260715-1';
import { EphemerisError, loadEphemerisYear } from './ephemeris.js';
import {
  escapeHtml,
  formatDate,
  formatLongitude,
  formatWithinSign,
  getNakshatraPosition,
  getZodiacPosition,
} from './utils.js';

const elements = {
  svg: document.querySelector('#transit-wheel'),
  northSvg: document.querySelector('#north-indian-chart'),
  southSvg: document.querySelector('#south-indian-chart'),
  tooltip: document.querySelector('#planet-tooltip'),
  year: document.querySelector('#year-select'),
  chartYear: document.querySelector('#chart-year'),
  play: document.querySelector('#play-button'),
  pause: document.querySelector('#pause-button'),
  previous: document.querySelector('#previous-button'),
  next: document.querySelector('#next-button'),
  restart: document.querySelector('#restart-button'),
  end: document.querySelector('#end-button'),
  slider: document.querySelector('#date-slider'),
  speed: document.querySelector('#speed-select'),
  trails: document.querySelector('#trails-toggle'),
  outerPlanets: document.querySelector('#outer-planets-toggle'),
  currentDate: document.querySelector('#current-date'),
  ascendant: document.querySelector('#ascendant-select'),
  northMotionInputs: document.querySelectorAll('input[name="north-motion"]'),
  southAscendant: document.querySelector('#south-ascendant-select'),
  southMotionInputs: document.querySelectorAll('input[name="south-motion"]'),
  wheelTab: document.querySelector('#wheel-tab'),
  northTab: document.querySelector('#north-tab'),
  southTab: document.querySelector('#south-tab'),
  wheelPanel: document.querySelector('#wheel-panel'),
  northPanel: document.querySelector('#north-panel'),
  southPanel: document.querySelector('#south-panel'),
  orientationText: document.querySelector('#orientation-text'),
  positionsDate: document.querySelector('#positions-date'),
  positionsBody: document.querySelector('#positions-table-body'),
  dayIndex: document.querySelector('#day-index'),
  recordCount: document.querySelector('#record-count'),
  playbackStatus: document.querySelector('#playback-status'),
  loading: document.querySelector('#loading-state'),
  loadingMessage: document.querySelector('#loading-message'),
  error: document.querySelector('#error-state'),
  errorMessage: document.querySelector('#error-message'),
  retry: document.querySelector('#retry-button'),
  details: document.querySelector('#selected-details'),
  emptyDetails: document.querySelector('#empty-details'),
  theme: document.querySelector('#theme-toggle'),
  themeIcon: document.querySelector('.theme-icon'),
  themeLabel: document.querySelector('.theme-label'),
};

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const darkThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
let currentDataset = null;
let selectedBodyId = null;
let loading = false;
let loadSequence = 0;
let initialAutoplayPending = true;
const OUTER_BODY_IDS = ['uranus', 'neptune', 'pluto'];

const chart = new TransitChart(elements.svg, elements.tooltip, {
  onSelect: selectBody,
  onDeselect: clearSelection,
});
const northChart = new NorthIndianTransitChart(elements.northSvg, {
  onSelect: selectBody,
  onDeselect: clearSelection,
});
const southChart = new SouthIndianTransitChart(elements.southSvg, {
  onSelect: selectBody,
  onDeselect: clearSelection,
});

const playback = new TransitPlayback({
  reducedMotion: reducedMotionQuery.matches,
  onFrame(fromRecord, toRecord, progress, index) {
    chart.renderFrame(fromRecord, toRecord, progress);
    northChart.renderFrame(fromRecord, toRecord, progress);
    southChart.renderFrame(fromRecord, toRecord, progress);
    renderTrails(index);
  },
  onStep(index, record) {
    updateDateInterface(index, record);
    northChart.renderRecord(record);
    southChart.renderRecord(record);
    updatePositionsTable(record);
    updateSelectedDetails(record);
    renderTrails(index);
  },
  onStateChange(isPlaying) {
    updatePlaybackState(isPlaying);
  },
});

function populateYears() {
  const currentYear = Math.min(YEAR_MAX, Math.max(YEAR_MIN, new Date().getFullYear()));
  for (let year = YEAR_MIN; year <= YEAR_MAX; year += 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    option.selected = year === currentYear;
    elements.year.append(option);
  }
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  elements.theme.setAttribute('aria-pressed', String(dark));
  elements.theme.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
  elements.themeIcon.textContent = dark ? '☀' : '☾';
  elements.themeLabel.textContent = dark ? 'Light' : 'Dark';
  if (persist) localStorage.setItem('transit-theme', theme);
}

function initializeTheme() {
  const stored = localStorage.getItem('transit-theme');
  applyTheme(stored === 'light' || stored === 'dark' ? stored : darkThemeQuery.matches ? 'dark' : 'light');
}

async function loadYear(year) {
  const requestId = ++loadSequence;
  playback.pause();
  setLoading(true, `Loading ${year} daily positions…`);
  elements.error.hidden = true;
  elements.positionsDate.textContent = '—';
  elements.positionsBody.replaceChildren();
  elements.chartYear.textContent = String(year);

  try {
    const dataset = await loadEphemerisYear(year);
    if (requestId !== loadSequence) return;
    currentDataset = dataset;
    chart.setBodies(dataset.bodies);
    northChart.setBodies(dataset.bodies);
    southChart.setBodies(dataset.bodies);
    const hiddenBodyIds = elements.outerPlanets.checked ? [] : OUTER_BODY_IDS;
    chart.setHiddenBodyIds(hiddenBodyIds);
    northChart.setHiddenBodyIds(hiddenBodyIds);
    southChart.setHiddenBodyIds(hiddenBodyIds);
    if (!dataset.bodies.some((body) => body.id === selectedBodyId)) {
      selectedBodyId = null;
    }
    chart.setSelectedBody(selectedBodyId);
    northChart.setSelectedBody(selectedBodyId);
    southChart.setSelectedBody(selectedBodyId);
    elements.slider.max = String(Math.max(0, dataset.records.length - 1));
    elements.currentDate.min = dataset.records[0].date;
    elements.currentDate.max = dataset.records.at(-1).date;
    elements.recordCount.textContent = `${dataset.records.length} records`;
    playback.setRecords(dataset.records);
    if (selectedBodyId) updateSelectedDetails(dataset.records[0]);

    setLoading(false);
    if (initialAutoplayPending) {
      initialAutoplayPending = false;
      playback.play();
    }
  } catch (error) {
    if (requestId !== loadSequence) return;
    currentDataset = null;
    setLoading(false);
    showError(error, year);
  }
}

function setLoading(isLoading, message = '') {
  loading = isLoading;
  elements.loading.hidden = !isLoading;
  if (message) elements.loadingMessage.textContent = message;
  document.querySelector('.chart-panel').setAttribute('aria-busy', String(isLoading));
  updateControlAvailability();
}

function showError(error, year) {
  console.error('[ephemeris]', error);
  const message = error instanceof EphemerisError
    ? error.message
    : `Unable to load ephemeris data for ${year}. Please verify the corresponding JSON file and try again.`;
  elements.errorMessage.textContent = message;
  elements.error.hidden = false;
  updateControlAvailability();
}

function updateControlAvailability() {
  const noData = !currentDataset?.records.length;
  elements.year.disabled = loading;
  elements.play.disabled = loading || noData || playback.index >= (currentDataset?.records.length ?? 1) - 1 || playback.playing;
  elements.pause.disabled = loading || noData || !playback.playing;
  elements.previous.disabled = loading || noData || playback.index <= 0;
  elements.restart.disabled = elements.previous.disabled;
  elements.next.disabled = loading || noData || playback.index >= (currentDataset?.records.length ?? 1) - 1;
  elements.end.disabled = elements.next.disabled;
  elements.slider.disabled = loading || noData;
  elements.speed.disabled = loading || noData;
  elements.trails.disabled = loading || noData;
  elements.outerPlanets.disabled = loading || noData;
  elements.currentDate.disabled = loading || noData;
  elements.ascendant.disabled = loading || noData;
  elements.northMotionInputs.forEach((input) => { input.disabled = loading || noData; });
  elements.southAscendant.disabled = loading || noData;
  elements.southMotionInputs.forEach((input) => { input.disabled = loading || noData; });
}

function updateDateInterface(index, record) {
  if (!record || !currentDataset) return;
  elements.slider.value = String(index);
  elements.slider.setAttribute('aria-valuetext', `${formatDate(record.date)}, day ${index + 1} of ${currentDataset.records.length}`);
  elements.currentDate.value = record.date;
  elements.dayIndex.textContent = `Day ${index + 1} of ${currentDataset.records.length}`;
  chart.setCenterReadout(record, playback.playing, index, currentDataset.records.length);
  updateControlAvailability();
}

function updatePlaybackState(isPlaying) {
  elements.playbackStatus.textContent = isPlaying ? 'Playing' : 'Paused';
  elements.playbackStatus.classList.toggle('is-playing', isPlaying);
  elements.play.hidden = isPlaying;
  elements.pause.hidden = !isPlaying;
  const record = currentDataset?.records[playback.index];
  if (record) chart.setCenterReadout(record, isPlaying, playback.index, currentDataset.records.length);
  updateControlAvailability();
}

function updatePositionsTable(record) {
  if (!record || !currentDataset) return;
  elements.positionsDate.textContent = formatDate(record.date, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const fragment = document.createDocumentFragment();
  currentDataset.bodies.forEach((config) => {
    const planet = record.planets[config.id];
    if (!planet) return;

    const zodiac = getZodiacPosition(planet.longitude);
    const nakshatra = getNakshatraPosition(planet.longitude);
    const motionLabel = planet.motion === 'retrograde'
      ? 'Retrograde'
      : planet.motion === 'stationary' ? 'Stationary' : 'Direct';
    const row = document.createElement('tr');

    const planetCell = document.createElement('td');
    planetCell.dataset.label = 'Planet name';
    const planetWrap = document.createElement('span');
    planetWrap.className = 'table-planet';
    if (config.iconPath) {
      const icon = document.createElement('img');
      icon.src = config.iconPath;
      icon.alt = '';
      icon.addEventListener('error', () => icon.remove(), { once: true });
      planetWrap.append(icon);
    }
    const planetName = document.createElement('strong');
    planetName.textContent = config.displayName;
    planetWrap.append(planetName);
    planetCell.append(planetWrap);
    row.append(planetCell);

    const values = [
      ['Degrees', `${zodiac.degreesWithinSign.toFixed(2)}°`],
      ['Sign', zodiac.sign.name],
      ['Nakshatra', nakshatra.nakshatra.name],
      ['Pada', String(nakshatra.pada)],
      ['Speed', `${planet.speed >= 0 ? '+' : ''}${planet.speed.toFixed(3)}°/day`],
      ['Motion', motionLabel],
      ['Degrees Absolute', `${planet.longitude.toFixed(2)}°`],
    ];
    values.forEach(([label, value]) => {
      const cell = document.createElement('td');
      cell.dataset.label = label;
      if (label === 'Motion') {
        const badge = document.createElement('span');
        badge.className = `table-motion ${planet.motion}`;
        badge.textContent = value;
        cell.append(badge);
      } else {
        cell.textContent = value;
      }
      row.append(cell);
    });
    fragment.append(row);
  });
  elements.positionsBody.replaceChildren(fragment);
}

function selectBody(bodyId) {
  if (!currentDataset?.bodies.some((body) => body.id === bodyId)) return;
  selectedBodyId = bodyId;
  chart.setSelectedBody(bodyId);
  northChart.setSelectedBody(bodyId);
  southChart.setSelectedBody(bodyId);
  updateSelectedDetails(currentDataset.records[playback.index]);
  renderTrails(playback.index);
}

function clearSelection() {
  if (selectedBodyId === null) return;
  selectedBodyId = null;
  chart.setSelectedBody(null);
  northChart.setSelectedBody(null);
  southChart.setSelectedBody(null);
  updateSelectedDetails(currentDataset?.records[playback.index]);
  renderTrails(playback.index);
}

function updateSelectedDetails(record) {
  const config = currentDataset?.bodies.find((body) => body.id === selectedBodyId);
  const planet = record?.planets[selectedBodyId];
  if (!config || !planet) {
    elements.details.hidden = true;
    elements.emptyDetails.hidden = false;
    return;
  }

  const zodiac = getZodiacPosition(planet.longitude);
  const nakshatra = getNakshatraPosition(planet.longitude);
  const motionLabel = planet.motion === 'retrograde' ? 'Retrograde' : planet.motion === 'stationary' ? 'Stationary' : 'Direct';
  const iconContent = config.iconPath
    ? `<img src="${escapeHtml(config.iconPath)}" alt="">`
    : escapeHtml(config.fallbackSymbol);

  elements.emptyDetails.hidden = true;
  elements.details.hidden = false;
  elements.details.innerHTML = `
    <div class="details-heading">
      <span class="details-icon">${iconContent}</span>
      <div>
        <p class="eyebrow">Selected body</p>
        <h2>${escapeHtml(config.displayName)}</h2>
        <p>${escapeHtml(formatDate(record.date))}</p>
      </div>
      <span class="details-statuses"><span class="details-motion ${escapeHtml(planet.motion)}">${motionLabel}</span>${planet.combust ? '<span class="details-combust">C · Combust</span>' : ''}</span>
    </div>
    <div class="position-hero">
      <span>Sidereal position</span>
      <strong>${escapeHtml(formatWithinSign(planet.longitude))}</strong>
    </div>
    <dl class="detail-list">
      <div><dt>Absolute longitude</dt><dd>${escapeHtml(formatLongitude(planet.longitude))}</dd></div>
      <div><dt>Zodiac sign</dt><dd>${escapeHtml(zodiac.sign.name)}</dd></div>
      <div><dt>Nakshatra</dt><dd>${escapeHtml(nakshatra.nakshatra.name)}</dd></div>
      <div><dt>Pada</dt><dd>${nakshatra.pada}</dd></div>
      <div><dt>Within nakshatra</dt><dd>${escapeHtml(formatLongitude(nakshatra.degreesWithinNakshatra))}</dd></div>
      <div><dt>Daily speed</dt><dd>${planet.speed >= 0 ? '+' : ''}${planet.speed.toFixed(5)}°/day</dd></div>
      ${planet.combustionLimit !== null ? `<div><dt>Solar condition</dt><dd>${planet.combust ? 'Combust' : 'Clear'} · ${planet.solarSeparation.toFixed(2)}° from Sun</dd></div>` : ''}
    </dl>`;

  const image = elements.details.querySelector('img');
  image?.addEventListener('error', () => {
    const icon = image.parentElement;
    image.remove();
    icon.textContent = config.fallbackSymbol;
    console.warn(`[icons] Unable to load details icon: ${config.iconPath}`);
  }, { once: true });
}

function renderTrails(index) {
  if (!currentDataset) return;
  chart.renderTrails(currentDataset.records.slice(Math.max(0, index - 9), index + 1), selectedBodyId);
}

function updateOuterPlanetVisibility() {
  const hiddenIds = elements.outerPlanets.checked ? [] : OUTER_BODY_IDS;
  chart.setHiddenBodyIds(hiddenIds);
  northChart.setHiddenBodyIds(hiddenIds);
  southChart.setHiddenBodyIds(hiddenIds);
  if (!elements.outerPlanets.checked && OUTER_BODY_IDS.includes(selectedBodyId)) {
    clearSelection();
  }
  playback.renderStill();
  updatePositionsTable(currentDataset?.records[playback.index]);
  renderTrails(playback.index);
}

function switchChartTab(nextTab, focus = false) {
  const tabName = ['wheel', 'north', 'south'].includes(nextTab) ? nextTab : 'wheel';
  const tabs = {
    wheel: { tab: elements.wheelTab, panel: elements.wheelPanel },
    north: { tab: elements.northTab, panel: elements.northPanel },
    south: { tab: elements.southTab, panel: elements.southPanel },
  };
  Object.entries(tabs).forEach(([name, entry]) => {
    const active = name === tabName;
    entry.tab.classList.toggle('is-active', active);
    entry.tab.setAttribute('aria-selected', String(active));
    entry.tab.tabIndex = active ? 0 : -1;
    entry.panel.hidden = !active;
  });

  if (tabName === 'north') {
    const motion = document.querySelector('input[name="north-motion"]:checked')?.value ?? 'continuous';
    elements.orientationText.textContent = `${elements.ascendant.options[elements.ascendant.selectedIndex].text} ascendant · ${motion === 'continuous' ? 'continuous motion' : 'house jump'}`;
    northChart.renderRecord(currentDataset?.records[playback.index]);
  } else if (tabName === 'south') {
    const motion = document.querySelector('input[name="south-motion"]:checked')?.value ?? 'continuous';
    elements.orientationText.textContent = `Fixed signs · ${elements.southAscendant.options[elements.southAscendant.selectedIndex].text} ascendant · ${motion === 'continuous' ? 'continuous motion' : 'house jump'}`;
    southChart.renderRecord(currentDataset?.records[playback.index]);
  } else {
    elements.orientationText.textContent = '0° Aries · clockwise';
  }
  if (focus) tabs[tabName].tab.focus();
}

function bindEvents() {
  elements.year.addEventListener('change', () => loadYear(Number(elements.year.value)));
  elements.play.addEventListener('click', () => playback.play());
  elements.pause.addEventListener('click', () => playback.pause());
  elements.previous.addEventListener('click', () => playback.step(-1));
  elements.next.addEventListener('click', () => playback.step(1));
  elements.restart.addEventListener('click', () => playback.setIndex(0));
  elements.end.addEventListener('click', () => playback.setIndex(currentDataset.records.length - 1));
  elements.retry.addEventListener('click', () => loadYear(Number(elements.year.value)));
  elements.slider.addEventListener('pointerdown', () => playback.pause());
  elements.slider.addEventListener('input', () => playback.setIndex(Number(elements.slider.value)));
  elements.currentDate.addEventListener('change', () => {
    const index = currentDataset?.records.findIndex((record) => record.date === elements.currentDate.value) ?? -1;
    if (index >= 0) {
      playback.pause();
      playback.setIndex(index);
    }
  });
  elements.speed.addEventListener('change', () => playback.setSpeed(Number(elements.speed.value)));
  elements.trails.addEventListener('change', () => {
    chart.setTrailsEnabled(elements.trails.checked);
    renderTrails(playback.index);
  });
  elements.outerPlanets.addEventListener('change', updateOuterPlanetVisibility);
  elements.ascendant.addEventListener('change', () => {
    northChart.setAscendant(Number(elements.ascendant.value));
    if (!elements.northPanel.hidden) switchChartTab('north');
  });
  elements.northMotionInputs.forEach((input) => input.addEventListener('change', () => {
    if (!input.checked) return;
    northChart.setMotionMode(input.value);
    playback.renderStill();
    if (!elements.northPanel.hidden) switchChartTab('north');
  }));
  elements.southAscendant.addEventListener('change', () => {
    southChart.setAscendant(Number(elements.southAscendant.value));
    if (!elements.southPanel.hidden) switchChartTab('south');
  });
  elements.southMotionInputs.forEach((input) => input.addEventListener('change', () => {
    if (!input.checked) return;
    southChart.setMotionMode(input.value);
    playback.renderStill();
    if (!elements.southPanel.hidden) switchChartTab('south');
  }));
  elements.wheelTab.addEventListener('click', () => switchChartTab('wheel'));
  elements.northTab.addEventListener('click', () => switchChartTab('north'));
  elements.southTab.addEventListener('click', () => switchChartTab('south'));
  const chartTabs = [elements.wheelTab, elements.northTab, elements.southTab];
  chartTabs.forEach((tab, tabIndex) => tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (tabIndex + direction + chartTabs.length) % chartTabs.length;
    switchChartTab(['wheel', 'north', 'south'][nextIndex], true);
  }));
  elements.theme.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
  reducedMotionQuery.addEventListener('change', (event) => playback.setReducedMotion(event.matches));
  darkThemeQuery.addEventListener('change', (event) => {
    if (!localStorage.getItem('transit-theme')) applyTheme(event.matches ? 'dark' : 'light');
  });
  window.addEventListener('resize', () => {
    if (chart.hoveredBodyId) chart.showTooltip(chart.hoveredBodyId);
  });
}

populateYears();
initializeTheme();
bindEvents();
updatePlaybackState(false);
loadYear(Number(elements.year.value));
