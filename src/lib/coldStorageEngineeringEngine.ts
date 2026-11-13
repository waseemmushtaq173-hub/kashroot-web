/**
 * KashRoot Apple CA Cold Storage Engineering Engine.
 *
 * Applies the transferable thermodynamic physics of Fishery Leaflet 427
 * (multi-layer wall transmittance U, Table 4 solar corrections, Table 5/6
 * air-change service load, Table 7 motor and Table 8 occupancy loads, 10%
 * safety factor, compressor tonnage qct, evaporator surface area A and the
 * psychrometric relative humidity H = P1*100/P2) to APPLE Controlled
 * Atmosphere storage.
 *
 * CRITICAL ENGINEERING RULE: frozen-fish parameters (0°F to -40°F rooms or the
 * latent heat of fusion L = 115 Btu/lb) are NEVER applied to apples. Apples are
 * living, respiring climacteric fruit stored ABOVE freezing (31°F-36°F,
 * 90%-95% RH, controlled O2/CO2). Sensible field-heat pulldown uses the apple
 * specific heat c = 0.87 Btu/(lb)(°F) and respiration vital heat ~1,100
 * Btu/ton/24 hr at 32°F-35°F. Every CA setpoint output is labelled as requiring
 * cultivar-specific agronomic validation.
 */

export interface WallLayerInput {
  materialName: string;
  thicknessInches: number;
  kFactor: number; // Btu/hr/ft2/(°F/in) from Leaflet 427 Table 1
}

export const LEAFLET_427_INSULATION_K_FACTORS: Record<string, number> = {
  PUF_PANEL_MODERN: 0.16,
  EXPANDED_RUBBER_BOARD: 0.21, // Table 1 (0°F - 30°F)
  SPACED_ALUMINUM_FOIL: 0.22, // Table 1
  MINERAL_WOOL: 0.24, // Table 1 (30°F)
  FIBERGLAS: 0.24, // Table 1
  GLASS_WOOL: 0.25, // Table 1 (30°F)
  ROCK_WOOL: 0.27, // Table 1
  CORKBOARD_STANDARD: 0.28, // Table 1 (10.5 lb/ft3)
  WOOD_FIBERBOARD: 0.33, // Table 1
  OREGON_PINE_LINING: 0.80, // Table 1
  ASPHALT_VAPOR_SEAL: 5.2, // Table 1
  CONCRETE_WALL_OR_SLAB: 12.0, // Table 1
};

// Leaflet 427 Table 4: Solar Radiation Corrections (°F added to outside design temp)
export const SOLAR_RADIATION_CORRECTION_F: Record<
  'LIGHT' | 'MEDIUM' | 'DARK',
  { east: number; south: number; west: number; flatRoof: number }
> = {
  LIGHT: { east: 4, south: 2, west: 4, flatRoof: 9 },
  MEDIUM: { east: 6, south: 5, west: 6, flatRoof: 15 },
  DARK: { east: 8, south: 6, west: 8, flatRoof: 20 },
};

// Leaflet 427 Table 5: Average air changes per 24 hours by net room volume (cu. ft.)
const TABLE_5_AIR_CHANGES: Array<[number, number]> = [
  [200, 44.0],
  [500, 26.0],
  [1000, 17.5],
  [2000, 12.0],
  [5000, 7.2],
  [10000, 4.9],
  [20000, 3.5],
  [30000, 2.7],
  [50000, 2.0],
  [75000, 1.6],
  [100000, 1.4],
];

export function interpolateAirChangesPer24Hr(
  netVolumeCuFt: number,
  usageIntensity: 'LONG_CA_STORAGE' | 'NORMAL' | 'HEAVY' = 'LONG_CA_STORAGE',
  hasVestibuleFlapperDoors = true,
): number {
  const v = Math.max(200, netVolumeCuFt);
  let baseN = 1.4;

  if (v <= TABLE_5_AIR_CHANGES[0][0]) {
    baseN = TABLE_5_AIR_CHANGES[0][1];
  } else if (v >= TABLE_5_AIR_CHANGES[TABLE_5_AIR_CHANGES.length - 1][0]) {
    baseN = 1.4 * Math.pow(100000 / v, 0.35);
  } else {
    for (let i = 0; i < TABLE_5_AIR_CHANGES.length - 1; i++) {
      const [v1, n1] = TABLE_5_AIR_CHANGES[i];
      const [v2, n2] = TABLE_5_AIR_CHANGES[i + 1];
      if (v >= v1 && v <= v2) {
        const ratio = (v - v1) / (v2 - v1);
        baseN = n1 + ratio * (n2 - n1);
        break;
      }
    }
  }

  // Footnote 1 of Table 5: multiply by 0.6 for long storage, 2.0 for heavy usage
  const usageMultiplier = usageIntensity === 'LONG_CA_STORAGE' ? 0.6 : usageIntensity === 'HEAVY' ? 2.0 : 1.0;
  // Vestibule anteroom / flapper doors reduce warm air infiltration by ~30%
  const vestibuleMultiplier = hasVestibuleFlapperDoors ? 0.7 : 1.0;

  return Number((baseN * usageMultiplier * vestibuleMultiplier).toFixed(2));
}

