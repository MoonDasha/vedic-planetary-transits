import { ZODIAC } from './constants.js';
import {
  formatDate,
  formatWithinSign,
  getZodiacPosition,
  normalizeLongitude,
} from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// South Indian charts keep signs fixed. Aries begins in the second cell of the
// top row and the remaining signs continue clockwise around the perimeter.
const SIGN_CELL_ORIGINS = [
  [220, 40], [400, 40], [580, 40], [580, 220],
  [580, 400], [580, 580], [400, 580], [220, 580],
  [40, 580], [40, 400], [40, 220], [40, 40],
];
export const SOUTH_SIGN_CENTERS = SIGN_CELL_ORIGINS.map(([x, y]) => [x + 90, y + 90]);

export const SOUTH_MOTION_MODES = Object.freeze({
  HOUSE_JUMP: 'house-jump',
  CONTINUOUS: 'continuous',
});

const CONTINUOUS_COLLISION_DISTANCE = 40;

// Each invisible degree path begins at the boundary shared with the previous
// sign, passes through the sign-cell center at 15°, and exits at the next shared
// boundary at 30°. Adjacent signs therefore meet at exactly the same point.
export const SOUTH_SIGN_PATHS = SOUTH_SIGN_CENTERS.map((center, signIndex, centers) => {
  const previous = centers[(signIndex + 11) % 12];
  const next = centers[(signIndex + 1) % 12];
  return {
    start: [(previous[0] + center[0]) / 2, (previous[1] + center[1]) / 2],
    center,
    end: [(center[0] + next[0]) / 2, (center[1] + next[1]) / 2],
  };
});

function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
}

export function getSouthHouseForLongitude(longitude, ascendantIndex = 0) {
  const signIndex = getZodiacPosition(longitude).index;
  return ((signIndex - ascendantIndex + 12) % 12) + 1;
}

/** Convert sign degree progress to an invisible two-segment perimeter route. */
export function getSouthContinuousPoint(longitude, ascendantIndex = 0) {
  const zodiac = getZodiacPosition(longitude);
  const progress = zodiac.degreesWithinSign / 30;
  const { start, center, end } = SOUTH_SIGN_PATHS[zodiac.index];
  const firstHalf = progress <= 0.5;
  const segmentStart = firstHalf ? start : center;
  const segmentEnd = firstHalf ? center : end;
  const segmentProgress = firstHalf ? progress * 2 : (progress - 0.5) * 2;
  const tangentX = segmentEnd[0] - segmentStart[0];
  const tangentY = segmentEnd[1] - segmentStart[1];
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  return {
    x: segmentStart[0] + tangentX * segmentProgress,
    y: segmentStart[1] + tangentY * segmentProgress,
    tangentX: tangentX / tangentLength,
    tangentY: tangentY / tangentLength,
    signIndex: zodiac.index,
    house: getSouthHouseForLongitude(longitude, ascendantIndex),
    degreesWithinSign: zodiac.degreesWithinSign,
    progress,
  };
}

