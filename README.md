# Vedic Planetary Transits

An interactive Vedic astrology transit calculator and planetary transit animator for exploring daily sidereal planetary positions from 1950 through 2050.

Vedic Planetary Transits combines a circular zodiac wheel, a North Indian Vedic chart, 27 nakshatras, four padas, daily planetary speed, retrograde motion, combustion, conjunction handling, and a complete planetary positions table. The interface is built with semantic HTML, modern CSS, SVG, and vanilla JavaScript. It requires no framework, package installation, database, or build step.

This open source project is built by [Moon Dasha](https://moondasha.com/).

## Vedic astrology transit calculator

Planetary transits describe the current movement of the grahas through the sidereal zodiac. In Jyotish, the same transit can be studied through zodiac signs, houses, nakshatras, padas, conjunctions, planetary speed, retrograde periods, and combustion.

This project turns daily ephemeris data into an animated visual experience. Each playback step represents one available calendar day. Planet markers move smoothly between records while the date, longitude, sign, nakshatra, pada, speed, and motion status remain synchronized with the active daily record.

The calculator can help users explore questions such as:

- Which zodiac sign is each planet transiting?
- Which nakshatra and pada currently contain a planet?
- When does a planet change signs or nakshatras?
- When does Mercury, Venus, Mars, Jupiter, or Saturn turn retrograde?
- Which planets are conjunct or close together?
- Which eligible planets are combust because of their proximity to the Sun?
- How do planetary transits appear in a North Indian Vedic astrology chart?
- How does changing the ascendant redistribute zodiac signs and planets through the houses?

The visualization is educational and exploratory. Transit interpretation becomes personal only when current planetary positions are compared with a natal chart, house lords, dashas, aspects, divisional charts, and the wider context of the horoscope.

## Key features

- Daily Vedic planetary transits from 1950 to 2050
- Sidereal zodiac wheel with Aries at the top and longitude increasing clockwise
- All 12 zodiac signs with icons, names, boundaries, and degree ranges
- All 27 nakshatras with circular labels and radial separators
- Automatic nakshatra and pada calculations
- North Indian Vedic astrology chart with selectable ascendant
- Daily playback, pause, restart, previous day, next day, and jump-to-end controls
- Calendar date selection and full-year timeline scrubbing
- Playback speeds from 0.25x to 10x without skipping daily records
- Retrograde-aware longitude interpolation across the 0 degree Aries boundary
- Derived daily speed and stationary-motion detection
- Combustion indicators for eligible planets
- Stable conjunction and collision handling with separate radial tracks
- Dedicated innermost Moon track for fast lunar movement
- Optional Uranus, Neptune, and Pluto display on both charts
- Complete planetary positions table that always includes every available body
- Selected-planet details and optional motion trails
- Light and dark themes with saved user preference
- Responsive layouts for desktop, tablet, and mobile screens
- Keyboard accessibility, visible focus states, and reduced-motion support
- Graceful handling of missing data, invalid records, and missing icons
- No JavaScript framework or external astrology library

## Included celestial bodies

The supplied ephemeris files include twelve celestial bodies:

| Traditional grahas | Additional outer planets |
| --- | --- |
| Sun | Uranus |
| Moon | Neptune |
| Mars | Pluto |
| Mercury |  |
| Jupiter |  |
| Venus |  |
| Saturn |  |
| Rahu |  |
| Ketu |  |

Uranus, Neptune, and Pluto are hidden from the two charts by default to preserve a traditional Vedic view. They remain available through the outer-planet toggle and are always included in the planetary positions table.

## Circular sidereal transit wheel

The circular wheel places 0 degrees Aries at twelve o'clock. Absolute sidereal longitude increases clockwise through Taurus, Gemini, Cancer, and the remaining signs before returning to Aries.

The SVG contains separate visual regions for planetary motion, the 12 zodiac signs, and the 27 nakshatras. Planet icons stay upright as they move. Close planets retain their true longitude and are separated only by radial lanes, so the collision system never changes their astrological position.

The Moon always uses its own innermost track. Slow planets such as Pluto, Neptune, Uranus, Saturn, and Jupiter are treated as more stable when another planet passes them. Faster planets such as Mercury, Venus, and Mars yield into alternate lanes first. This keeps conjunctions readable without making slow bodies appear to jump between tracks unnecessarily.

## North Indian Vedic astrology chart

The North Indian chart uses fixed house positions. Aries is the default ascendant. Selecting a different ascendant rotates the zodiac signs through the twelve houses while the house geometry remains fixed.

The motion control provides two views. **House Jump** places planets in a stable layout at the center of their current house. **Continuous motion** maps 0° to the incoming house boundary, 15° to the house center, and 30° to the outgoing boundary. This makes degree progress, sign changes, and close conjunctions visible while playback runs. Planets at the same or nearby path position are placed in deterministic side-by-side lanes without changing their true longitude.

Every occupied house displays both planet icons and planet names. House Jump reduces icon and label sizes when occupancy increases, while Continuous motion scales close groups to keep them legible. Playback, date selection, retrograde status, combustion, outer-planet visibility, and planet selection stay synchronized with the circular wheel.

The selected ascendant is a viewing control. It does not calculate a birth ascendant because the local dataset contains daily positions without a birth time or geographic location. Use the [Moon Dasha planetary positions tool](https://moondasha.com/planetary-positions) when exact time and location are required.

## Zodiac signs, nakshatras, and padas

The sidereal zodiac contains 12 signs of 30 degrees each. The wheel also divides the full 360 degrees into 27 equal nakshatras. Each nakshatra spans 13 degrees 20 minutes and contains four padas of 3 degrees 20 minutes each.

The application calculates these values from absolute longitude:

```text
Zodiac sign index = floor(longitude / 30)
Nakshatra index   = floor(longitude / 13 degrees 20 minutes)
Pada              = floor(position within nakshatra / 3 degrees 20 minutes) + 1
```

These calculations are centralized in `js/utils.js` so the wheel, tooltips, North Indian chart, selected-planet panel, and daily positions table use the same astrological mapping.

## Retrograde motion and daily speed

The source JSON does not contain speed or retrograde flags. The normalization layer derives daily motion from consecutive longitudes and divides the change by the actual number of elapsed calendar days.

Before animation, each planet receives an unwrapped longitude sequence. A direct move from 359 degrees to 1 degree becomes a positive 2-degree movement rather than a 358-degree backward rotation. A retrograde move from 1 degree to 359 degrees becomes a negative 2-degree movement. This preprocessing allows direct motion, retrograde motion, stations, and zodiac wraparound to animate naturally.

A small near-zero speed threshold classifies stationary records. Every available date remains a discrete playback step, even when visual movement is interpolated between daily positions.

## Planetary combustion

Combustion is derived from angular separation from the Sun after planetary motion has been calculated. The application currently uses these configurable limits:

| Planet | Direct limit | Retrograde limit |
| --- | ---: | ---: |
| Mars | 17 degrees | 8 degrees |
| Mercury | 14 degrees | 12 degrees |
| Jupiter | 11 degrees | 11 degrees |
| Venus | 10 degrees | 8 degrees |
| Saturn | 15 degrees | 15 degrees |

The Moon is not classified as combust in this application. The Sun, Rahu, Ketu, Uranus, Neptune, and Pluto are also excluded. Combustion thresholds are centralized in `COMBUSTION_LIMITS` inside `js/constants.js` and can be adjusted without changing the rendering code.

## Daily planetary positions table

The table follows the active date and displays:

- Planet name
- Decimal degrees within the current zodiac sign
- Zodiac sign
- Nakshatra
- Pada
- Daily speed rounded to three decimal places
- Direct, stationary, or retrograde motion
- Absolute longitude rounded to two decimal places

The table always lists every body present in the active record. Hiding Uranus, Neptune, and Pluto from the charts does not remove them from the table.

## Run locally

Clone or download the repository, open its directory in a terminal, and start a local HTTP server:

```bash
python3 -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

A local server is required because browsers commonly block JavaScript `fetch()` requests for JSON files when `index.html` is opened through the `file://` protocol. No npm installation or build command is required.

Run the data, astronomy-state, geometry, wraparound, leap-year, and collision tests with:

```bash
node tests/run-tests.mjs
```

## Ephemeris data format

The repository contains one JSON file per year:

```text
data/ephemeris_1950.json
data/ephemeris_1951.json
...
data/ephemeris_2050.json
```

Each file is an array with one record per available calendar date. The supplied files contain 365 or 366 daily records.

```json
{
  "date": "2026-01-01",
  "Sun": { "sign": "Sagittarius", "degrees": 16.6229 },
  "Moon": { "sign": "Taurus", "degrees": 16.56051 }
}
```

The `degrees` value is the decimal position within the named sign, not absolute longitude. The source files contain no timestamp, timezone, ayanamsha name, Julian date, speed field, or explicit retrograde flag. The displayed date is therefore treated as the supplied calendar label. The application does not invent a time reference, location, or ayanamsha claim that is absent from the dataset.

## Normalized internal format

`js/ephemeris.js` validates, de-duplicates, and sorts the source records before converting each position to a consistent internal object:

```js
{
  date: "2026-01-01",
  planets: {
    sun: {
      longitude: 256.6229,
      unwrappedLongitude: 256.6229,
      speed: 1.01877,
      retrograde: false,
      motion: "direct",
      combust: false,
      solarSeparation: null,
      combustionLimit: null
    }
  }
}
```

Absolute longitude is calculated as `sign index * 30 + degrees`. Invalid dates and individual planetary positions are skipped with concise warnings. A missing body never prevents the remaining bodies from rendering. Duplicate dates retain the later source record.

## Project structure

```text
vedic-planetary-transits/
├── index.html
├── styles.css
├── README.md
├── js/
│   ├── animation.js
│   ├── app.js
│   ├── chart.js
│   ├── collision.js
│   ├── constants.js
│   ├── controls.js
│   ├── ephemeris.js
│   ├── north-indian-chart.js
│   └── utils.js
├── data/
│   └── ephemeris_YYYY.json
├── icons/
│   └── planet and zodiac image files
└── tests/
    └── run-tests.mjs
```

## Add another planet or celestial body

Add a row to `BODY_ROWS` in `js/constants.js` with its internal identifier, display name, source JSON key, optional icon path, fallback symbol, deterministic order, and marker size.

Unknown JSON identifiers receive a generated fallback configuration and remain renderable. A named configuration provides stable ordering, icon mapping, marker sizing, and tooltip presentation.

If the source schema changes, update `normalizeEphemeris()` in `js/ephemeris.js`. The charts consume the normalized format and do not depend directly on the original JSON property names.

## Add or replace icons

Zodiac icon paths are defined in `ZODIAC`, and planet icon paths are defined in `BODY_ROWS`. Both configurations are located in `js/constants.js`.

Replace an image in place or update its configured relative path. Planetary icons can use transparent PNG files. If an image fails to load, the interface falls back to a text symbol and logs a warning without interrupting playback.

## Themes and responsive design

Light and dark palettes use CSS custom properties near the top of `styles.css`. Edit the variables under `:root` and `:root[data-theme="dark"]` to customize backgrounds, text, borders, rings, accents, and marker treatments.

The manual theme choice is stored in `localStorage`. Without a saved preference, the interface follows `prefers-color-scheme`. Responsive breakpoints abbreviate nakshatra labels, reorganize controls, and stack content for smaller screens. The SVG wheel and North Indian chart scale without losing sharpness.

The application also respects `prefers-reduced-motion`. Users can step through dates without smooth orbital interpolation when reduced motion is enabled.

## Accessibility

The interface includes semantic controls, keyboard-accessible planet markers, visible focus states, accessible button labels, screen-reader descriptions, logical tab order, sufficient contrast, and reduced-motion behavior. Tooltips work alongside persistent selection details so important planetary information is not dependent on hover alone.

## Data accuracy and interpretation

This repository visualizes the supplied daily ephemeris records. It does not calculate astronomical positions in the browser, and it does not claim second-level accuracy. The dataset also does not contain geographic coordinates or time-of-day values.

Astrology is best used as a reflective and interpretive tool. Planetary transits can describe timing and themes, but their effects depend on the complete natal chart and personal circumstances. They should not replace professional medical, legal, financial, or mental health advice.

## License

Vedic Planetary Transits is released under the [MIT License](LICENSE). You may use, modify, and distribute the project under the terms of that license.
