type WeatherResult = {
  windOut: number;
  runBoost: number;
};

type StadiumInfo = {
  lat: number;
  lon: number;
  // Approximate true bearing from home plate toward center field.
  // Used to compute the wind-out vs wind-in component.
  cfBearing: number;
  // Domed or fully retractable-roof stadiums where weather has no effect.
  indoor: boolean;
};

// Coordinates and center-field bearing for all 30 MLB stadiums (2025).
// cfBearing: degrees clockwise from true north toward CF (0 = north, 90 = east, etc.)
const STADIUM: Record<string, StadiumInfo> = {
  // American League East
  BAL: { lat: 39.2839, lon: -76.6218, cfBearing: 90,  indoor: false }, // Camden Yards — CF faces east
  BOS: { lat: 42.3467, lon: -71.0972, cfBearing: 90,  indoor: false }, // Fenway Park — CF roughly east
  NYY: { lat: 40.8296, lon: -73.9262, cfBearing: 330, indoor: false }, // Yankee Stadium — CF northwest
  TB:  { lat: 27.7682, lon: -82.6534, cfBearing: 0,   indoor: true  }, // Tropicana Field — domed
  TOR: { lat: 43.6414, lon: -79.3894, cfBearing: 0,   indoor: true  }, // Rogers Centre — retractable

  // American League Central
  CWS: { lat: 41.8299, lon: -87.6338, cfBearing: 225, indoor: false }, // Guaranteed Rate — CF southwest
  CLE: { lat: 41.4962, lon: -81.6852, cfBearing: 315, indoor: false }, // Progressive Field — CF northwest
  DET: { lat: 42.3390, lon: -83.0485, cfBearing: 0,   indoor: false }, // Comerica Park — CF north
  KC:  { lat: 39.0516, lon: -94.4803, cfBearing: 0,   indoor: false }, // Kauffman Stadium — CF north
  MIN: { lat: 44.9817, lon: -93.2776, cfBearing: 0,   indoor: false }, // Target Field — open air

  // American League West
  HOU: { lat: 29.7573, lon: -95.3553, cfBearing: 0,   indoor: true  }, // Minute Maid — retractable
  LAA: { lat: 33.8003, lon: -117.8827, cfBearing: 290, indoor: false }, // Angel Stadium — CF west
  OAK: { lat: 37.7516, lon: -122.2005, cfBearing: 315, indoor: false }, // Oakland Coliseum — CF northwest
  SEA: { lat: 47.5914, lon: -122.3325, cfBearing: 0,   indoor: true  }, // T-Mobile Park — retractable
  TEX: { lat: 32.7512, lon: -97.0832, cfBearing: 0,   indoor: true  }, // Globe Life Field — retractable

  // National League East
  ATL: { lat: 33.8908, lon: -84.4678, cfBearing: 45,  indoor: false }, // Truist Park — CF northeast
  MIA: { lat: 25.7781, lon: -80.2197, cfBearing: 0,   indoor: true  }, // loanDepot park — retractable
  NYM: { lat: 40.7571, lon: -73.8458, cfBearing: 45,  indoor: false }, // Citi Field — CF northeast
  PHI: { lat: 39.9057, lon: -75.1665, cfBearing: 45,  indoor: false }, // Citizens Bank Park — CF northeast
  WSH: { lat: 38.8730, lon: -77.0074, cfBearing: 90,  indoor: false }, // Nationals Park — CF east

  // National League Central
  CHC: { lat: 41.9484, lon: -87.6553, cfBearing: 0,   indoor: false }, // Wrigley Field — CF north
  CIN: { lat: 39.0979, lon: -84.5078, cfBearing: 0,   indoor: false }, // Great American Ballpark — CF north
  MIL: { lat: 43.0280, lon: -87.9712, cfBearing: 0,   indoor: true  }, // American Family Field — retractable
  PIT: { lat: 40.4469, lon: -80.0057, cfBearing: 315, indoor: false }, // PNC Park — CF northwest
  STL: { lat: 38.6226, lon: -90.1928, cfBearing: 315, indoor: false }, // Busch Stadium — CF northwest

  // National League West
  ARI: { lat: 33.4453, lon: -112.0667, cfBearing: 0,  indoor: true  }, // Chase Field — retractable
  COL: { lat: 39.7559, lon: -104.9942, cfBearing: 315, indoor: false }, // Coors Field — high altitude
  LAD: { lat: 34.0739, lon: -118.2400, cfBearing: 0,  indoor: false }, // Dodger Stadium — CF north
  SD:  { lat: 32.7076, lon: -117.1570, cfBearing: 315, indoor: false }, // Petco Park — CF northwest
  SF:  { lat: 37.7786, lon: -122.3893, cfBearing: 315, indoor: false }, // Oracle Park — CF northwest
};

