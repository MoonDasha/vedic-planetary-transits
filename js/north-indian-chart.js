import { ZODIAC } from './constants.js';
import { formatDate, formatWithinSign, getZodiacPosition } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HOUSE_CENTERS = [
  [400, 230], [230, 125], [125, 230], [230, 400],
  [125, 570], [230, 675], [400, 570], [570, 675],
  [675, 570], [570, 400], [675, 230], [570, 125],
];
const LABEL_POINTS = [
  [400, 348], [235, 68], [68, 235], [348, 400],
  [68, 565], [235, 732], [400, 452], [565, 732],
  [732, 565], [452, 400], [732, 235], [565, 68],
];

function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
}

export function getHouseForLongitude(longitude, ascendantIndex = 0) {
  const signIndex = getZodiacPosition(longitude).index;
  return ((signIndex - ascendantIndex + 12) % 12) + 1;
}

function layoutForCount(count) {
  if (count <= 1) return { columns: 1, iconSize: 34, fontSize: 10.5, xGap: 0, yGap: 0 };
  if (count <= 2) return { columns: 2, iconSize: 28, fontSize: 9.2, xGap: 62, yGap: 0 };
  if (count <= 4) return { columns: 2, iconSize: 23, fontSize: 8.2, xGap: 58, yGap: 54 };
  if (count <= 6) return { columns: 3, iconSize: 19, fontSize: 7.2, xGap: 45, yGap: 49 };
  return { columns: 4, iconSize: 15, fontSize: 6.4, xGap: 36, yGap: 43 };
}

function layoutPoint(index, count, layout) {
  const rows = Math.ceil(count / layout.columns);
  const row = Math.floor(index / layout.columns);
  const columnsInRow = Math.min(layout.columns, count - row * layout.columns);
  const column = index % layout.columns;
  return {
    x: (column - (columnsInRow - 1) / 2) * layout.xGap,
    y: (row - (rows - 1) / 2) * layout.yGap,
  };
}

export class NorthIndianTransitChart {
  constructor(svg, { onSelect, onDeselect } = {}) {
    this.svg = svg;
    this.onSelect = onSelect;
    this.onDeselect = onDeselect;
    this.ascendantIndex = 0;
    this.bodyConfigs = [];
    this.markers = new Map();
    this.hiddenBodyIds = new Set();
    this.selectedBodyId = null;
    this.currentRecord = null;
    this.buildChart();
  }

  buildChart() {
    this.svg.replaceChildren();
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-labelledby', 'north-chart-title north-chart-description');
    this.svg.append(
      svgElement('title', { id: 'north-chart-title' }, 'North Indian sidereal transit chart'),
      svgElement('desc', { id: 'north-chart-description' }, 'A fixed-house North Indian Vedic chart. The selected ascendant places its sign in the first house and the remaining signs proceed counterclockwise through the houses.'),
    );

    const structure = svgElement('g', { class: 'north-chart-structure', 'aria-hidden': 'true' });
    structure.append(
      svgElement('rect', { x: 40, y: 40, width: 720, height: 720, class: 'north-chart-field' }),
      svgElement('path', { d: 'M 400 40 L 760 400 L 400 760 L 40 400 Z', class: 'north-chart-line' }),
      svgElement('path', { d: 'M 40 40 L 760 760 M 760 40 L 40 760', class: 'north-chart-line' }),
    );
    this.svg.append(structure);

    this.dateLabel = svgElement('text', {
      x: 400,
      y: 25,
      class: 'north-chart-date',
      'text-anchor': 'middle',
      'aria-hidden': 'true',
    }, '—');
    this.svg.append(this.dateLabel);

    this.houseLabelGroup = svgElement('g', { class: 'north-house-labels', 'aria-hidden': 'true' });
    this.houseLabels = LABEL_POINTS.map(([x, y], index) => {
      const group = svgElement('g', { transform: `translate(${x} ${y})` });
      const number = svgElement('text', { x: 0, y: -7, class: 'north-house-number', 'text-anchor': 'middle' }, `H${index + 1}`);
      const sign = svgElement('text', { x: 0, y: 7, class: 'north-house-sign', 'text-anchor': 'middle' });
      group.append(number, sign);
      this.houseLabelGroup.append(group);
      return sign;
    });
    this.svg.append(this.houseLabelGroup);

    this.markerGroup = svgElement('g', { class: 'north-planet-markers', 'aria-label': 'Planets by house' });
    this.svg.append(this.markerGroup);
    this.setAscendant(0);

    this.svg.addEventListener('click', (event) => {
      if (!event.target.closest('.north-planet-marker')) this.onDeselect?.();
    });
  }

  setAscendant(index) {
    this.ascendantIndex = Number(index) || 0;
    this.houseLabels.forEach((label, houseIndex) => {
      label.textContent = ZODIAC[(this.ascendantIndex + houseIndex) % 12].name;
    });
    if (this.currentRecord) this.renderRecord(this.currentRecord);
  }