// Saturation vapor pressure of water/ice in psi for the Leaflet 427 psychrometric
// relative humidity formula H = (P1 * 100) / P2.
export function saturationVaporPressurePsi(tempF: number): number {
  const tempC = ((tempF - 32) * 5) / 9;
  // Magnus-Tetens saturation vapor pressure in kPa -> psi
  const esKpa =
    tempC >= 0
      ? 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3))
      : 0.61078 * Math.exp((21.875 * tempC) / (tempC + 265.5));
  return esKpa * 0.145038;
}

export function calculatePsychrometricRelativeHumidity(
  roomDryBulbF: number,
  coilDewPointF: number,
  productMoistureBoostPercent = 12,
): {
  theoreticalEmptyRoomRhPercent: number;
  estimatedLoadedChamberRhPercent: number;
  vaporPressureAtCoilPsi: number;
  vaporPressureAtRoomPsi: number;
  deltaTF: number;
} {
  const safeCoilF = Math.min(roomDryBulbF, coilDewPointF);
  const p1 = saturationVaporPressurePsi(safeCoilF);
  const p2 = saturationVaporPressurePsi(roomDryBulbF);
  const baseRh = p2 > 0 ? (p1 * 100) / p2 : 90;
  // Leaflet 427 p. 29: commercial rooms with transpiring produce run 10-20% higher
  // than the empty-coil dew-point ratio.
  const loadedRh = Math.min(98, baseRh + productMoistureBoostPercent);

  return {
    theoreticalEmptyRoomRhPercent: Number(baseRh.toFixed(1)),
    estimatedLoadedChamberRhPercent: Number(loadedRh.toFixed(1)),
    vaporPressureAtCoilPsi: Number(p1.toFixed(5)),
    vaporPressureAtRoomPsi: Number(p2.toFixed(5)),
    deltaTF: Number((roomDryBulbF - safeCoilF).toFixed(1)),
  };
}

export interface ChamberEngineeringInput {
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  wallThicknessFt?: number;
  insulationThicknessIn: number;
  insulationKFactor: number;
  outsideDesignTempF: number;
  roomTempF: number; // Apple CA default: 32°F (0°C) — NEVER below 29°F!
  evaporatorCoilTempF: number; // Apple CA default: 29°F (-1.6°C) for a small 3°F ΔT -> high RH%
  surfaceColor?: 'LIGHT' | 'MEDIUM' | 'DARK';
  hasVestibuleFlapperDoors?: boolean;
  totalStoredApplesKg: number;
  dailyIncomingApplesKg: number;
  incomingFruitTempF?: number;
  pulldownHours?: number;
  fanMotorsTotalHp?: number;
  lightingWatts?: number;
  workersCount?: number;
  compressorOperatingHoursPerDay?: number; // Leaflet 427 p. 55: 16 hr (auto defrost) or 18 hr
  evaporatorType?:
    | 'BLOWER_UNIT_COOLER_OVER_AISLE'
    | 'FINNED_PIPE_COIL_OVER_AISLE'
    | 'BARE_PIPE_COIL'
    | 'REFRIGERATED_PLATES'
    | 'JACKETED_DUCT_SYSTEM';
}

export interface ChamberEngineeringResult {
  outsideSurfaceAreaSqFt: number;
  netInternalVolumeCuFt: number;
  overallUValue: number;
  wallHeatGainBtu24h: number;
  airChangesPer24h: number;
  serviceHeatGainBtu24h: number;
  productPulldownAndRespirationBtu24h: number;
  miscellaneousHeatGainBtu24h: number;
  totalHeatLoadWithSafetyBtu24h: number;
  requiredCompressorBtuPerHr: number;
  requiredCompressorTons: number;
  recommendedStandardCompressorTons: number;
  requiredEvaporatorAreaSqFt: number;
  psychrometrics: ReturnType<typeof calculatePsychrometricRelativeHumidity>;
  appleStorageSafetyWarnings: string[];
}