// Team abbreviation aliases (account for name variations passed in)
const TEAM_KEY: Record<string, string> = {
  cubs: "CHC", whitesox: "CWS", "white sox": "CWS", sox: "CWS",
  guardians: "CLE", indians: "CLE",
  tigers: "DET",
  royals: "KC",
  twins: "MIN",
  astros: "HOU",
  angels: "LAA",
  athletics: "OAK",
  mariners: "SEA",
  rangers: "TEX",
  braves: "ATL",
  marlins: "MIA",
  mets: "NYM",
  phillies: "PHI",
  nationals: "WSH",
  reds: "CIN",
  brewers: "MIL",
  pirates: "PIT",
  cardinals: "STL",
  diamondbacks: "ARI", dbacks: "ARI",
  rockies: "COL",
  dodgers: "LAD",
  padres: "SD",
  giants: "SF",
  orioles: "BAL",
  redsox: "BOS", "red sox": "BOS",
  yankees: "NYY",
  rays: "TB",
  bluejays: "TOR", "blue jays": "TOR",
};

function resolveKey(team: string): string | null {
  const upper = team.toUpperCase();
  if (STADIUM[upper]) return upper;
  const lower = team.toLowerCase().replace(/\s+/g, "");
  if (TEAM_KEY[lower]) return TEAM_KEY[lower];
  // Substring match
  for (const [alias, key] of Object.entries(TEAM_KEY)) {
    if (lower.includes(alias.replace(/\s+/g, ""))) return key;
  }
  return null;
}

function tempFactor(celsius: number) {
  // Convert Celsius to Fahrenheit for the model thresholds
  const f = celsius * 9 / 5 + 32;
  if (f >= 85) return 1.08;
  if (f >= 75) return 1.04;
  if (f <= 50) return 0.94;
  if (f <= 40) return 0.90;
  return 1.0;
}

// Wind factor using the directional component toward CF (blowing out = more runs).
// windSpeed in km/h (Open-Meteo default), windDir in degrees from north.
// cfBearing is the bearing from home plate toward CF.
function windFactor(windSpeed: number, windDir: number, cfBearing: number) {
  // Convert wind speed from km/h to mph for magnitude thresholds
  const mph = windSpeed * 0.621371;
  if (mph < 5) return 1.0; // negligible wind

  // Compute how much wind is blowing TOWARD CF (positive = out, negative = in)
  // Wind direction is where the wind is coming FROM, so we invert.
  const windTowardCf = Math.cos(((windDir + 180 - cfBearing) * Math.PI) / 180);

  // windTowardCf: +1 = directly blowing out to CF, -1 = blowing in from CF
  const baseEffect = windTowardCf * mph * 0.0042; // ~±8% at 20 mph directly out/in
  return Math.max(0.88, Math.min(1.18, 1 + baseEffect));
}

export async function fetchWeather(team?: string): Promise<WeatherResult> {
  if (!team) return { windOut: 1, runBoost: 1 };

  const key = resolveKey(team);
  if (!key) return { windOut: 1, runBoost: 1 };

  const stadium = STADIUM[key];
  if (!stadium || stadium.indoor) return { windOut: 1, runBoost: 1 };

  try {
    const url = [
      `https://api.open-meteo.com/v1/forecast`,
      `?latitude=${stadium.lat}`,
      `&longitude=${stadium.lon}`,
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m`
    ].join("");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { windOut: 1, runBoost: 1 };
    const json = await res.json();

    const temp: number = json?.current?.temperature_2m ?? 18; // 18°C ≈ 65°F default
    const windSpeed: number = json?.current?.wind_speed_10m ?? 0;
    const windDir: number = json?.current?.wind_direction_10m ?? 0;

    return {
      windOut: windFactor(windSpeed, windDir, stadium.cfBearing),
      runBoost: tempFactor(temp)
    };
  } catch {
    return { windOut: 1, runBoost: 1 };
  }
}
