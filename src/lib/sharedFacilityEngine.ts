/**
 * Shared facility engine — the CA cold store planning model.
 *
 * Builds the full digital-twin geometry of an apple CA cold storage from the
 * owner's dimensions: chambers placed dynamically on the LEFT, BACK, RIGHT or
 * FRONT walls (or at CUSTOM offsets), each insulated CA door facing the
 * movement corridor, the central receiving / grading / sorting / packaging /
 * dispatch hall, the main entrance vestibule, and every stacked storage bin
 * (B-101, B-102, …) with its shared multi-farmer allocation slices.
 *
 * Produce-only zones: this engine NEVER generates a refrigeration machinery
 * room, CA/CS gas room, electrical room, office or laboratory — those are
 * excluded from the shared facility model (visual requirement #6).
 *
 * Role isolation: owner / admin views carry the full farmer-by-farmer slices
 * inside each shared bin; a farmer view carries only their own slice plus the
 * bin's aggregate capacity, never another farmer's name or inventory.
 *
 * Slot-key grammar (stable contract): `CH-CODE:LEVEL-NN:BIN-0001`-style
 * `CODE:LEVEL-01:B-101` keys map a stacked bin to its place in the twin.
 */

export type StorageUnitKind = 'WOODEN_BIN' | 'PLASTIC_CRATE';
export type ChamberWallPosition = 'LEFT' | 'BACK' | 'RIGHT' | 'FRONT' | 'CUSTOM';
export type DoorOpeningDirection =
  | 'SLIDING_HORIZ'
  | 'OUTWARD_OVERLAP'
  | 'INWARD_INFITTING';

export interface UnitSpec {
  kind: StorageUnitKind;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  spacingFt: number;
  defaultCapacityKg: number;
  defaultCratesPerBin: number;
}

export const DEFAULT_WOODEN_BIN_SPEC: UnitSpec = {
  kind: 'WOODEN_BIN',
  lengthFt: 4.0,
  widthFt: 3.5,
  heightFt: 2.8,
  spacingFt: 0.5,
  // Macro shared bin: ~100 apple crates of ~18 kg, or a 200 kg standard bin.
  defaultCapacityKg: 1800,
  defaultCratesPerBin: 100,
};

export const DEFAULT_PLASTIC_CRATE_SPEC: UnitSpec = {
  kind: 'PLASTIC_CRATE',
  lengthFt: 1.77,
  widthFt: 1.18,
  heightFt: 0.95,
  spacingFt: 0.25,
  defaultCapacityKg: 18,
  defaultCratesPerBin: 1,
};

export interface SharedFarmerSlice {
  allocationId?: string;
  farmerId: string;
  farmerName: string;
  appleVariety: string;
  appleGrade?: string;
  allocatedCrates: number;
  weightKg: number;
  bookingReference: string;
  receivedDate?: string;
}

export interface ChamberInput {
  id: string;
  code: string;
  name: string;
  floorNumber?: number;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  side?: 'LEFT' | 'RIGHT' | 'CENTER' | 'BACK' | 'FRONT';
  wallPosition?: ChamberWallPosition;
  /** CUSTOM placement: the chamber's centre, in feet from the building centre. */
  customXFt?: number;
  customZFt?: number;
  doorWall?: 'AUTO_CORRIDOR' | 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
  doorWidthFt?: number;
  doorHeightFt?: number;
  doorOpeningDirection?: DoorOpeningDirection;
  unitType: StorageUnitKind;
  unitCapacityKg?: number;
  maxCratesPerBin?: number;
  unitLengthFt?: number;
  unitWidthFt?: number;
  unitHeightFt?: number;
  spacingFt?: number;
  requestedLevels?: number;
  wallClearanceFt?: number;
  internalAisleWidthFt?: number;
  pricePerUnitPerMonth?: number;
  targetTempF?: number;
  targetRhPercent?: number;
}

export interface ComputedStorageSlot {
  slotKey: string;
  binCode: string; // e.g. 'B-101', 'B-102'
  facilityId: string;
  facilityCode: string;
  chamberId: string;
  chamberCode: string;
  floorNumber: number;
  levelIndex: number;
  levelCode: string;
  row: number;
  col: number;
  unitCode: string;
  unitType: StorageUnitKind;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  maxCrates: number;
  occupiedCrates: number;
  availableCrates: number;
  capacityKg: number;
  storedKg: number;
  availableKg: number;
  status: 'AVAILABLE' | 'PARTIALLY_SHARED' | 'OCCUPIED' | 'MY_BOOKING' | 'PENDING';
  sharedFarmersCount: number;
  farmerSlices: SharedFarmerSlice[];
  farmerName?: string;
  centerXFt: number;
  centerYFt: number;
  centerZFt: number;
}