  setBodies(bodyConfigs) {
    this.bodyConfigs = bodyConfigs;
    const activeIds = new Set(bodyConfigs.map((body) => body.id));
    this.markers.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.group.remove();
        this.markers.delete(id);
      }
    });
    bodyConfigs.forEach((config) => this.ensureMarker(config));
  }

  ensureMarker(config) {
    if (this.markers.has(config.id)) return this.markers.get(config.id);
    const group = svgElement('g', {
      class: 'north-planet-marker',
      tabindex: '0',
      role: 'button',
      'data-body-id': config.id,
    });
    const selected = svgElement('rect', { class: 'north-selected-ring', rx: 8, ry: 8 });
    const fallback = svgElement('text', {
      class: 'north-marker-fallback',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, config.fallbackSymbol);
    const name = svgElement('text', { class: 'north-marker-name', 'text-anchor': 'middle' }, config.displayName);
    const status = svgElement('text', { class: 'north-marker-status', 'text-anchor': 'end' });
    group.append(selected);

    let image = null;
    if (config.iconPath) {
      image = svgElement('image', {
        href: config.iconPath,
        class: 'north-marker-icon',
        preserveAspectRatio: 'xMidYMid meet',
        'aria-hidden': 'true',
      });
      fallback.classList.add('has-icon');
      image.addEventListener('error', () => {
        image.classList.add('is-missing');
        fallback.classList.remove('has-icon');
        console.warn(`[icons] Unable to load North chart icon: ${config.iconPath}`);
      }, { once: true });
      group.append(image);
    }
    group.append(fallback, name, status);
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onSelect?.(config.id);
      group.blur();
    });
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.onSelect?.(config.id);
      }
    });
    this.markerGroup.append(group);
    const marker = { group, selected, image, fallback, name, status, config };
    this.markers.set(config.id, marker);
    return marker;
  }

  setHiddenBodyIds(bodyIds) {
    this.hiddenBodyIds = new Set(bodyIds);
    if (this.currentRecord) this.renderRecord(this.currentRecord);
  }

  setSelectedBody(bodyId) {
    this.selectedBodyId = bodyId;
    this.markers.forEach((marker, id) => marker.group.classList.toggle('is-selected', id === bodyId));
  }

  renderRecord(record) {
    if (!record) return;
    this.currentRecord = record;
    this.dateLabel.textContent = formatDate(record.date, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const houses = Array.from({ length: 12 }, () => []);
    this.bodyConfigs.forEach((config) => {
      const planet = record.planets[config.id];
      if (!planet || this.hiddenBodyIds.has(config.id)) return;
      const house = getHouseForLongitude(planet.longitude, this.ascendantIndex);
      houses[house - 1].push({ config, planet });
    });

    const visible = new Set();
    houses.forEach((bodies, houseIndex) => {
      bodies.sort((a, b) => a.config.defaultOrder - b.config.defaultOrder);
      const layout = layoutForCount(bodies.length);
      bodies.forEach(({ config, planet }, index) => {
        const marker = this.markers.get(config.id);
        if (!marker) return;
        visible.add(config.id);
        const [houseX, houseY] = HOUSE_CENTERS[houseIndex];
        const offset = layoutPoint(index, bodies.length, layout);
        marker.group.setAttribute('transform', `translate(${houseX + offset.x} ${houseY + offset.y})`);
        marker.group.removeAttribute('hidden');
        marker.group.classList.toggle('is-selected', config.id === this.selectedBodyId);
        marker.group.classList.toggle('is-retrograde', planet.motion === 'retrograde');
        marker.group.classList.toggle('is-combust', planet.combust === true);
        marker.group.setAttribute('aria-label', `${config.displayName}, house ${houseIndex + 1}, ${formatWithinSign(planet.longitude)}${planet.combust ? ', combust' : ''}. Select for details.`);

        const iconSize = layout.iconSize;
        if (marker.image) {
          marker.image.setAttribute('x', -iconSize / 2);
          marker.image.setAttribute('y', -iconSize / 2 - 7);
          marker.image.setAttribute('width', iconSize);
          marker.image.setAttribute('height', iconSize);
        }
        marker.fallback.setAttribute('y', -7);
        marker.fallback.style.fontSize = `${Math.max(12, iconSize * 0.72)}px`;
        marker.name.setAttribute('y', iconSize / 2 + 7);
        marker.name.style.fontSize = `${layout.fontSize}px`;
        marker.status.setAttribute('x', iconSize / 2 + 8);
        marker.status.setAttribute('y', -iconSize / 2 - 5);
        marker.status.textContent = `${planet.motion === 'retrograde' ? '℞' : ''}${planet.combust ? 'C' : ''}`;
        marker.selected.setAttribute('x', -Math.max(22, iconSize / 2 + 8));
        marker.selected.setAttribute('y', -iconSize / 2 - 15);
        marker.selected.setAttribute('width', Math.max(44, iconSize + 16));
        marker.selected.setAttribute('height', iconSize + 31);
      });
    });

    this.markers.forEach((marker, id) => {
      if (!visible.has(id)) marker.group.setAttribute('hidden', '');
    });
  }
}
