import { ZODIAC } from './constants.js';
import {
  formatDate,
  formatWithinSign,
  getZodiacPosition,
  normalizeLongitude,
} from './utils.js';

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

// Each point is the middle of the shared boundary between one house and the
// next. Increasing zodiac longitude follows these points from H1 through H12.
const HOUSE_EXIT_POINTS = [
  [310, 130], [130, 130], [130, 310], [130, 490],
  [130, 670], [310, 670], [490, 670], [670, 670],
  [670, 490], [670, 310], [670, 130], [490, 130],
];

export const NORTH_MOTION_MODES = Object.freeze({
  HOUSE_JUMP: 'house-jump',
  CONTINUOUS: 'continuous',
});

export const CONTINUOUS_COLLISION_DISTANCE = 40;

// Every path enters a house at 0°, passes through its visual center at 15°,
// and reaches the next shared boundary at 30°. The central diamond houses
// (1, 4, 7, and 10) use two straight segments; the surrounding houses use a
// quadratic curve. Consecutive paths share endpoints, keeping sign changes
// continuous in both direct and retrograde motion.
export const HOUSE_MOTION_PATHS = HOUSE_CENTERS.map(([centerX, centerY], houseIndex) => {
  const start = HOUSE_EXIT_POINTS[(houseIndex + 11) % 12];
  const end = HOUSE_EXIT_POINTS[houseIndex];
  const control = [
    centerX * 2 - (start[0] + end[0]) / 2,
    centerY * 2 - (start[1] + end[1]) / 2,
  ];
  return {
    start,
    center: [centerX, centerY],
    control,
    end,
    straight: houseIndex % 3 === 0,
  };
});

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

/** Map a longitude to its exact 0°–30° progress along a North chart house. */
export function getContinuousHousePoint(longitude, ascendantIndex = 0) {
  const zodiac = getZodiacPosition(longitude);
  const house = getHouseForLongitude(longitude, ascendantIndex);
  const progress = zodiac.degreesWithinSign / 30;
  const { start, center, control, end, straight } = HOUSE_MOTION_PATHS[house - 1];
  let x;
  let y;
  let tangentX;
  let tangentY;

  if (straight) {
    const firstHalf = progress <= 0.5;
    const segmentStart = firstHalf ? start : center;
    const segmentEnd = firstHalf ? center : end;
    const segmentProgress = firstHalf ? progress * 2 : (progress - 0.5) * 2;
    x = segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * segmentProgress;
    y = segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * segmentProgress;
    tangentX = segmentEnd[0] - segmentStart[0];
    tangentY = segmentEnd[1] - segmentStart[1];
  } else {
    const inverse = 1 - progress;
    x = inverse ** 2 * start[0] + 2 * inverse * progress * control[0] + progress ** 2 * end[0];
    y = inverse ** 2 * start[1] + 2 * inverse * progress * control[1] + progress ** 2 * end[1];
    tangentX = 2 * inverse * (control[0] - start[0]) + 2 * progress * (end[0] - control[0]);
    tangentY = 2 * inverse * (control[1] - start[1]) + 2 * progress * (end[1] - control[1]);
  }
  const length = Math.hypot(tangentX, tangentY) || 1;
  return {
    x,
    y,
    tangentX: tangentX / length,
    tangentY: tangentY / length,
    house,
    houseIndex: house - 1,
    degreesWithinSign: zodiac.degreesWithinSign,
    progress,
  };
}

function connectedPositionGroups(entries, threshold) {
  const groups = [];
  const visited = new Set();
  entries.forEach((entry, startIndex) => {
    if (visited.has(startIndex)) return;
    const indexes = [startIndex];
    const group = [];
    visited.add(startIndex);
    while (indexes.length) {
      const index = indexes.shift();
      const current = entries[index];
      group.push(current);
      entries.forEach((candidate, candidateIndex) => {
        if (visited.has(candidateIndex)) return;
        if (Math.hypot(current.base.x - candidate.base.x, current.base.y - candidate.base.y) <= threshold) {
          visited.add(candidateIndex);
          indexes.push(candidateIndex);
        }
      });
    }
    groups.push(group);
  });
  return groups;
}

