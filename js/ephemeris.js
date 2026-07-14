import {
  BODY_BY_ID,
  getBodyConfig,
  getCombustionLimit,
  STATIONARY_THRESHOLD,
  ZODIAC,
} from './constants.js';
import {
  circularSeparation,
  daysBetween,
  isIsoCalendarDate,
  normalizeLongitude,
  shortestSignedDelta,
} from './utils.js';

const yearCache = new Map();
const signIndex = new Map(ZODIAC.map((sign, index) => [sign.name.toLowerCase(), index]));

export class EphemerisError extends Error {
  constructor(message, code = 'EPHEMERIS_ERROR', cause) {
    super(message, { cause });
    this.name = 'EphemerisError';
    this.code = code;
  }
}

export async function loadEphemerisYear(year) {
  if (yearCache.has(year)) return yearCache.get(year);
  if (window.location.protocol === 'file:') {
    throw new EphemerisError(
      'Ephemeris files cannot be loaded from a file:// URL. Start a local HTTP server and open the app through http://localhost.',
      'FILE_PROTOCOL',
    );
  }

  const promise = fetch(`data/ephemeris_${year}.json`, { cache: 'default' })
    .then(async (response) => {
      if (!response.ok) {
        throw new EphemerisError(
          `Unable to load ephemeris data for ${year}. Please verify that data/ephemeris_${year}.json exists.`,
          response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
        );
      }
      try {
        return await response.json();
      } catch (error) {
        throw new EphemerisError(`The ephemeris file for ${year} contains invalid JSON.`, 'INVALID_JSON', error);
      }
    })
    .then((raw) => normalizeEphemeris(raw, year))
    .catch((error) => {
      yearCache.delete(year);
      throw error;
    });

  yearCache.set(year, promise);
  return promise;
}

/**
 * Adapter for the repository schema:
 * [{ date, Sun: { sign, degrees }, ... }]. Source degrees are within a sign,
 * so absolute longitude is signIndex * 30 + degrees. The source contains no
 * speed or retrograde property; both are derived later from daily deltas.
 */
export function normalizeEphemeris(raw, expectedYear) {
  if (!Array.isArray(raw)) {
    throw new EphemerisError(`The ephemeris file for ${expectedYear} must contain a JSON array.`, 'INVALID_SCHEMA');
  }
  if (!raw.length) {
    throw new EphemerisError(`The ephemeris file for ${expectedYear} contains no daily records.`, 'EMPTY_DATASET');
  }

  const byDate = new Map();
  const bodyConfigs = new Map();
  let invalidDateCount = 0;
  let invalidPositionCount = 0;

  raw.forEach((sourceRecord, sourceIndex) => {
    if (!sourceRecord || typeof sourceRecord !== 'object' || !isIsoCalendarDate(sourceRecord.date)) {
      invalidDateCount += 1;
      console.warn(`[ephemeris] Skipping record ${sourceIndex}: invalid ISO date.`);
      return;
    }

    const planets = {};
    Object.entries(sourceRecord).forEach(([dataKey, sourceBody]) => {
      if (dataKey === 'date') return;
      const config = getBodyConfig(dataKey);
      bodyConfigs.set(config.id, config);

      const sign = String(sourceBody?.sign ?? '').toLowerCase();
      const degrees = Number(sourceBody?.degrees);
      const index = signIndex.get(sign);
      if (index === undefined || !Number.isFinite(degrees)) {
        invalidPositionCount += 1;
        console.warn(`[ephemeris] ${sourceRecord.date}: skipping invalid ${dataKey} position.`);
        return;
      }

      const longitude = normalizeLongitude(index * 30 + degrees);
      planets[config.id] = {
        longitude,
        speed: Number.isFinite(Number(sourceBody.speed)) ? Number(sourceBody.speed) : null,
        retrograde: typeof sourceBody.retrograde === 'boolean' ? sourceBody.retrograde : null,
        sourceSign: sourceBody.sign,
        sourceDegrees: degrees,
      };
    });

    if (byDate.has(sourceRecord.date)) {
      console.warn(`[ephemeris] Duplicate ${sourceRecord.date}; keeping the later record.`);
    }
    byDate.set(sourceRecord.date, { date: sourceRecord.date, planets });
  });

  const records = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!records.length) {
    throw new EphemerisError(`No valid dated records were found for ${expectedYear}.`, 'EMPTY_DATASET');
  }

  preprocessMotion(records, bodyConfigs);
  applyCombustion(records);
  return {
    year: expectedYear,
    records,
    bodies: [...bodyConfigs.values()].sort((a, b) => a.defaultOrder - b.defaultOrder),
    warnings: { invalidDateCount, invalidPositionCount },
  };
}

