import { NAKSHATRAS, ZODIAC } from './constants.js';

export const NAKSHATRA_SPAN = 360 / 27;
export const PADA_SPAN = NAKSHATRA_SPAN / 4;

export function normalizeLongitude(value) {
  const longitude = Number(value);
  if (!Number.isFinite(longitude)) return Number.NaN;
  return ((longitude % 360) + 360) % 360;
}

/**
 * Converts sidereal longitude to an SVG point. The wheel orientation is fixed:
 * 0° Aries is at 12 o'clock and longitude increases clockwise. SVG's native
 * y-axis points downward, so longitude - 90° maps directly into x/y space.
 */
export function longitudeToPoint(longitude, radius, center = 400) {
  const radians = (normalizeLongitude(longitude) - 90) * Math.PI / 180;
  return {
    x: center + Math.cos(radians) * radius,
    y: center + Math.sin(radians) * radius,
  };
}

export function pointOnCircle(angle, radius, center = 400) {
  return longitudeToPoint(angle, radius, center);
}

export function describeArc(startLongitude, endLongitude, radius, center = 400, reverse = false) {
  const start = longitudeToPoint(reverse ? endLongitude : startLongitude, radius, center);
  const end = longitudeToPoint(reverse ? startLongitude : endLongitude, radius, center);
  const span = Math.abs(endLongitude - startLongitude);
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${span > 180 ? 1 : 0} ${reverse ? 0 : 1} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

export function annularSectorPath(startLongitude, endLongitude, innerRadius, outerRadius, center = 400) {
  const outerStart = longitudeToPoint(startLongitude, outerRadius, center);
  const outerEnd = longitudeToPoint(endLongitude, outerRadius, center);
  const innerEnd = longitudeToPoint(endLongitude, innerRadius, center);
  const innerStart = longitudeToPoint(startLongitude, innerRadius, center);
  const largeArc = endLongitude - startLongitude > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function shortestSignedDelta(fromLongitude, toLongitude) {
  const from = normalizeLongitude(fromLongitude);
  const to = normalizeLongitude(toLongitude);
  return ((to - from + 540) % 360) - 180;
}

export function circularSeparation(first, second) {
  return Math.abs(shortestSignedDelta(first, second));
}

export function getZodiacPosition(longitude) {
  const normalized = normalizeLongitude(longitude);
  const index = Math.min(11, Math.floor(normalized / 30));
  return {
    index,
    sign: ZODIAC[index],
    degreesWithinSign: normalized - index * 30,
  };
}

/** Each nakshatra is 13°20′ and each of its four padas is 3°20′. */
export function getNakshatraPosition(longitude) {
  const normalized = normalizeLongitude(longitude);
  const index = Math.min(26, Math.floor(normalized / NAKSHATRA_SPAN));
  const degreesWithinNakshatra = normalized - index * NAKSHATRA_SPAN;
  return {
    index,
    nakshatra: NAKSHATRAS[index],
    degreesWithinNakshatra,
    pada: Math.min(4, Math.floor(degreesWithinNakshatra / PADA_SPAN) + 1),
  };
}

export function splitDegrees(value) {
  let totalSeconds = Math.round(Math.max(0, value) * 3600);
  const degrees = Math.floor(totalSeconds / 3600);
  totalSeconds -= degrees * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return { degrees, minutes, seconds };
}

export function formatLongitude(longitude, includeSeconds = true) {
  const normalized = normalizeLongitude(longitude);
  const { degrees, minutes, seconds } = splitDegrees(normalized);
  return includeSeconds
    ? `${degrees}° ${String(minutes).padStart(2, '0')}′ ${String(seconds).padStart(2, '0')}″`
    : `${degrees}° ${String(minutes).padStart(2, '0')}′`;
}

export function formatWithinSign(longitude) {
  const zodiac = getZodiacPosition(longitude);
  const dms = splitDegrees(zodiac.degreesWithinSign);
  return `${dms.degrees}° ${String(dms.minutes).padStart(2, '0')}′ ${String(dms.seconds).padStart(2, '0')}″ ${zodiac.sign.name}`;
}

export function formatDate(dateString, options = {}) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function daysBetween(first, second) {
  const a = new Date(`${first}T00:00:00Z`).getTime();
  const b = new Date(`${second}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