function continuousMarkerScale(groupSize) {
  if (groupSize <= 1) return { iconSize: 27, fontSize: 9.2, gap: 0 };
  if (groupSize <= 3) return { iconSize: 23, fontSize: 8.2, gap: 29 };
  if (groupSize <= 5) return { iconSize: 19, fontSize: 7.2, gap: 24 };
  return { iconSize: 16, fontSize: 6.5, gap: 20 };
}

/**
 * Keep true degree positions on the path, then separate only colliding markers
 * along a perpendicular lane. Priority order makes each side assignment stable.
 */
export function layoutContinuousBodies(bodies, ascendantIndex = 0) {
  const entries = bodies.map((body) => ({
    ...body,
    base: getContinuousHousePoint(body.longitude, ascendantIndex),
  }));
  const placements = new Map();
  connectedPositionGroups(entries, CONTINUOUS_COLLISION_DISTANCE).forEach((group) => {
    group.sort((a, b) => a.config.defaultOrder - b.config.defaultOrder);
    const scale = continuousMarkerScale(group.length);
    let tangentX = group.reduce((sum, entry) => sum + entry.base.tangentX, 0);
    let tangentY = group.reduce((sum, entry) => sum + entry.base.tangentY, 0);
    const tangentLength = Math.hypot(tangentX, tangentY);
    if (tangentLength < 0.01) {
      tangentX = group[0].base.tangentX;
      tangentY = group[0].base.tangentY;
    } else {
      tangentX /= tangentLength;
      tangentY /= tangentLength;
    }
    const normalX = -tangentY;
    const normalY = tangentX;
    group.forEach((entry, index) => {
      const offset = (index - (group.length - 1) / 2) * scale.gap;
      placements.set(entry.config.id, {
        ...entry.base,
        x: entry.base.x + normalX * offset,
        y: entry.base.y + normalY * offset,
        iconSize: scale.iconSize,
        fontSize: scale.fontSize,
        groupSize: group.length,
      });
    });
  });
  return placements;
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
    this.motionMode = NORTH_MOTION_MODES.HOUSE_JUMP;
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
      svgElement('desc', { id: 'north-chart-description' }, 'A fixed-house North Indian Vedic chart with optional continuous degree-based planetary motion. The selected ascendant places its sign in the first house.'),
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

  setMotionMode(mode) {
    this.motionMode = mode === NORTH_MOTION_MODES.CONTINUOUS
      ? NORTH_MOTION_MODES.CONTINUOUS
      : NORTH_MOTION_MODES.HOUSE_JUMP;
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

  visibleBodies(record, toRecord = record, progress = 0) {
    const bodies = [];
    this.bodyConfigs.forEach((config) => {
      const planet = record.planets[config.id];
      if (!planet || this.hiddenBodyIds.has(config.id)) return;
      const nextPlanet = toRecord?.planets[config.id] ?? planet;
      const fromUnwrapped = Number.isFinite(planet.unwrappedLongitude)
        ? planet.unwrappedLongitude
        : planet.longitude;
      const toUnwrapped = Number.isFinite(nextPlanet.unwrappedLongitude)
        ? nextPlanet.unwrappedLongitude
        : fromUnwrapped;
      bodies.push({
        config,
        planet,
        longitude: normalizeLongitude(fromUnwrapped + (toUnwrapped - fromUnwrapped) * progress),
      });
    });
    return bodies;
  }

  applyMarker(marker, planet, houseIndex, placement) {
    const { x, y, iconSize, fontSize } = placement;
    marker.group.setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)})`);
    marker.group.removeAttribute('hidden');
    marker.group.classList.toggle('is-selected', marker.config.id === this.selectedBodyId);
    marker.group.classList.toggle('is-retrograde', planet.motion === 'retrograde');
    marker.group.classList.toggle('is-combust', planet.combust === true);
    marker.group.setAttribute('aria-label', `${marker.config.displayName}, house ${houseIndex + 1}, ${formatWithinSign(planet.longitude)}${planet.combust ? ', combust' : ''}. Select for details.`);

    if (marker.image) {
      marker.image.setAttribute('x', -iconSize / 2);
      marker.image.setAttribute('y', -iconSize / 2 - 7);
      marker.image.setAttribute('width', iconSize);
      marker.image.setAttribute('height', iconSize);
    }
    marker.fallback.setAttribute('y', -7);
    marker.fallback.style.fontSize = `${Math.max(11, iconSize * 0.72)}px`;
    marker.name.setAttribute('y', iconSize / 2 + 7);
    marker.name.style.fontSize = `${fontSize}px`;
    marker.status.setAttribute('x', iconSize / 2 + 8);
    marker.status.setAttribute('y', -iconSize / 2 - 5);
    marker.status.textContent = `${planet.motion === 'retrograde' ? '℞' : ''}${planet.combust ? 'C' : ''}`;
    marker.selected.setAttribute('x', -Math.max(22, iconSize / 2 + 8));
    marker.selected.setAttribute('y', -iconSize / 2 - 15);
    marker.selected.setAttribute('width', Math.max(44, iconSize + 16));
    marker.selected.setAttribute('height', iconSize + 31);
  }

  renderHouseJump(bodies) {
    const houses = Array.from({ length: 12 }, () => []);
    bodies.forEach((body) => {
      const house = getHouseForLongitude(body.longitude, this.ascendantIndex);
      houses[house - 1].push(body);
    });

    const visible = new Set();
    houses.forEach((houseBodies, houseIndex) => {
      houseBodies.sort((a, b) => a.config.defaultOrder - b.config.defaultOrder);
      const layout = layoutForCount(houseBodies.length);
      houseBodies.forEach(({ config, planet }, index) => {
        const marker = this.markers.get(config.id);
        if (!marker) return;
        visible.add(config.id);
        const [houseX, houseY] = HOUSE_CENTERS[houseIndex];
        const offset = layoutPoint(index, houseBodies.length, layout);
        this.applyMarker(marker, planet, houseIndex, {
          x: houseX + offset.x,
          y: houseY + offset.y,
          iconSize: layout.iconSize,
          fontSize: layout.fontSize,
        });
      });
    });
    this.hideInactiveMarkers(visible);
  }

  renderContinuous(bodies) {
    const placements = layoutContinuousBodies(bodies, this.ascendantIndex);
    const visible = new Set();
    bodies.forEach(({ config, planet }) => {
      const marker = this.markers.get(config.id);
      const placement = placements.get(config.id);
      if (!marker || !placement) return;
      visible.add(config.id);
      this.applyMarker(marker, planet, placement.houseIndex, placement);
    });
    this.hideInactiveMarkers(visible);
  }

  hideInactiveMarkers(visible) {
    this.markers.forEach((marker, id) => {
      if (!visible.has(id)) marker.group.setAttribute('hidden', '');
    });
  }

  renderRecord(record) {
    if (!record) return;
    this.currentRecord = record;
    this.dateLabel.textContent = formatDate(record.date, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const bodies = this.visibleBodies(record);
    if (this.motionMode === NORTH_MOTION_MODES.CONTINUOUS) {
      this.renderContinuous(bodies);
    } else {
      this.renderHouseJump(bodies);
    }
  }

  renderFrame(fromRecord, toRecord, progress = 0) {
    if (!fromRecord || this.motionMode !== NORTH_MOTION_MODES.CONTINUOUS) return;
    this.currentRecord = fromRecord;
    this.renderContinuous(this.visibleBodies(fromRecord, toRecord, progress));
  }
}
