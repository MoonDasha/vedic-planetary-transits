import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assignPlanetLanes } from '../js/collision.js';
import { BODY_BY_ID, CHART, getCombustionLimit } from '../js/constants.js';
import { normalizeEphemeris } from '../js/ephemeris.js';
import { getHouseForLongitude } from '../js/north-indian-chart.js';
import {
  getNakshatraPosition,
  longitudeToPoint,
  shortestSignedDelta,
} from '../js/utils.js';

async function readYear(year) {
  return JSON.parse(await readFile(new URL(`../data/ephemeris_${year}.json`, import.meta.url), 'utf8'));
}

const raw2026 = await readYear(2026);
const normalized2026 = normalizeEphemeris(raw2026, 2026);
assert.equal(normalized2026.records.length, 365, '2026 should contain 365 daily records');
assert.equal(normalized2026.bodies.length, 12, 'all twelve dataset bodies should be configured');
assert.equal(BODY_BY_ID.get('uranus').iconPath, 'icons/uranus-icon.png');
assert.equal(BODY_BY_ID.get('neptune').iconPath, 'icons/neptune-icon.png');
assert.equal(BODY_BY_ID.get('pluto').iconPath, 'icons/pluto-icon.png');
assert.ok(CHART.moonTrackRadius < CHART.planetPrimaryRadius, 'Moon should have the innermost dedicated track');
assert.equal(normalized2026.records[0].date, '2026-01-01');
assert.equal(normalized2026.records.at(-1).date, '2026-12-31');
assert.ok(Math.abs(normalized2026.records[0].planets.sun.longitude - 256.6229) < 1e-9);
assert.equal(normalized2026.records[0].planets.jupiter.motion, 'retrograde');
assert.equal(normalized2026.records[0].planets.rahu.motion, 'retrograde');
assert.equal(getCombustionLimit('mercury', false), 14);
assert.equal(getCombustionLimit('mercury', true), 12);
assert.equal(getCombustionLimit('moon', false), null, 'Moon does not receive combustion');
assert.equal(getCombustionLimit('rahu', false), null);

const combustionSample = normalizeEphemeris([
  {
    date: '2026-01-01',
    Sun: { sign: 'Aries', degrees: 0 },
    Mercury: { sign: 'Aries', degrees: 13 },
    Venus: { sign: 'Aries', degrees: 11 },
    Jupiter: { sign: 'Aries', degrees: 10 },
    Rahu: { sign: 'Aries', degrees: 1 },
  },
  {
    date: '2026-01-02',
    Sun: { sign: 'Aries', degrees: 1 },
    Mercury: { sign: 'Aries', degrees: 14 },
    Venus: { sign: 'Aries', degrees: 12 },
    Jupiter: { sign: 'Aries', degrees: 11 },
    Rahu: { sign: 'Pisces', degrees: 29 },
  },
], 2026);
assert.equal(combustionSample.records[0].planets.mercury.combust, true);
assert.equal(combustionSample.records[0].planets.venus.combust, false);
assert.equal(combustionSample.records[0].planets.jupiter.combust, true);
assert.equal(combustionSample.records[0].planets.rahu.combust, false, 'lunar nodes do not combust');

assert.equal(getHouseForLongitude(5, 0), 1, 'Aries belongs to house one for Aries ascendant');
assert.equal(getHouseForLongitude(35, 0), 2);
assert.equal(getHouseForLongitude(355, 0), 12);
assert.equal(getHouseForLongitude(95, 3), 1, 'Cancer belongs to house one for Cancer ascendant');
assert.equal(getHouseForLongitude(5, 3), 10, 'Aries becomes the tenth house for Cancer ascendant');

const raw2024 = await readYear(2024);
const normalized2024 = normalizeEphemeris(raw2024, 2024);
assert.equal(normalized2024.records.length, 366, 'leap years must derive 366 slider records');
assert.equal(normalized2024.records[59].date, '2024-02-29');

assert.equal(shortestSignedDelta(359, 1), 2, 'direct Aries wrap should move forward two degrees');
assert.equal(shortestSignedDelta(1, 359), -2, 'retrograde Aries wrap should move backward two degrees');

const zero = longitudeToPoint(0, 100);
const ninety = longitudeToPoint(90, 100);
assert.deepEqual({ x: Math.round(zero.x), y: Math.round(zero.y) }, { x: 400, y: 300 });
assert.deepEqual({ x: Math.round(ninety.x), y: Math.round(ninety.y) }, { x: 500, y: 400 });

assert.equal(getNakshatraPosition(0).nakshatra.name, 'Ashwini');
assert.equal(getNakshatraPosition(3.34).pada, 2);
assert.equal(getNakshatraPosition(359.999).nakshatra.name, 'Revati');

const lanes = assignPlanetLanes([
  { id: 'sun', longitude: 359, order: 0 },
  { id: 'moon', longitude: 1, order: 1 },
  { id: 'mars', longitude: 50, order: 2 },
]);
assert.equal(lanes.get('sun').groupSize, 2, '359° and 1° should form one circular conjunction group');
assert.equal(lanes.get('sun').laneIndex, 0, 'priority order should get the primary track');
assert.equal(lanes.get('moon').laneIndex, 1, 'second conjunction body should stack inward');
assert.equal(lanes.get('mars').groupSize, 1);

const anchoredLanes = assignPlanetLanes([
  { id: 'saturn', longitude: 334, order: 6, trackPriority: 3 },
  { id: 'mercury', longitude: 335, order: 3, trackPriority: 10 },
]);
assert.equal(anchoredLanes.get('saturn').laneIndex, 0, 'slow Saturn should retain the primary track');
assert.equal(anchoredLanes.get('mercury').laneIndex, 1, 'fast Mercury should take the detour lane');

const slowConjunctionLanes = assignPlanetLanes([
  { id: 'neptune', longitude: 15, order: 10, trackPriority: 1 },
  { id: 'jupiter', longitude: 16, order: 4, trackPriority: 4 },
]);
assert.equal(slowConjunctionLanes.get('neptune').laneIndex, 0);
assert.equal(slowConjunctionLanes.get('jupiter').laneIndex, 1, 'one slow body may yield when two slow bodies conjoin');

const sparse = normalizeEphemeris([
  { date: '2026-01-01', Sun: { sign: 'Pisces', degrees: 29 } },
  { date: '2026-01-03', Sun: { sign: 'Aries', degrees: 1 }, Moon: { sign: 'Aries', degrees: 'bad' } },
], 2026);
assert.equal(sparse.records[1].planets.sun.speed, 1, 'speed should account for missing calendar dates');
assert.equal(sparse.records[1].planets.moon, undefined, 'one invalid body must not reject the daily record');
assert.equal(sparse.records[1].planets.sun.unwrappedLongitude, 361, 'direct wrap should remain continuous');

for (let year = 2000; year <= 2050; year += 1) {
  const normalized = normalizeEphemeris(await readYear(year), year);
  assert.equal(normalized.records[0].date, `${year}-01-01`);
  assert.equal(normalized.records.at(-1).date, `${year}-12-31`);
  assert.ok(normalized.records.every((record, index, records) => index === 0 || record.date > records[index - 1].date));
  assert.ok(normalized.records.every((record) => Object.values(record.planets).every((planet) => (
    Number.isFinite(planet.longitude)
    && Number.isFinite(planet.unwrappedLongitude)
    && Number.isFinite(planet.speed)
    && typeof planet.combust === 'boolean'
    && planet.longitude >= 0
    && planet.longitude < 360
  ))));
}

console.log('All ephemeris, combustion, house, geometry, wraparound, leap-year, and collision tests passed.');
