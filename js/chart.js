import { BODY_BY_ID, CHART, NAKSHATRAS, ZODIAC } from './constants.js';
import { assignPlanetLanes } from './collision.js';
import {
  annularSectorPath,
  describeArc,
  escapeHtml,
  formatDate,
  formatLongitude,
  formatWithinSign,
  getNakshatraPosition,
  getZodiacPosition,
  longitudeToPoint,
  normalizeLongitude,
} from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
}

export class TransitChart {
  constructor(svg, tooltip, { onSelect, onDeselect } = {}) {
    this.svg = svg;
    this.tooltip = tooltip;
    this.onSelect = onSelect;
    this.onDeselect = onDeselect;
    this.bodyConfigs = [];
    this.markers = new Map();
    this.currentRecord = null;
    this.currentFramePositions = new Map();
    this.selectedBodyId = null;
    this.hoveredBodyId = null;
    this.trailsEnabled = false;
    this.hiddenBodyIds = new Set();
    this.buildStaticWheel();
    this.svg.addEventListener('click', (event) => {
      if (!event.target.closest('.planet-marker')) this.onDeselect?.();
    });
  }

  buildStaticWheel() {
    this.svg.replaceChildren();
    this.svg.setAttribute('viewBox', `0 0 ${CHART.size} ${CHART.size}`);
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-labelledby', 'wheel-title wheel-description');

    this.svg.append(
      svgElement('title', { id: 'wheel-title' }, 'Sidereal transit wheel'),
      svgElement('desc', { id: 'wheel-description' }, 'A circular Vedic astrology chart with twelve zodiac signs, twenty-seven nakshatras, and daily planetary positions. Aries begins at the top and longitude increases clockwise.'),
    );

    const defs = svgElement('defs');

    ZODIAC.forEach((sign, index) => {
      const start = index * 30 + 2;
      const end = (index + 1) * 30 - 2;
      const mid = (start + end) / 2;
      const reverse = mid > 90 && mid < 270;
      defs.append(
        svgElement('path', {
          id: `zodiac-name-path-${index}`,
          d: describeArc(start, end, 271, CHART.center, reverse),
        }),
        svgElement('path', {
          id: `zodiac-degree-path-${index}`,
          d: describeArc(start, end, 329, CHART.center, reverse),
        }),
      );
    });

    NAKSHATRAS.forEach((nakshatra, index) => {
      const start = index * (360 / 27) + 0.7;
      const end = (index + 1) * (360 / 27) - 0.7;
      const mid = (start + end) / 2;
      const reverse = mid > 90 && mid < 270;
      defs.append(svgElement('path', {
        id: `nak-label-path-${index}`,
        d: describeArc(start, end, 365, CHART.center, reverse),
      }));
    });
    this.svg.append(defs);

    const backdrop = svgElement('g', { class: 'wheel-backdrop', 'aria-hidden': 'true' });
    backdrop.append(
      svgElement('circle', { cx: CHART.center, cy: CHART.center, r: CHART.outerRadius, class: 'wheel-base' }),
      svgElement('circle', { cx: CHART.center, cy: CHART.center, r: CHART.planetPrimaryRadius, class: 'planet-orbit' }),
      svgElement('circle', { cx: CHART.center, cy: CHART.center, r: CHART.moonTrackRadius, class: 'moon-orbit' }),
      svgElement('circle', { cx: CHART.center, cy: CHART.center, r: CHART.centerRadius, class: 'center-disc' }),
    );
    this.svg.append(backdrop);

    const zodiacGroup = svgElement('g', { class: 'zodiac-band', 'aria-label': 'Twelve zodiac signs' });
    ZODIAC.forEach((sign, index) => {
      const start = index * 30;
      const end = start + 30;
      const mid = start + 15;
      const section = svgElement('g', { class: 'zodiac-section' });
      section.append(svgElement('path', {
        d: annularSectorPath(start, end, CHART.zodiacInnerRadius, CHART.zodiacOuterRadius),
        class: index % 2 ? 'zodiac-sector zodiac-sector-alt' : 'zodiac-sector',
      }));

      const iconPoint = longitudeToPoint(mid, 302);
      const icon = svgElement('image', {
        href: sign.iconPath,
        x: iconPoint.x - 17,
        y: iconPoint.y - 17,
        width: 34,
        height: 34,
        class: 'zodiac-icon',
        preserveAspectRatio: 'xMidYMid slice',
        'aria-hidden': 'true',
      });
      icon.addEventListener('error', () => {
        icon.classList.add('is-missing');
        console.warn(`[icons] Unable to load zodiac icon: ${sign.iconPath}`);
      }, { once: true });
      section.append(icon);

      const label = svgElement('text', { class: 'zodiac-name' });
      const labelPath = svgElement('textPath', {
        href: `#zodiac-name-path-${index}`,
        'text-anchor': 'middle',
        startOffset: '50%',
      }, sign.name);
      labelPath.setAttributeNS(XLINK_NS, 'xlink:href', `#zodiac-name-path-${index}`);
      label.append(labelPath);

      const degrees = svgElement('text', { class: 'zodiac-degrees' });
      const degreePath = svgElement('textPath', {
        href: `#zodiac-degree-path-${index}`,
        'text-anchor': 'middle',
        startOffset: '50%',
      }, `${start}°–${end}°`);
      degreePath.setAttributeNS(XLINK_NS, 'xlink:href', `#zodiac-degree-path-${index}`);
      degrees.append(degreePath);
      section.append(label, degrees);
      zodiacGroup.append(section);
    });
    this.svg.append(zodiacGroup);

    const nakshatraGroup = svgElement('g', { class: 'nakshatra-band', 'aria-label': 'Twenty-seven nakshatras' });
    NAKSHATRAS.forEach((nakshatra, index) => {
      const start = index * (360 / 27);
      const end = (index + 1) * (360 / 27);
      const section = svgElement('g', { class: 'nakshatra-section' });
      const sector = svgElement('path', {
        d: annularSectorPath(start, end, CHART.nakshatraInnerRadius, CHART.outerRadius),
        class: index % 2 ? 'nakshatra-sector nakshatra-sector-alt' : 'nakshatra-sector',
      });
      sector.append(svgElement('title', {}, `${nakshatra.name} · ${start.toFixed(4)}°–${end.toFixed(4)}°`));
      section.append(sector);

      const boundaryStart = longitudeToPoint(start, CHART.nakshatraInnerRadius);
      const boundaryEnd = longitudeToPoint(start, CHART.outerRadius);
      section.append(svgElement('line', {
        x1: boundaryStart.x, y1: boundaryStart.y,
        x2: boundaryEnd.x, y2: boundaryEnd.y,
        class: 'nakshatra-boundary',
      }));

      const text = svgElement('text', { class: 'nakshatra-label' });
      const full = svgElement('textPath', {
        href: `#nak-label-path-${index}`,
        'text-anchor': 'middle',
        startOffset: '50%',
        class: 'nak-full',
      }, nakshatra.name);
      full.setAttributeNS(XLINK_NS, 'xlink:href', `#nak-label-path-${index}`);
      const short = svgElement('textPath', {
        href: `#nak-label-path-${index}`,
        'text-anchor': 'middle',
        startOffset: '50%',
        class: 'nak-short',
      }, nakshatra.short);
      short.setAttributeNS(XLINK_NS, 'xlink:href', `#nak-label-path-${index}`);
      text.append(full, short);
      section.append(text);
      nakshatraGroup.append(section);
    });
    this.svg.append(nakshatraGroup);

    const cardinal = svgElement('g', { class: 'cardinal-mark', 'aria-hidden': 'true' });
    cardinal.append(svgElement('path', { d: 'M 400 6 L 393 20 L 407 20 Z' }));
    this.svg.append(cardinal);

    this.trailGroup = svgElement('g', { class: 'motion-trails', 'aria-hidden': 'true' });
    this.markerGroup = svgElement('g', { class: 'planet-markers', 'aria-label': 'Planet positions' });
    this.labelGroup = svgElement('g', { class: 'planet-labels', 'aria-hidden': 'true' });
    this.svg.append(this.trailGroup, this.markerGroup, this.labelGroup);

    const center = svgElement('g', { class: 'center-readout', 'aria-hidden': 'true' });
    this.centerEyebrow = svgElement('text', { x: 400, y: 378, class: 'center-eyebrow', 'text-anchor': 'middle' }, 'SIDEREAL TRANSITS');
    this.centerDate = svgElement('text', { x: 400, y: 400, class: 'center-date', 'text-anchor': 'middle' }, '—');
    this.centerState = svgElement('text', { x: 400, y: 418, class: 'center-state', 'text-anchor': 'middle' }, 'Loading ephemeris');
    this.centerDay = svgElement('text', { x: 400, y: 432, class: 'center-day', 'text-anchor': 'middle' }, '');
    center.append(this.centerEyebrow, this.centerDate, this.centerState, this.centerDay);
    this.svg.append(center);
  }