export interface ComputedChamberLayout {
  id: string;
  code: string;
  name: string;
  floorNumber: number;
  wallPosition: ChamberWallPosition;
  side: 'LEFT' | 'RIGHT' | 'CENTER' | 'BACK' | 'FRONT';
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  xMinFt: number;
  xMaxFt: number;
  zMinFt: number;
  zMaxFt: number;
  centerXFt: number;
  centerZFt: number;
  doorXFt: number;
  doorZFt: number;
  doorWallNormal: 'EAST' | 'WEST' | 'SOUTH' | 'NORTH';
  doorWidthFt: number;
  doorHeightFt: number;
  doorOpeningDirection: DoorOpeningDirection;
  aisleXMinFt: number;
  aisleXMaxFt: number;
  aisleZMinFt: number;
  aisleZMaxFt: number;
  lightingFixtures: Array<{ xFt: number; yFt: number; zFt: number; lengthFt: number }>;
  unitSpec: UnitSpec;
  colsPerRow: number;
  rowsCount: number;
  levelsCount: number;
  placesPerFloor: number;
  totalUnits: number;
  maxCratesTotal: number;
  occupiedCratesTotal: number;
  availableCratesTotal: number;
  maxCapacityKg: number;
  occupiedCapacityKg: number;
  availableCapacityKg: number;
  targetTempF: number;
  targetRhPercent: number;
  slots: ComputedStorageSlot[];
}

/** Produce operational areas only — machinery / gas / electrical / office / lab are never modelled. */
export interface OperationalZoneRect {
  x: number;
  z: number;
  l: number;
  w: number;
  label: string;
  zoneType:
    | 'ENTRANCE_VESTIBULE'
    | 'RECEIVING_AREA'
    | 'GRADING_LINE'
    | 'SORTING_AREA'
    | 'PACKAGING_AREA'
    | 'DISPATCH_AREA'
    | 'LOADING_UNLOADING_DOCK'
    | 'MOVEMENT_CORRIDOR';
}

export interface SharedFacilityModel {
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  floorsCount: number;
  viewerRole: 'FARMER' | 'OWNER' | 'ADMIN';
  nominalLengthFt: number;
  nominalWidthFt: number;
  nominalHeightFt: number;
  buildingLengthFt: number;
  buildingWidthFt: number;
  buildingHeightFt: number;
  wallThicknessFt: number;
  mainDoorWidthFt: number;
  mainDoorHeightFt: number;
  mainDoorXFt: number;
  mainDoorZFt: number;
  mainPassageWidthFt: number;
  operationalBayLengthFt: number;
  zones: {
    entranceVestibuleRectFt: OperationalZoneRect;
    receivingRectFt: OperationalZoneRect;
    gradingLineRectFt: OperationalZoneRect;
    sortingRectFt: OperationalZoneRect;
    packagingRectFt: OperationalZoneRect;
    dispatchRectFt: OperationalZoneRect;
    loadingDockRectFt: OperationalZoneRect;
    mainPassageRectFt: OperationalZoneRect;
  };
  chambers: ComputedChamberLayout[];
  totals: {
    totalChambers: number;
    totalPhysicalUnits: number;
    totalMaxCrates: number;
    totalOccupiedCrates: number;
    totalAvailableCrates: number;
    totalMaxCapacityKg: number;
    totalOccupiedKg: number;
    totalAvailableKg: number;
  };
}