/**
 * Adds a normalized solar condition after motion state has been derived, since
 * Mercury, Venus, and Mars use a tighter combustion orb while retrograde.
 */
export function applyCombustion(records) {
  records.forEach((record) => {
    const sun = record.planets.sun;
    Object.entries(record.planets).forEach(([bodyId, planet]) => {
      const limit = getCombustionLimit(bodyId, planet.retrograde);
      planet.combustionLimit = limit;
      planet.solarSeparation = sun && bodyId !== 'sun'
        ? circularSeparation(sun.longitude, planet.longitude)
        : null;
      planet.combust = limit !== null
        && Number.isFinite(planet.solarSeparation)
        && planet.solarSeparation <= limit;
    });
  });
}

/**
 * Builds a continuous longitude series. A shortest signed daily difference
 * turns 359°→1° into +2° and 1°→359° into -2°. If future data supplies speed
 * or an explicit retrograde flag, that directional evidence resolves the rare
 * ±180° ambiguity. The resulting unwrapped value is safe to interpolate.
 */
export function preprocessMotion(records, bodyConfigs) {
  for (const config of bodyConfigs.values()) {
    let previous = null;
    let previousDate = null;

    records.forEach((record) => {
      const current = record.planets[config.id];
      if (!current) return;

      if (!previous) {
        current.unwrappedLongitude = current.longitude;
      } else {
        const elapsedDays = daysBetween(previousDate, record.date);
        let delta = shortestSignedDelta(previous.longitude, current.longitude);

        const explicitDirection = Number.isFinite(current.speed)
          ? Math.sign(current.speed)
          : current.retrograde === true ? -1 : current.retrograde === false ? 1 : 0;
        // Explicit direction matters most when records are separated by a long
        // gap and the true travel can exceed 180°. Daily supplied records never
        // hit this ambiguity, but the adapter remains correct for sparse data.
        if (explicitDirection > 0 && delta < 0) delta += 360;
        if (explicitDirection < 0 && delta > 0) delta -= 360;

        current.unwrappedLongitude = previous.unwrappedLongitude + delta;
        if (!Number.isFinite(current.speed)) current.speed = delta / elapsedDays;
      }

      previous = current;
      previousDate = record.date;
    });

    const available = records.filter((record) => record.planets[config.id]);
    available.forEach((record, index) => {
      const current = record.planets[config.id];
      if (!Number.isFinite(current.speed)) {
        const next = available[index + 1]?.planets[config.id];
        const nextDate = available[index + 1]?.date;
        current.speed = next
          ? (next.unwrappedLongitude - current.unwrappedLongitude) / daysBetween(record.date, nextDate)
          : 0;
      }
      current.motion = Math.abs(current.speed) <= STATIONARY_THRESHOLD
        ? 'stationary'
        : current.speed < 0 ? 'retrograde' : 'direct';
      if (current.retrograde === null) current.retrograde = current.motion === 'retrograde';
    });
  }

  // Keep known configs available even if a malformed record omits them.
  for (const [id, config] of BODY_BY_ID) {
    if (records.some((record) => record.planets[id])) bodyConfigs.set(id, config);
  }
}
