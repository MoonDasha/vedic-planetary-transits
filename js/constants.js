export const YEAR_MIN = 2000;
export const YEAR_MAX = 2050;

export const ZODIAC = [
  { name: 'Aries', short: 'Ari', iconPath: 'icons/aries-icon.jpg' },
  { name: 'Taurus', short: 'Tau', iconPath: 'icons/taurus-icon.jpg' },
  { name: 'Gemini', short: 'Gem', iconPath: 'icons/gemini-icon.jpg' },
  { name: 'Cancer', short: 'Can', iconPath: 'icons/cancer-icon.jpg' },
  { name: 'Leo', short: 'Leo', iconPath: 'icons/leo-icon.jpg' },
  { name: 'Virgo', short: 'Vir', iconPath: 'icons/virgo-icon.jpg' },
  { name: 'Libra', short: 'Lib', iconPath: 'icons/libra-icon.jpg' },
  { name: 'Scorpio', short: 'Sco', iconPath: 'icons/scorpio-icon.jpg' },
  { name: 'Sagittarius', short: 'Sag', iconPath: 'icons/sagittarius-icon.jpg' },
  { name: 'Capricorn', short: 'Cap', iconPath: 'icons/capricorn-icon.jpg' },
  { name: 'Aquarius', short: 'Aqu', iconPath: 'icons/aquarius-icon.jpg' },
  { name: 'Pisces', short: 'Pis', iconPath: 'icons/pisces-icon.jpg' },
];

export const NAKSHATRAS = [
  ['Ashwini', 'Ash'], ['Bharani', 'Bha'], ['Krittika', 'Kri'],
  ['Rohini', 'Roh'], ['Mrigashira', 'Mri'], ['Ardra', 'Ard'],
  ['Punarvasu', 'Pun'], ['Pushya', 'Pus'], ['Ashlesha', 'Asl'],
  ['Magha', 'Mag'], ['Purva Phalguni', 'P.Pha'], ['Uttara Phalguni', 'U.Pha'],
  ['Hasta', 'Has'], ['Chitra', 'Chi'], ['Swati', 'Swa'],
  ['Vishakha', 'Vis'], ['Anuradha', 'Anu'], ['Jyeshtha', 'Jye'],
  ['Mula', 'Mul'], ['Purva Ashadha', 'P.Ash'], ['Uttara Ashadha', 'U.Ash'],
  ['Shravana', 'Shr'], ['Dhanishtha', 'Dha'], ['Shatabhisha', 'Sha'],
  ['Purva Bhadrapada', 'P.Bha'], ['Uttara Bhadrapada', 'U.Bha'], ['Revati', 'Rev'],
].map(([name, short], index) => ({ name, short, index }));

const BODY_ROWS = [
  // The final value is track priority: lower numbers are more anchored.
  ['sun', 'Sun', 'Sun', 'icons/sun-icon.png', '☉', 0, 18, 7],
  ['moon', 'Moon', 'Moon', 'icons/moon-icon.png', '☽', 1, 18, 11],
  ['mars', 'Mars', 'Mars', 'icons/mars-icon.png', '♂', 2, 18, 8],
  ['mercury', 'Mercury', 'Mercury', 'icons/mercury-icon.png', '☿', 3, 18, 10],
  ['jupiter', 'Jupiter', 'Jupiter', 'icons/jupiter-icon.png', '♃', 4, 18, 4],
  ['venus', 'Venus', 'Venus', 'icons/venus-icon.png', '♀', 5, 18, 9],
  ['saturn', 'Saturn', 'Saturn', 'icons/saturn-icon.png', '♄', 6, 18, 3],
  ['rahu', 'Rahu', 'Rahu', 'icons/rahu-icon.png', '☊', 7, 18, 5],
  ['ketu', 'Ketu', 'Ketu', 'icons/ketu-icon.png', '☋', 8, 18, 6],
  ['uranus', 'Uranus', 'Uranus', 'icons/uranus-icon.png', '♅', 9, 18, 2],
  ['neptune', 'Neptune', 'Neptune', 'icons/neptune-icon.png', '♆', 10, 18, 1],
  ['pluto', 'Pluto', 'Pluto', 'icons/pluto-icon.png', '♇', 11, 18, 0],
];

export const BODIES = BODY_ROWS.map((row) => ({
  id: row[0],
  displayName: row[1],
  dataKey: row[2],
  iconPath: row[3],
  fallbackSymbol: row[4],
  defaultOrder: row[5],
  markerSize: row[6],
  trackPriority: row[7],
  tooltipLabel: `${row[1]} transit`,
}));

export const BODY_BY_ID = new Map(BODIES.map((body) => [body.id, body]));
export const BODY_BY_DATA_KEY = new Map(BODIES.map((body) => [body.dataKey.toLowerCase(), body]));

// Traditional Parashari combustion limits, measured as absolute angular
// separation from the Sun. Nodes, the Sun, and modern outer planets do not
// receive a combustion state. Retrograde limits are used where the classical
// table distinguishes them.
export const COMBUSTION_LIMITS = Object.freeze({
  mars: { direct: 17, retrograde: 8 },
  mercury: { direct: 14, retrograde: 12 },
  jupiter: { direct: 11, retrograde: 11 },
  venus: { direct: 10, retrograde: 8 },
  saturn: { direct: 15, retrograde: 15 },
});

export function getCombustionLimit(bodyId, retrograde = false) {
  const limits = COMBUSTION_LIMITS[bodyId];
  if (!limits) return null;
  return retrograde ? limits.retrograde : limits.direct;
}

export function getBodyConfig(dataKey) {
  const known = BODY_BY_DATA_KEY.get(String(dataKey).toLowerCase());
  if (known) return known;

  const displayName = String(dataKey).trim() || 'Unknown body';
  return {
    id: displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    displayName,
    dataKey: displayName,
    iconPath: null,
    fallbackSymbol: displayName.slice(0, 2).toUpperCase(),
    defaultOrder: 100,
    markerSize: 18,
    trackPriority: 100,
    tooltipLabel: `${displayName} transit`,
  };
}

export const CHART = {
  size: 800,
  center: 400,
  outerRadius: 388,
  nakshatraInnerRadius: 342,
  zodiacOuterRadius: 338,
  zodiacInnerRadius: 258,
  planetPrimaryRadius: 222,
  planetLaneGap: 32,
  moonTrackRadius: 112,
  centerRadius: 72,
  collisionThreshold: 7.5,
};

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10];
export const BASE_DAY_DURATION = 900;
export const STATIONARY_THRESHOLD = 0.0005;