  setBodies(bodyConfigs) {
    this.bodyConfigs = bodyConfigs;
    const activeIds = new Set(bodyConfigs.map((body) => body.id));
    this.markers.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.group.remove();
        marker.name.remove();
        this.markers.delete(id);
      }
    });
    bodyConfigs.forEach((config) => this.ensureMarker(config));
  }

  ensureMarker(config) {
    if (this.markers.has(config.id)) return this.markers.get(config.id);
    const group = svgElement('g', {
      class: 'planet-marker',
      tabindex: '0',
      role: 'button',
      'data-body-id': config.id,
    });
    const selectedRing = svgElement('circle', { r: config.markerSize + 5, class: 'selected-ring' });
    const hitArea = svgElement('circle', { r: config.markerSize + 7, class: 'marker-hit-area' });
    const fallback = svgElement('text', {
      x: 0, y: 1, class: 'marker-fallback',
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, config.fallbackSymbol);
    const name = svgElement('text', {
      x: 0,
      y: 0,
      class: 'planet-name',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    }, config.displayName);
    group.append(selectedRing, hitArea);

    let image = null;
    if (config.iconPath) {
      const size = config.markerSize * 2;
      image = svgElement('image', {
        href: config.iconPath,
        x: -size / 2,
        y: -size / 2,
        width: size,
        height: size,
        class: 'planet-icon',
        preserveAspectRatio: 'xMidYMid meet',
        'aria-hidden': 'true',
      });
      fallback.classList.add('has-icon');
      image.addEventListener('error', () => {
        image.classList.add('is-missing');
        fallback.classList.remove('has-icon');
        console.warn(`[icons] Unable to load planet icon: ${config.iconPath}`);
      }, { once: true });
      group.append(image);
    }
    group.append(fallback);

    const retrogradeBadge = svgElement('g', { class: 'retrograde-badge', 'aria-hidden': 'true' });
    retrogradeBadge.append(
      svgElement('circle', { cx: config.markerSize, cy: -config.markerSize, r: 8 }),
      svgElement('text', { x: config.markerSize, y: -config.markerSize + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, '℞'),
    );
    const combustBadge = svgElement('g', { class: 'combust-badge', 'aria-hidden': 'true' });
    combustBadge.append(
      svgElement('circle', { cx: -config.markerSize, cy: -config.markerSize, r: 8 }),
      svgElement('text', { x: -config.markerSize, y: -config.markerSize + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, 'C'),
    );
    group.append(retrogradeBadge, combustBadge);

    group.addEventListener('pointerenter', () => this.showTooltip(config.id));
    group.addEventListener('pointerleave', () => {
      if (document.activeElement !== group) this.hideTooltip(config.id);
    });
    group.addEventListener('focus', () => this.showTooltip(config.id));
    group.addEventListener('blur', () => this.hideTooltip(config.id));
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
    this.labelGroup.append(name);
    const marker = { group, name, config, retrogradeBadge, combustBadge };
    this.markers.set(config.id, marker);
    return marker;
  }

  renderFrame(fromRecord, toRecord, progress = 0) {
    if (!fromRecord) return;
    this.currentRecord = fromRecord;
    const positions = [];

    this.bodyConfigs.forEach((config) => {
      if (this.hiddenBodyIds.has(config.id)) return;
      const from = fromRecord.planets[config.id];
      const to = toRecord?.planets[config.id] ?? from;
      if (!from) return;
      const unwrapped = Number.isFinite(from.unwrappedLongitude)
        ? from.unwrappedLongitude + ((to?.unwrappedLongitude ?? from.unwrappedLongitude) - from.unwrappedLongitude) * progress
        : from.longitude;
      positions.push({
        id: config.id,
        longitude: normalizeLongitude(unwrapped),
        unwrapped,
        order: config.defaultOrder,
        trackPriority: config.trackPriority,
      });
    });

    // The Moon has a dedicated innermost orbit so its rapid daily motion never
    // changes conjunction lanes for slower bodies.
    const lanes = assignPlanetLanes(positions.filter((position) => position.id !== 'moon'));
    if (positions.some((position) => position.id === 'moon')) {
      lanes.set('moon', {
        radius: CHART.moonTrackRadius,
        laneIndex: 0,
        groupSize: 1,
        groupIds: ['moon'],
      });
    }
    this.currentFramePositions.clear();
    const visibleIds = new Set();

    positions.forEach((position) => {
      const marker = this.markers.get(position.id);
      const lane = lanes.get(position.id);
      if (!marker || !lane) return;
      visibleIds.add(position.id);
      const point = longitudeToPoint(position.longitude, lane.radius);
      marker.group.setAttribute('transform', `translate(${point.x.toFixed(3)} ${point.y.toFixed(3)})`);
      marker.name.setAttribute('x', point.x.toFixed(3));
      marker.name.setAttribute('y', (point.y + marker.config.markerSize + 4).toFixed(3));
      const planet = fromRecord.planets[position.id];
      marker.group.classList.toggle('is-retrograde', planet?.motion === 'retrograde');
      marker.group.classList.toggle('is-stationary', planet?.motion === 'stationary');
      marker.group.classList.toggle('is-combust', planet?.combust === true);
      marker.group.classList.toggle('is-selected', position.id === this.selectedBodyId);
      marker.group.removeAttribute('hidden');
      marker.name.removeAttribute('hidden');

      const motionLabel = planet.motion === 'retrograde' ? 'retrograde' : planet.motion === 'stationary' ? 'stationary' : 'direct';
      const combustionLabel = planet.combust ? ', combust' : '';
      marker.group.setAttribute('aria-label', `${marker.config.displayName}, ${formatWithinSign(planet.longitude)}, ${motionLabel}${combustionLabel}. Select for details.`);
      this.currentFramePositions.set(position.id, { ...position, point, lane });
    });

    this.markers.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.group.setAttribute('hidden', '');
        marker.name.setAttribute('hidden', '');
      }
    });

    if (this.hoveredBodyId) this.showTooltip(this.hoveredBodyId);
  }

  renderTrails(records, bodyId) {
    this.trailGroup.replaceChildren();
    if (!this.trailsEnabled || !bodyId || this.hiddenBodyIds.has(bodyId) || !records?.length) return;
    const available = records.slice(-10).filter((record) => record.planets[bodyId]);
    available.forEach((record, index) => {
      const radius = bodyId === 'moon' ? CHART.moonTrackRadius : CHART.planetPrimaryRadius;
      const point = longitudeToPoint(record.planets[bodyId].longitude, radius);
      this.trailGroup.append(svgElement('circle', {
        cx: point.x,
        cy: point.y,
        r: 2.2 + index * 0.14,
        class: 'trail-point',
        opacity: ((index + 1) / available.length * 0.55).toFixed(2),
      }));
    });
  }

  setTrailsEnabled(enabled) {
    this.trailsEnabled = Boolean(enabled);
    if (!enabled) this.trailGroup.replaceChildren();
  }

  setSelectedBody(bodyId) {
    this.selectedBodyId = bodyId;
    this.markers.forEach((marker, id) => marker.group.classList.toggle('is-selected', id === bodyId));
  }

  setHiddenBodyIds(bodyIds) {
    this.hiddenBodyIds = new Set(bodyIds);
    if (this.hoveredBodyId && this.hiddenBodyIds.has(this.hoveredBodyId)) {
      this.hideTooltip(this.hoveredBodyId);
    }
  }

  setCenterReadout(record, playing, index, count) {
    this.centerDate.textContent = record ? formatDate(record.date, { month: 'short', day: 'numeric' }) : '—';
    this.centerState.textContent = playing ? 'Playing daily motion' : 'Paused';
    this.centerDay.textContent = record ? `DAY ${index + 1} OF ${count}` : '';
  }

  showTooltip(bodyId) {
    const marker = this.markers.get(bodyId);
    const planet = this.currentRecord?.planets[bodyId];
    const frame = this.currentFramePositions.get(bodyId);
    if (!marker || !planet || !frame) return;
    this.hoveredBodyId = bodyId;
    const zodiac = getZodiacPosition(planet.longitude);
    const nakshatra = getNakshatraPosition(planet.longitude);
    const motion = planet.motion === 'retrograde' ? 'Retrograde' : planet.motion === 'stationary' ? 'Stationary' : 'Direct';
    const groupNames = frame.lane.groupSize > 1
      ? frame.lane.groupIds.map((id) => BODY_BY_ID.get(id)?.displayName ?? id).join(', ')
      : '';
    this.tooltip.innerHTML = `
      <div class="tooltip-heading"><strong>${escapeHtml(marker.config.displayName)}</strong><span class="tooltip-chips"><span class="motion-chip ${escapeHtml(planet.motion)}">${motion}</span>${planet.combust ? '<span class="condition-chip combust">C · Combust</span>' : ''}</span></div>
      <div class="tooltip-date">${escapeHtml(formatDate(this.currentRecord.date))}</div>
      <dl>
        <div><dt>Longitude</dt><dd>${escapeHtml(formatLongitude(planet.longitude))}</dd></div>
        <div><dt>Zodiac</dt><dd>${escapeHtml(formatWithinSign(planet.longitude))}</dd></div>
        <div><dt>Nakshatra</dt><dd>${escapeHtml(nakshatra.nakshatra.name)} · Pada ${nakshatra.pada}</dd></div>
        <div><dt>Within nakshatra</dt><dd>${escapeHtml(formatLongitude(nakshatra.degreesWithinNakshatra))}</dd></div>
        <div><dt>Daily speed</dt><dd>${planet.speed >= 0 ? '+' : ''}${planet.speed.toFixed(5)}°/day</dd></div>
        ${planet.combustionLimit !== null ? `<div><dt>Solar separation</dt><dd>${planet.solarSeparation.toFixed(2)}° · limit ${planet.combustionLimit}°</dd></div>` : ''}
        ${groupNames ? `<div><dt>Conjunction</dt><dd>${escapeHtml(groupNames)}</dd></div>` : ''}
      </dl>`;
    this.tooltip.hidden = false;
    this.tooltip.setAttribute('aria-hidden', 'false');
    this.positionTooltip(frame.point);
  }

  hideTooltip(bodyId) {
    if (this.hoveredBodyId !== bodyId) return;
    this.hoveredBodyId = null;
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('aria-hidden', 'true');
  }

  positionTooltip(point) {
    const svgRect = this.svg.getBoundingClientRect();
    const parentRect = this.svg.parentElement.getBoundingClientRect();
    const x = svgRect.left - parentRect.left + point.x / CHART.size * svgRect.width;
    const y = svgRect.top - parentRect.top + point.y / CHART.size * svgRect.height;
    const tooltipWidth = this.tooltip.offsetWidth || 260;
    const tooltipHeight = this.tooltip.offsetHeight || 240;
    const left = Math.min(parentRect.width - tooltipWidth - 10, Math.max(10, x + 18));
    const top = Math.min(parentRect.height - tooltipHeight - 10, Math.max(10, y - tooltipHeight / 2));
    this.tooltip.style.transform = `translate(${left}px, ${top}px)`;
  }
}