export function calculateAppleChamberEngineering(input: ChamberEngineeringInput): ChamberEngineeringResult {
  const warnings: string[] = [];

  // Guard against freezing apples (Leaflet 427 fish freezing vs Apple CA validation)
  const roomTempF = input.roomTempF;
  if (roomTempF < 29.5) {
    warnings.push(
      `CRITICAL HORTICULTURAL WARNING: Target room temperature (${roomTempF}°F) is near or below the freezing point of apples (~28.5°F). Unlike fish in Leaflet 427 (stored at 0°F to -10°F), apples must be stored between 31°F and 36°F. CA setpoints require cultivar-specific agronomic validation.`,
    );
  }

  const L = Math.max(15, input.lengthFt);
  const W = Math.max(15, input.widthFt);
  const H = Math.max(10, input.heightFt);
  const wallThickFt = input.wallThicknessFt ?? Math.max(0.5, (input.insulationThicknessIn + 6) / 12);

  // 1. Outside Surface Area & Net Inside Volume (Leaflet 427 pp. 36, 67-68)
  const areaRoof = L * W;
  const areaFloor = L * W;
  const areaWalls = 2 * (L * H) + 2 * (W * H);
  const outsideSurfaceAreaSqFt = Math.round(areaRoof + areaFloor + areaWalls);

  const netL = Math.max(10, L - 2 * wallThickFt);
  const netW = Math.max(10, W - 2 * wallThickFt);
  const netH = Math.max(8, H - 2 * wallThickFt);
  const netInternalVolumeCuFt = Math.round(netL * netW * netH);

  // 2. Multi-Wall Overall Coefficient of Heat Transfer U including air films
  // (Leaflet 427 pp. 38-41). Wall build-up: outside 6 in. concrete (k=12),
  // vapor barrier 3/16 in. (k=5.2), main insulation x in. (k from Table 1),
  // inside lining (k=0.8), with fo=6.5 and fi=1.65 air films.
  const fo = 6.5;
  const fi = 1.65;
  const rConcrete = 6 / 12.0;
  const rVaporSeal = 0.1875 / 5.2;
  const rInsulation = Math.max(2, input.insulationThicknessIn) / Math.max(0.12, input.insulationKFactor);
  const rInnerFinish = 0.5 / 0.8;
  const overallUValue = Number((1 / (1 / fo + rConcrete + rVaporSeal + rInsulation + rInnerFinish + 1 / fi)).toFixed(4));

  // Solar radiation & ground temperature corrections (Leaflet 427 Table 4, p. 43)
  const solar = SOLAR_RADIATION_CORRECTION_F[input.surfaceColor || 'LIGHT'];
  const avgWallSolarAddF = (solar.east + solar.south + solar.west + 0) / 4;
  const deltaTWalls = Math.max(5, input.outsideDesignTempF + avgWallSolarAddF - roomTempF);
  const deltaTRoof = Math.max(5, input.outsideDesignTempF + solar.flatRoof - roomTempF);
  const deltaTFloor = Math.max(5, input.outsideDesignTempF - 20 - roomTempF); // Ground is 20°F below outside air

  const qWallsHr =
    overallUValue * areaWalls * deltaTWalls +
    overallUValue * areaRoof * deltaTRoof +
    overallUValue * areaFloor * deltaTFloor;
  const wallHeatGainBtu24h = Math.round(qWallsHr * 24);

  // 3. Air Change / Door Service Load qs' = V * N * Qcft (Leaflet 427 Tables 5 & 6, pp. 44-46)
  const airChangesPer24h = interpolateAirChangesPer24Hr(
    netInternalVolumeCuFt,
    'LONG_CA_STORAGE',
    input.hasVestibuleFlapperDoors ?? true,
  );
  // From Table 6 at ~32-35°F room and 90°F 60% RH outside air: Qcft ≈ 2.45 Btu/ft3
  const qCft = Math.max(1.2, (input.outsideDesignTempF - roomTempF) * 0.042);
  const serviceHeatGainBtu24h = Math.round(netInternalVolumeCuFt * airChangesPer24h * qCft);

  // 4. Product Load qp' for Living Apples (Sensible Field-Heat Pulldown + Vital Respiration Heat)
  // Sensible heat of fresh apples c = 0.87 Btu/(lb)(°F); NO latent fusion term —
  // apples are never frozen.
  const dailyIncomingLbs = Math.max(0, input.dailyIncomingApplesKg) * 2.20462;
  const totalStoredTons = (Math.max(0, input.totalStoredApplesKg) * 2.20462) / 2000;
  const incomingTempF = input.incomingFruitTempF ?? 65;
  const pulldownHours = Math.max(12, input.pulldownHours ?? 24);
  const cApple = 0.87;

  const sensiblePulldownQ = dailyIncomingLbs * cApple * Math.max(0, incomingTempF - roomTempF);
  const sensiblePulldownBtu24h = (24 * sensiblePulldownQ) / pulldownHours;
  // Apple vital heat of respiration at 32°F-35°F ≈ 1,100 Btu / ton / 24 hr
  const respirationBtu24h = totalStoredTons * 1100;
  const productPulldownAndRespirationBtu24h = Math.round(sensiblePulldownBtu24h + respirationBtu24h);

  // 5. Miscellaneous Load qm' = qem' (Table 7 motors) + qel' (Lights) + qo' (Table 8 occupancy)
  // (Leaflet 427 pp. 50-52)
  const motorHp = input.fanMotorsTotalHp ?? 3.0;
  const btuPerHpHr = motorHp <= 0.5 ? 4250 : motorHp <= 3.0 ? 3700 : 2950; // Table 7 Column 3
  const qEm24h = motorHp * btuPerHpHr * 24;

  const lightWatts = input.lightingWatts ?? 400;
  const qEl24h = lightWatts * 3.42 * 24; // 1 Watt = 3.42 Btu/hr

  const workers = input.workersCount ?? 2;
  const btuPerPersonHr = roomTempF >= 35 ? 890 : 950; // Table 8 at 30°F = 950 Btu/hr
  const qO24h = workers * btuPerPersonHr * 24;

  const miscellaneousHeatGainBtu24h = Math.round(qEm24h + qEl24h + qO24h);

  // 6. Total Heat Load with 10% Safety Factor: q' = 1.10 * (qw' + qs' + qp' + qm')
  // (Leaflet 427 p. 53)
  const sumLoads =
    wallHeatGainBtu24h + serviceHeatGainBtu24h + productPulldownAndRespirationBtu24h + miscellaneousHeatGainBtu24h;
  const totalHeatLoadWithSafetyBtu24h = Math.round(1.1 * sumLoads);

  // 7. Compressor Sizing: qc = q' / tc, qct = qc / 12,000 (Leaflet 427 pp. 54-57)
  const tc = input.compressorOperatingHoursPerDay ?? 16;
  const requiredCompressorBtuPerHr = Math.round(totalHeatLoadWithSafetyBtu24h / tc);
  const requiredCompressorTons = Number((requiredCompressorBtuPerHr / 12000).toFixed(2));

  const standardTonsList = [1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];
  const recommendedStandardCompressorTons =
    standardTonsList.find((t) => t >= requiredCompressorTons) || Math.ceil(requiredCompressorTons / 10) * 10;

  // 8. Evaporator Surface Area: A = qc* / (U_evap * ΔT) (Leaflet 427 pp. 58-65)
  const coilTempF = Math.min(roomTempF - 2, input.evaporatorCoilTempF ?? roomTempF - 3);
  const deltaTEvap = Math.max(2, roomTempF - coilTempF);
  if (deltaTEvap > 10) {
    warnings.push(
      `DEHYDRATION WARNING (Leaflet 427 p. 21 & p. 57): Evaporator ΔT is ${deltaTEvap.toFixed(1)}°F (>10°F limit). High ΔT lowers relative humidity and causes apple skin shrivel.`,
    );
  }

  const uEvap =
    input.evaporatorType === 'BLOWER_UNIT_COOLER_OVER_AISLE'
      ? 4.5
      : input.evaporatorType === 'REFRIGERATED_PLATES'
        ? 2.0
        : input.evaporatorType === 'BARE_PIPE_COIL'
          ? 1.6
          : 1.2; // Finned pipe coil U = 1.2 Btu/hr/ft2/°F (p. 20)

  const selectedCompressorBtuHr = recommendedStandardCompressorTons * 12000;
  const requiredEvaporatorAreaSqFt = Math.round(selectedCompressorBtuHr / (uEvap * deltaTEvap));

  const psychrometrics = calculatePsychrometricRelativeHumidity(roomTempF, coilTempF);

  return {
    outsideSurfaceAreaSqFt,
    netInternalVolumeCuFt,
    overallUValue,
    wallHeatGainBtu24h,
    airChangesPer24h,
    serviceHeatGainBtu24h,
    productPulldownAndRespirationBtu24h,
    miscellaneousHeatGainBtu24h,
    totalHeatLoadWithSafetyBtu24h,
    requiredCompressorBtuPerHr,
    requiredCompressorTons,
    recommendedStandardCompressorTons,
    requiredEvaporatorAreaSqFt,
    psychrometrics,
    appleStorageSafetyWarnings: warnings,
  };
}