export function buildSharedFacilityModel(params: {
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  floorsCount?: number;
  viewerRole?: 'FARMER' | 'OWNER' | 'ADMIN';
  currentFarmerId?: string;
  buildingLengthFt: number;
  buildingWidthFt: number;
  buildingHeightFt: number;
  mainDoorWidthFt?: number;
  mainPassageWidthFt?: number;
  chamberSpacingFt?: number;
  chambers: ChamberInput[];
  occupiedMap?: Record<
    string,
    {
      storedKg: number;
      occupiedCrates?: number;
      maxCrates?: number;
      farmerName?: string;
      isCurrentFarmer?: boolean;
      farmerSlices?: SharedFarmerSlice[];
    }
  >;
}): SharedFacilityModel {
  const wallThicknessFt = 1.0;
  const mainDoorWidthFt = Math.max(10, params.mainDoorWidthFt || 12);
  const mainDoorHeightFt = 12;
  const mainPassageWidthFt = Math.max(10, params.mainPassageWidthFt || 12);
  const chamberSpacingFt = Math.max(1.0, params.chamberSpacingFt ?? 1.5);
  const viewerRole = params.viewerRole || 'FARMER';

  // Assign wall positions dynamically. An owner-specified wallPosition (or the
  // legacy side) is honoured; otherwise the chambers arrange themselves into
  // the L-bank of the architectural diagram: Chambers 1..4 down the LEFT wall
  // (front-to-back), Chambers 5..N along the BACK wall (left-to-right).
  const L_BANK_LEFT_CHAMBERS = 4;
  const normalizedChambers = params.chambers.map((c, i) => {
    let wp: ChamberWallPosition = c.wallPosition || 'LEFT';
    if (!c.wallPosition) {
      if (c.side === 'BACK') wp = 'BACK';
      else if (c.side === 'RIGHT') wp = 'RIGHT';
      else if (c.side === 'FRONT') wp = 'FRONT';
      else if (c.side === 'CENTER') wp = 'CUSTOM';
      else if (c.customXFt !== undefined || c.customZFt !== undefined) wp = 'CUSTOM';
      else if (i >= L_BANK_LEFT_CHAMBERS) {
        wp = 'BACK';
      } else {
        wp = 'LEFT';
      }
    }
    return { ...c, resolvedWall: wp };
  });

  const leftBank = normalizedChambers.filter((c) => c.resolvedWall === 'LEFT');
  const backBank = normalizedChambers.filter((c) => c.resolvedWall === 'BACK');
  const rightBank = normalizedChambers.filter((c) => c.resolvedWall === 'RIGHT');
  const frontBank = normalizedChambers.filter((c) => c.resolvedWall === 'FRONT');
  const customBank = normalizedChambers.filter((c) => c.resolvedWall === 'CUSTOM');

  const maxLeftChamberWidthFt = leftBank.reduce((m, c) => Math.max(m, Math.max(20, c.widthFt)), 32);
  const sumLeftChamberDepthsFt = leftBank.reduce(
    (sum, c) => sum + Math.max(20, c.lengthFt) + chamberSpacingFt,
    0,
  );

  const maxBackChamberDepthFt = backBank.reduce((m, c) => Math.max(m, Math.max(20, c.lengthFt)), 28);
  const sumBackChamberWidthsFt = backBank.reduce(
    (sum, c) => sum + Math.max(20, c.widthFt) + chamberSpacingFt,
    0,
  );

  const maxRightChamberWidthFt = rightBank.reduce((m, c) => Math.max(m, Math.max(20, c.widthFt)), 0);
  const maxFrontChamberDepthFt = frontBank.reduce((m, c) => Math.max(m, Math.max(18, c.lengthFt)), 22);
  const sumFrontChamberWidthsFt = frontBank.reduce(
    (sum, c) => sum + Math.max(18, c.widthFt) + chamberSpacingFt,
    0,
  );
  const maxCustomReachX = customBank.reduce((m, c) => {
    const w = Math.max(18, c.widthFt);
    const cx = c.customXFt ?? 0;
    return Math.max(m, Math.abs(cx) + w / 2);
  }, 0);
  const maxCustomReachZ = customBank.reduce((m, c) => {
    const d = Math.max(18, c.lengthFt);
    const cz = c.customZFt ?? 0;
    return Math.max(m, Math.abs(cz) + d / 2);
  }, 0);

  // Operational hall minimum width (for the grading line, sorting, packaging,
  // receiving and dispatch areas).
  const minWorkingHallWidthFt = 55;
  const minWorkingHallDepthFt = 50;

  // Enclosing building envelope (X = left-to-right width, Z = back-to-front depth).
  const requiredBuildingLengthXFt = Math.max(
    params.buildingLengthFt || 140,
    maxLeftChamberWidthFt +
      mainPassageWidthFt +
      Math.max(sumBackChamberWidthsFt, minWorkingHallWidthFt + maxRightChamberWidthFt) +
      wallThicknessFt * 4,
    maxCustomReachX * 2 + mainPassageWidthFt + wallThicknessFt * 2,
  );

  const requiredBuildingWidthZFt = Math.max(
    params.buildingWidthFt || 110,
    Math.max(
      sumLeftChamberDepthsFt + (backBank.length > 0 ? maxBackChamberDepthFt + mainPassageWidthFt : 10),
      maxBackChamberDepthFt + mainPassageWidthFt + minWorkingHallDepthFt,
    ) + wallThicknessFt * 4,
    maxFrontChamberDepthFt > 0 ? maxFrontChamberDepthFt + maxBackChamberDepthFt + mainPassageWidthFt + wallThicknessFt * 4 : 0,
    maxCustomReachZ * 2 + wallThicknessFt * 2 + 10,
  );

  const maxChamberHeightFt = params.chambers.reduce(
    (m, c) => Math.max(m, Math.max(16, c.heightFt)),
    24,
  );
  const buildingHeightFt = Math.max(params.buildingHeightFt || 28, maxChamberHeightFt + 4);

  const halfX = requiredBuildingLengthXFt / 2;
  const halfZ = requiredBuildingWidthZFt / 2;

  const computedChambers: ComputedChamberLayout[] = [];

  // Coordinate system:
  // X: -halfX (left wall) → +halfX (right wall).
  // Z: -halfZ (back/top wall) → +halfZ (front/bottom wall, where the main door is).
  let leftCursorZFromFront = halfZ - wallThicknessFt - 2; // Chamber 1 at bottom-left, walking up to Chamber 4.
  let backCursorXFromLeft =
    -halfX + wallThicknessFt + maxLeftChamberWidthFt + mainPassageWidthFt + 2;
  let rightCursorZFromFront = halfZ - wallThicknessFt - 2;
  // Front bank runs right-to-left so the entrance vestibule keeps the bottom-left corner.
  let frontCursorXFromRight = halfX - wallThicknessFt - 2;

  let totalPhysicalUnits = 0;
  let totalMaxCrates = 0;
  let totalOccupiedCrates = 0;
  let totalMaxCapacityKg = 0;
  let totalOccupiedKg = 0;

  normalizedChambers.forEach((ch, idx) => {
    const baseSpec =
      ch.unitType === 'PLASTIC_CRATE' ? DEFAULT_PLASTIC_CRATE_SPEC : DEFAULT_WOODEN_BIN_SPEC;
    const maxCratesPerBin = ch.maxCratesPerBin || baseSpec.defaultCratesPerBin;
    const crateKg = 18;
    const unitCapacityKg = ch.unitCapacityKg || maxCratesPerBin * crateKg;

    const unitSpec: UnitSpec = {
      kind: ch.unitType,
      lengthFt: ch.unitLengthFt || baseSpec.lengthFt,
      widthFt: ch.unitWidthFt || baseSpec.widthFt,
      heightFt: ch.unitHeightFt || baseSpec.heightFt,
      spacingFt: ch.spacingFt ?? baseSpec.spacingFt,
      defaultCapacityKg: unitCapacityKg,
      defaultCratesPerBin: maxCratesPerBin,
    };

    const heightFt = Math.min(Math.max(14, ch.heightFt), buildingHeightFt - 2);
    let xMinFt = 0;
    let xMaxFt = 0;
    let zMinFt = 0;
    let zMaxFt = 0;
    let doorXFt = 0;
    let doorZFt = 0;
    let doorWallNormal: 'EAST' | 'WEST' | 'SOUTH' | 'NORTH' = 'EAST';

    if (ch.resolvedWall === 'LEFT') {
      // Stacked along the left wall from the bottom (Chamber 1) to the top.
      const wX = Math.min(Math.max(20, ch.widthFt), maxLeftChamberWidthFt);
      const dZ = Math.min(
        Math.max(18, ch.lengthFt),
        Math.max(20, (requiredBuildingWidthZFt - 10) / Math.max(1, leftBank.length)),
      );
      xMinFt = -halfX + wallThicknessFt + 0.5;
      xMaxFt = xMinFt + wX;
      zMaxFt = leftCursorZFromFront;
      zMinFt = zMaxFt - dZ;
      leftCursorZFromFront = zMinFt - chamberSpacingFt;

      // Door on the chamber's right wall, opening EAST into the corridor.
      doorXFt = xMaxFt;
      doorZFt = (zMinFt + zMaxFt) / 2;
      doorWallNormal = 'EAST';
    } else if (ch.resolvedWall === 'BACK') {
      // Row along the top/back wall, left to right.
      const wX = Math.min(
        Math.max(18, ch.widthFt),
        Math.max(20, (requiredBuildingLengthXFt - maxLeftChamberWidthFt - 20) / Math.max(1, backBank.length)),
      );
      const dZ = Math.min(Math.max(18, ch.lengthFt), maxBackChamberDepthFt);
      xMinFt = backCursorXFromLeft;
      xMaxFt = xMinFt + wX;
      zMinFt = -halfZ + wallThicknessFt + 0.5;
      zMaxFt = zMinFt + dZ;
      backCursorXFromLeft = xMaxFt + chamberSpacingFt;

      // Door on the chamber's bottom wall, opening SOUTH into the hall.
      doorXFt = (xMinFt + xMaxFt) / 2;
      doorZFt = zMaxFt;
      doorWallNormal = 'SOUTH';
    } else if (ch.resolvedWall === 'FRONT') {
      // Row along the bottom/front wall, right to left (the entrance vestibule
      // keeps the bottom-left corner by the main door).
      const wX = Math.min(
        Math.max(18, ch.widthFt),
        Math.max(20, (requiredBuildingLengthXFt - mainDoorWidthFt - 24) / Math.max(1, frontBank.length)),
      );
      const dZ = Math.min(Math.max(18, ch.lengthFt), maxFrontChamberDepthFt);
      xMaxFt = frontCursorXFromRight;
      xMinFt = xMaxFt - wX;
      zMaxFt = halfZ - wallThicknessFt - 0.5;
      zMinFt = zMaxFt - dZ;
      frontCursorXFromRight = xMinFt - chamberSpacingFt;

      // Door on the chamber's top wall, opening NORTH into the hall.
      doorXFt = (xMinFt + xMaxFt) / 2;
      doorZFt = zMinFt;
      doorWallNormal = 'NORTH';
    } else if (ch.resolvedWall === 'CUSTOM') {
      // Owner's explicit offsets: customXFt / customZFt are the chamber's
      // centre in feet from the building centre, clamped inside the envelope.
      const wX = Math.min(Math.max(18, ch.widthFt), requiredBuildingLengthXFt - wallThicknessFt * 2);
      const dZ = Math.min(Math.max(18, ch.lengthFt), requiredBuildingWidthZFt - wallThicknessFt * 2);
      const cX = Math.min(
        halfX - wallThicknessFt - wX / 2 - 0.5,
        Math.max(-halfX + wallThicknessFt + wX / 2 + 0.5, ch.customXFt ?? 0),
      );
      const cZ = Math.min(
        halfZ - wallThicknessFt - dZ / 2 - 0.5,
        Math.max(-halfZ + wallThicknessFt + dZ / 2 + 0.5, ch.customZFt ?? 0),
      );
      xMinFt = cX - wX / 2;
      xMaxFt = cX + wX / 2;
      zMinFt = cZ - dZ / 2;
      zMaxFt = cZ + dZ / 2;

      // The door faces whichever hall direction is nearest.
      const distEast = Math.abs(halfX - xMaxFt);
      const distWest = Math.abs(xMinFt + halfX);
      const distSouth = Math.abs(halfZ - zMaxFt);
      const distNorth = Math.abs(zMinFt + halfZ);
      const nearest = Math.min(distEast, distWest, distSouth, distNorth);
      if (nearest === distSouth) {
        doorXFt = (xMinFt + xMaxFt) / 2;
        doorZFt = zMaxFt;
        doorWallNormal = 'SOUTH';
      } else if (nearest === distNorth) {
        doorXFt = (xMinFt + xMaxFt) / 2;
        doorZFt = zMinFt;
        doorWallNormal = 'NORTH';
      } else if (nearest === distEast) {
        doorXFt = xMaxFt;
        doorZFt = (zMinFt + zMaxFt) / 2;
        doorWallNormal = 'EAST';
      } else {
        doorXFt = xMinFt;
        doorZFt = (zMinFt + zMaxFt) / 2;
        doorWallNormal = 'WEST';
      }
    } else {
      // RIGHT wall bank.
      const wX = Math.min(Math.max(20, ch.widthFt), 34);
      const dZ = Math.min(Math.max(18, ch.lengthFt), 32);
      xMaxFt = halfX - wallThicknessFt - 0.5;
      xMinFt = xMaxFt - wX;
      zMaxFt = rightCursorZFromFront;
      zMinFt = zMaxFt - dZ;
      rightCursorZFromFront = zMinFt - chamberSpacingFt;

      doorXFt = xMinFt;
      doorZFt = (zMinFt + zMaxFt) / 2;
      doorWallNormal = 'WEST';
    }

    const lengthFt = Number((xMaxFt - xMinFt).toFixed(2));
    const widthFt = Number((zMaxFt - zMinFt).toFixed(2));
    const centerXFt = (xMinFt + xMaxFt) / 2;
    const centerZFt = (zMinFt + zMaxFt) / 2;

    const wallClearanceFt = ch.wallClearanceFt ?? 1.5;
    const internalAisleWidthFt = ch.internalAisleWidthFt ?? 5.0;
    const ceilingLightingClearanceFt = 2.5;

    const usableXFt = Math.max(6, lengthFt - wallClearanceFt * 2 - internalAisleWidthFt);
    const usableZFt = Math.max(6, widthFt - wallClearanceFt * 2);
    const usableYFt = Math.max(unitSpec.heightFt, heightFt - ceilingLightingClearanceFt);

    const stepX = unitSpec.lengthFt + unitSpec.spacingFt;
    const stepZ = unitSpec.widthFt + unitSpec.spacingFt;
    const stepY = unitSpec.heightFt + 0.3;

    const colsPerRow = Math.max(2, Math.floor(usableXFt / stepX));
    const rowsCount = Math.max(2, Math.floor(usableZFt / stepZ));
    const maxSafeLevels = Math.max(1, Math.floor(usableYFt / stepY));
    const levelsCount = Math.min(ch.requestedLevels || 4, maxSafeLevels, 8);

    const aisleXMinFt = centerXFt - internalAisleWidthFt / 2;
    const aisleXMaxFt = centerXFt + internalAisleWidthFt / 2;
    const aisleZMinFt = centerZFt - internalAisleWidthFt / 2;
    const aisleZMaxFt = centerZFt + internalAisleWidthFt / 2;

    // Chamber ceiling LED strip luminaires. No internal fans anywhere: the CA
    // engineering keeps blower unit coolers over the corridor wall, out of the
    // stored-fruit airspace (visual requirement #6).
    const lightingFixtures: Array<{ xFt: number; yFt: number; zFt: number; lengthFt: number }> = [
      {
        xFt: centerXFt,
        yFt: heightFt - 0.6,
        zFt: centerZFt - widthFt * 0.22,
        lengthFt: Math.max(6, lengthFt * 0.55),
      },
      {
        xFt: centerXFt,
        yFt: heightFt - 0.6,
        zFt: centerZFt + widthFt * 0.22,
        lengthFt: Math.max(6, lengthFt * 0.55),
      },
    ];

    const slots: ComputedStorageSlot[] = [];
    let chamberOccupiedCrates = 0;
    let chamberOccupiedKg = 0;
    const chamberCode = ch.code || `CH-${String(idx + 1).padStart(2, '0')}`;
    const leftCols = Math.floor(colsPerRow / 2);

    let binSeq = 1;
    for (let lvl = 1; lvl <= levelsCount; lvl++) {
      const levelCode = `LEVEL-${String(lvl).padStart(2, '0')}`;
      const centerYFt = (lvl - 0.5) * stepY + 0.2;

      for (let r = 1; r <= rowsCount; r++) {
        const zPos = zMinFt + wallClearanceFt + (r - 0.5) * stepZ;
        if (zPos + unitSpec.widthFt / 2 > zMaxFt - wallClearanceFt) continue;

        for (let c = 1; c <= colsPerRow; c++) {
          const isRightBank = c > leftCols;
          const xPos = !isRightBank
            ? xMinFt + wallClearanceFt + (c - 0.5) * stepX
            : aisleXMaxFt + (c - leftCols - 0.5) * stepX;

          if (xPos + unitSpec.lengthFt / 2 > xMaxFt - wallClearanceFt) continue;

          const binCode = `B-${idx + 1}${String(binSeq).padStart(2, '0')}`;
          const unitCode = binCode;
          const slotKey = `${chamberCode}:${levelCode}:${unitCode}`;
          const occ = params.occupiedMap?.[slotKey] || params.occupiedMap?.[binCode];

          const rawSlices = occ?.farmerSlices ?? [];
          // Strict farmer isolation: owner/admin sees every slice; a farmer
          // sees only their own slice of the shared bin.
          const visibleSlices =
            viewerRole === 'OWNER' || viewerRole === 'ADMIN'
              ? rawSlices
              : rawSlices.filter(
                  (s) =>
                    params.currentFarmerId &&
                    String(s.farmerId) === String(params.currentFarmerId),
                );

          const maxCrates = occ?.maxCrates || unitSpec.defaultCratesPerBin;
          const occupiedCrates =
            occ?.occupiedCrates ?? (occ?.storedKg ? Math.round(occ.storedKg / crateKg) : 0);
          const availableCrates = Math.max(0, maxCrates - occupiedCrates);
          const storedKg = occ ? Math.min(occ.storedKg, unitSpec.defaultCapacityKg) : 0;

          chamberOccupiedCrates += occupiedCrates;
          chamberOccupiedKg += storedKg;

          let slotStatus: ComputedStorageSlot['status'] = 'AVAILABLE';
          if (occupiedCrates > 0) {
            if (occ?.isCurrentFarmer || visibleSlices.length > 0) {
              slotStatus = 'MY_BOOKING';
            } else if (occupiedCrates < maxCrates) {
              slotStatus = 'PARTIALLY_SHARED';
            } else {
              slotStatus = 'OCCUPIED';
            }
          }

          slots.push({
            slotKey,
            binCode,
            facilityId: params.facilityId,
            facilityCode: params.facilityCode,
            chamberId: ch.id,
            chamberCode,
            floorNumber: ch.floorNumber || 1,
            levelIndex: lvl,
            levelCode,
            row: r,
            col: c,
            unitCode,
            unitType: unitSpec.kind,
            lengthFt: unitSpec.lengthFt,
            widthFt: unitSpec.widthFt,
            heightFt: unitSpec.heightFt,
            maxCrates,
            occupiedCrates,
            availableCrates,
            capacityKg: unitSpec.defaultCapacityKg,
            storedKg,
            availableKg: Math.max(0, unitSpec.defaultCapacityKg - storedKg),
            status: slotStatus,
            sharedFarmersCount: rawSlices.length || (occupiedCrates > 0 ? 1 : 0),
            farmerSlices: visibleSlices,
            farmerName:
              viewerRole === 'OWNER' || viewerRole === 'ADMIN' ? occ?.farmerName : undefined,
            centerXFt: xPos,
            centerYFt,
            centerZFt: zPos,
          });
          binSeq++;
        }
      }
    }

    const actualTotalUnits = slots.length;
    const actualMaxCrates = actualTotalUnits * unitSpec.defaultCratesPerBin;
    const actualMaxCapacityKg = actualTotalUnits * unitSpec.defaultCapacityKg;

    totalPhysicalUnits += actualTotalUnits;
    totalMaxCrates += actualMaxCrates;
    totalOccupiedCrates += chamberOccupiedCrates;
    totalMaxCapacityKg += actualMaxCapacityKg;
    totalOccupiedKg += chamberOccupiedKg;

    computedChambers.push({
      id: ch.id,
      code: chamberCode,
      name: ch.name || `Chamber ${idx + 1}`,
      floorNumber: ch.floorNumber || 1,
      wallPosition: ch.resolvedWall,
      side:
        ch.resolvedWall === 'RIGHT'
          ? 'RIGHT'
          : ch.resolvedWall === 'BACK'
            ? 'BACK'
            : ch.resolvedWall === 'FRONT'
              ? 'FRONT'
              : 'LEFT',
      lengthFt,
      widthFt,
      heightFt,
      xMinFt,
      xMaxFt,
      zMinFt,
      zMaxFt,
      centerXFt,
      centerZFt,
      doorXFt,
      doorZFt,
      doorWallNormal,
      doorWidthFt: ch.doorWidthFt || 8,
      doorHeightFt: ch.doorHeightFt || 10,
      doorOpeningDirection: ch.doorOpeningDirection || 'SLIDING_HORIZ',
      aisleXMinFt,
      aisleXMaxFt,
      aisleZMinFt,
      aisleZMaxFt,
      lightingFixtures,
      unitSpec,
      colsPerRow,
      rowsCount,
      levelsCount,
      placesPerFloor: Math.floor(actualTotalUnits / levelsCount),
      totalUnits: actualTotalUnits,
      maxCratesTotal: actualMaxCrates,
      occupiedCratesTotal: chamberOccupiedCrates,
      availableCratesTotal: Math.max(0, actualMaxCrates - chamberOccupiedCrates),
      maxCapacityKg: actualMaxCapacityKg,
      occupiedCapacityKg: chamberOccupiedKg,
      availableCapacityKg: Math.max(0, actualMaxCapacityKg - chamberOccupiedKg),
      targetTempF: ch.targetTempF ?? 32.0,
      targetRhPercent: ch.targetRhPercent ?? 92.0,
      slots,
    });
  });

  // Open working hall: right of the left-wall chambers, below the back-wall
  // chambers, above the front-wall chambers.
  const hallXMin = -halfX + wallThicknessFt + maxLeftChamberWidthFt + mainPassageWidthFt + 2;
  const hallXMax = halfX - wallThicknessFt - (rightBank.length > 0 ? maxRightChamberWidthFt + 4 : 2);
  const hallZMin =
    -halfZ + wallThicknessFt + (backBank.length > 0 ? maxBackChamberDepthFt + mainPassageWidthFt : 4);
  const hallZMax =
    halfZ - wallThicknessFt - (frontBank.length > 0 ? maxFrontChamberDepthFt + mainPassageWidthFt : 2);

  const hallCenterX = (hallXMin + hallXMax) / 2;
  const hallWidthX = Math.max(30, hallXMax - hallXMin);
  const hallDepthZ = Math.max(30, hallZMax - hallZMin);

  // Main door & inner receiving vestibule at the bottom wall (the hand-drawn
  // architectural diagram's layout).
  const mainDoorXFt = hallXMin + Math.min(14, hallWidthX * 0.25);
  const mainDoorZFt = halfZ;

  const passageXCenter = -halfX + wallThicknessFt + maxLeftChamberWidthFt + mainPassageWidthFt / 2;

  return {
    facilityId: params.facilityId,
    facilityCode: params.facilityCode,
    facilityName: params.facilityName,
    floorsCount: params.floorsCount || 1,
    viewerRole,
    nominalLengthFt: params.buildingLengthFt,
    nominalWidthFt: params.buildingWidthFt,
    nominalHeightFt: params.buildingHeightFt,
    buildingLengthFt: requiredBuildingLengthXFt,
    buildingWidthFt: requiredBuildingWidthZFt,
    buildingHeightFt,
    wallThicknessFt,
    mainDoorWidthFt,
    mainDoorHeightFt,
    mainDoorXFt,
    mainDoorZFt,
    mainPassageWidthFt,
    operationalBayLengthFt: hallWidthX,
    zones: {
      entranceVestibuleRectFt: {
        x: mainDoorXFt,
        z: halfZ - wallThicknessFt - 8,
        l: 18,
        w: 16,
        label: 'Main Entrance Airlock Door & Vestibule',
        zoneType: 'ENTRANCE_VESTIBULE',
      },
      receivingRectFt: {
        x: mainDoorXFt + 22,
        z: hallZMax - 8,
        l: Math.max(16, hallWidthX * 0.35),
        w: 14,
        label: 'Apple Receiving & Weighing Area',
        zoneType: 'RECEIVING_AREA',
      },
      gradingLineRectFt: {
        x: hallCenterX,
        z: hallZMin + hallDepthZ * 0.28,
        l: Math.max(24, hallWidthX * 0.78),
        w: 12,
        label: 'Automated Apple Grading Line',
        zoneType: 'GRADING_LINE',
      },
      sortingRectFt: {
        x: hallCenterX - hallWidthX * 0.2,
        z: hallZMin + hallDepthZ * 0.52,
        l: Math.max(16, hallWidthX * 0.36),
        w: 11,
        label: 'Sorting & Quality Inspection Tables',
        zoneType: 'SORTING_AREA',
      },
      packagingRectFt: {
        x: hallCenterX + hallWidthX * 0.22,
        z: hallZMin + hallDepthZ * 0.52,
        l: Math.max(16, hallWidthX * 0.36),
        w: 11,
        label: 'Apple Box & Bin Packaging Area',
        zoneType: 'PACKAGING_AREA',
      },
      dispatchRectFt: {
        x: hallCenterX + hallWidthX * 0.2,
        z: hallZMax - 8,
        l: Math.max(16, hallWidthX * 0.35),
        w: 14,
        label: 'Dispatch Staging Area',
        zoneType: 'DISPATCH_AREA',
      },
      loadingDockRectFt: {
        x: mainDoorXFt,
        z: halfZ + 4,
        l: mainDoorWidthFt + 10,
        w: 8,
        label: 'Main Door Truck Loading & Unloading Bay',
        zoneType: 'LOADING_UNLOADING_DOCK',
      },
      mainPassageRectFt: {
        x: passageXCenter,
        z: 0,
        l: mainPassageWidthFt,
        w: requiredBuildingWidthZFt - wallThicknessFt * 2,
        label: 'Internal Forklift Movement Corridor',
        zoneType: 'MOVEMENT_CORRIDOR',
      },
    },
    chambers: computedChambers,
    totals: {
      totalChambers: computedChambers.length,
      totalPhysicalUnits,
      totalMaxCrates,
      totalOccupiedCrates,
      totalAvailableCrates: Math.max(0, totalMaxCrates - totalOccupiedCrates),
      totalMaxCapacityKg,
      totalOccupiedKg,
      totalAvailableKg: Math.max(0, totalMaxCapacityKg - totalOccupiedKg),
    },
  };
}