function connectedPositionGroups(entries, threshold) {
  const groups = [];
  const visited = new Set();
  entries.forEach((entry, startIndex) => {
    if (visited.has(startIndex)) return;
    const pending = [startIndex];
    const group = [];
    visited.add(startIndex);
    while (pending.length) {
      const index = pending.shift();
      const current = entries[index];
      group.push(current);
      entries.forEach((candidate, candidateIndex) => {
        if (visited.has(candidateIndex)) return;
        if (Math.hypot(current.base.x - candidate.base.x, current.base.y - candidate.base.y) <= threshold) {
          visited.add(candidateIndex);
          pending.push(candidateIndex);
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

/** Preserve the true path position and offset only overlapping markers. */
export function layoutSouthContinuousBodies(bodies, ascendantIndex = 0) {
  const entries = bodies.map((body) => ({
    ...body,
    base: getSouthContinuousPoint(body.longitude, ascendantIndex),
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

export class SouthIndianTransitChart {
  constructor(svg, { onSelect, onDeselect } = {}) {
    this.svg = svg;
    this.onSelect = onSelect;
    this.onDeselect = onDeselect;
    this.ascendantIndex = 0;
    this.motionMode = SOUTH_MOTION_MODES.CONTINUOUS;
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
    this.svg.setAttribute('aria-labelledby', 'south-chart-title south-chart-description');
    this.svg.append(
      svgElement('title', { id: 'south-chart-title' }, 'South Indian sidereal transit chart'),
      svgElement('desc', { id: 'south-chart-description' }, 'A fixed-sign South Indian Vedic chart. House numbers rotate from the selected ascendant while planets move through the zodiac cells.'),
    );

    const structure = svgElement('g', { class: 'south-chart-structure', 'aria-hidden': 'true' });
    structure.append(
      svgElement('rect', { x: 40, y: 40, width: 720, height: 720, class: 'south-chart-field' }),
      svgElement('path', {
        d: 'M 220 40 V 760 M 580 40 V 760 M 40 220 H 760 M 40 580 H 760 M 400 40 V 220 M 400 580 V 760 M 40 400 H 220 M 580 400 H 760',
        class: 'south-chart-line',
      }),
    );
    this.svg.append(structure);

    this.dateLabel = svgElement('text', {
      x: 400,
      y: 25,
      class: 'south-chart-date',
      'text-anchor': 'middle',
      'aria-hidden': 'true',
    }, '—');
    this.svg.append(this.dateLabel);

    this.houseLabels = SIGN_CELL_ORIGINS.map(([x, y], signIndex) => {
      const group = svgElement('g', { 'aria-hidden': 'true' });
      group.append(
        svgElement('text', { x: x + 10, y: y + 20, class: 'south-sign-label' }, ZODIAC[signIndex].name),
      );
      const house = svgElement('text', {
        x: x + 170,
        y: y + 20,
        class: 'south-house-number',
        'text-anchor': 'end',
      });
      group.append(house);
      this.svg.append(group);
      return house;
    });

    this.markerGroup = svgElement('g', { class: 'south-planet-markers', 'aria-label': 'Planets by fixed zodiac sign' });
    this.svg.append(this.markerGroup);
    this.setAscendant(0);

    this.svg.addEventListener('click', (event) => {
      if (!event.target.closest('.south-planet-marker')) this.onDeselect?.();
    });
  }

  setAscendant(index) {
    this.ascendantIndex = Number(index) || 0;
    this.houseLabels.forEach((label, signIndex) => {
      label.textContent = `H${((signIndex - this.ascendantIndex + 12) % 12) + 1}`;
    });
    if (this.currentRecord) this.renderRecord(this.currentRecord);
  }

  setMotionMode(mode) {
    this.motionMode = mode === SOUTH_MOTION_MODES.HOUSE_JUMP
      ? SOUTH_MOTION_MODES.HOUSE_JUMP
      : SOUTH_MOTION_MODES.CONTINUOUS;
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
      class: 'south-planet-marker',
      tabindex: '0',
      role: 'button',
      'data-body-id': config.id,
    });
    const selected = svgElement('rect', { class: 'south-selected-ring', rx: 8, ry: 8 });
    const fallback = svgElement('text', {
      class: 'south-marker-fallback',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, config.fallbackSymbol);
    const name = svgElement('text', { class: 'south-marker-name', 'text-anchor': 'middle' }, config.displayName);
    const status = svgElement('text', { class: 'south-marker-status', 'text-anchor': 'end' });
    group.append(selected);

    let image = null;
    if (config.iconPath) {
      image = svgElement('image', {
        href: config.iconPath,
        class: 'south-marker-icon',
        preserveAspectRatio: 'xMidYMid meet',
        'aria-hidden': 'true',
      });
      fallback.classList.add('has-icon');
      image.addEventListener('error', () => {
        image.classList.add('is-missing');
        fallback.classList.remove('has-icon');
        console.warn(`[icons] Unable to load South chart icon: ${config.iconPath}`);
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

  applyMarker(marker, planet, placement) {
    const { x, y, iconSize, fontSize, house } = placement;
    marker.group.setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)})`);
    marker.group.removeAttribute('hidden');
    marker.group.classList.toggle('is-selected', marker.config.id === this.selectedBodyId);
    marker.group.classList.toggle('is-retrograde', planet.motion === 'retrograde');
    marker.group.classList.toggle('is-combust', planet.combust === true);
    marker.group.setAttribute('aria-label', `${marker.config.displayName}, house ${house}, ${formatWithinSign(planet.longitude)}${planet.combust ? ', combust' : ''}. Select for details.`);

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
    const signs = Array.from({ length: 12 }, () => []);
    bodies.forEach((body) => signs[getZodiacPosition(body.longitude).index].push(body));
    const visible = new Set();
    signs.forEach((signBodies, signIndex) => {
      signBodies.sort((a, b) => a.config.defaultOrder - b.config.defaultOrder);
      const layout = layoutForCount(signBodies.length);
      signBodies.forEach(({ config, planet }, index) => {
        const marker = this.markers.get(config.id);
        if (!marker) return;
        visible.add(config.id);
        const [centerX, centerY] = SOUTH_SIGN_CENTERS[signIndex];
        const offset = layoutPoint(index, signBodies.length, layout);
        this.applyMarker(marker, planet, {
          x: centerX + offset.x,
          y: centerY + offset.y + 8,
          iconSize: layout.iconSize,
          fontSize: layout.fontSize,
          house: ((signIndex - this.ascendantIndex + 12) % 12) + 1,
        });
      });
    });
    this.hideInactiveMarkers(visible);
  }

  renderContinuous(bodies) {
    const placements = layoutSouthContinuousBodies(bodies, this.ascendantIndex);
    const visible = new Set();
    bodies.forEach(({ config, planet }) => {
      const marker = this.markers.get(config.id);
      const placement = placements.get(config.id);
      if (!marker || !placement) return;
      visible.add(config.id);
      this.applyMarker(marker, planet, placement);
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
    if (this.motionMode === SOUTH_MOTION_MODES.CONTINUOUS) {
      this.renderContinuous(bodies);
    } else {
      this.renderHouseJump(bodies);
    }
  }

  renderFrame(fromRecord, toRecord, progress = 0) {
    if (!fromRecord || this.motionMode !== SOUTH_MOTION_MODES.CONTINUOUS) return;
    this.currentRecord = fromRecord;
    this.renderContinuous(this.visibleBodies(fromRecord, toRecord, progress));
  }
}
