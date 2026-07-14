import { CHART } from './constants.js';
import { circularSeparation, normalizeLongitude } from './utils.js';

/**
 * Groups close longitudes, including conjunctions straddling 0° Aries, then
 * assigns deterministic inward radial lanes. Track priority is based on orbital
 * mobility: slow bodies remain anchored while faster bodies yield and take the
 * detour lanes. Angles are never altered, preserving true longitude.
 */
export function assignPlanetLanes(positions, options = {}) {
  const threshold = options.threshold ?? CHART.collisionThreshold;
  const primaryRadius = options.primaryRadius ?? CHART.planetPrimaryRadius;
  const laneGap = options.laneGap ?? CHART.planetLaneGap;
  const sorted = positions
    .filter((position) => Number.isFinite(position.longitude))
    .map((position) => ({ ...position, longitude: normalizeLongitude(position.longitude) }))
    .sort((a, b) => a.longitude - b.longitude || a.order - b.order);

  if (!sorted.length) return new Map();

  const groups = [];
  sorted.forEach((position) => {
    const current = groups.at(-1);
    if (!current || circularSeparation(current.at(-1).longitude, position.longitude) > threshold) {
      groups.push([position]);
    } else {
      current.push(position);
    }
  });

  if (groups.length > 1) {
    const first = groups[0];
    const last = groups.at(-1);
    if (circularSeparation(last.at(-1).longitude, first[0].longitude) <= threshold) {
      groups[0] = [...last, ...first];
      groups.pop();
    }
  }

  const assignments = new Map();
  groups.forEach((group) => {
    const laneOrder = [...group].sort((a, b) => (
      (a.trackPriority ?? a.order) - (b.trackPriority ?? b.order)
      || a.order - b.order
      || a.id.localeCompare(b.id)
    ));
    laneOrder.forEach((position, laneIndex) => {
      assignments.set(position.id, {
        radius: primaryRadius - laneIndex * laneGap,
        laneIndex,
        groupSize: group.length,
        groupIds: laneOrder.map((member) => member.id),
      });
    });
  });
  return assignments;
}
