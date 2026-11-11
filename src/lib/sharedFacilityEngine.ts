// src/lib/sharedFacilityEngine.ts
export type StorageUnitKind = 'WOODEN_BIN' | 'PLASTIC_CRATE';
export type ChamberArrangement = 'LEFT_SIDE' | 'RIGHT_SIDE' | 'BOTH_SIDES' | 'CUSTOM';

export interface UnitSpec {
  kind: StorageUnitKind;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  spacingFt: number;
  defaultCapacityKg: number;
}

export const DEFAULT_WOODEN_BIN_SPEC: UnitSpec = {
  kind: 'WOODEN_BIN',
  lengthFt: 3.94, // 1.20 m
  widthFt: 3.28,  // 1.00 m
  heightFt: 2.56, // 0.78 m
  spacingFt: 0.40,
  defaultCapacityKg: 200,
};

export const DEFAULT_PLASTIC_CRATE_SPEC: UnitSpec = {
  kind: 'PLASTIC_CRATE',
  lengthFt: 1.77, // 0.54 m
  widthFt: 1.18,  // 0.36 m
  heightFt: 0.95, // 0.29 m
  spacingFt: 0.20,
  defaultCapacityKg: 16.5,
};

export interface ChamberInput {
  id: string;
  code: string;
  name: string;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  side: 'LEFT' | 'RIGHT' | 'CENTER';
  unitType: StorageUnitKind;
  unitCapacityKg?: number;
  unitLengthFt?: number;
  unitWidthFt?: number;
  unitHeightFt?: number;
  spacingFt?: number;
  requestedLevels?: number;
  wallClearanceFt?: number;
  internalAisleWidthFt?: number;
  pricePerUnitPerMonth?: number;
}

export interface ComputedStorageSlot {
  slotKey: string;
  facilityId: string;
  facilityCode: string;
  chamberId: string;
  chamberCode: string;
  levelIndex: number;
  levelCode: string;
  row: number;
  col: number;
  unitCode: string;
  unitType: StorageUnitKind;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  capacityKg: number;
  storedKg: number;
  availableKg: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MY_BOOKING' | 'PENDING';
  farmerName?: string;
  centerXFt: number;
  centerYFt: number;
  centerZFt: number;
}

export interface ComputedChamberLayout {
  id: string;
  code: string;
  name: string;
  side: 'LEFT' | 'RIGHT' | 'CENTER';
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
  doorWidthFt: number;
  doorHeightFt: number;
  aisleXMinFt: number;
  aisleXMaxFt: number;
  unitSpec: UnitSpec;
  colsPerRow: number;
  rowsCount: number;
  levelsCount: number;
  placesPerFloor: number;
  totalUnits: number;
  maxCapacityKg: number;
  occupiedCapacityKg: number;
  availableCapacityKg: number;
  slots: ComputedStorageSlot[];
}

export interface SharedFacilityModel {
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  nominalLengthFt: number;
  nominalWidthFt: number;
  nominalHeightFt: number;
  buildingLengthFt: number;
  buildingWidthFt: number;
  buildingHeightFt: number;
  wallThicknessFt: number;
  mainDoorWidthFt: number;
  mainPassageWidthFt: number;
  operationalBayLengthFt: number;
  zones: {
    cleaningRectFt: { x: number; z: number; l: number; w: number; label: string };
    gradingSortingRectFt: { x: number; z: number; l: number; w: number; label: string };
    packingRectFt: { x: number; z: number; l: number; w: number; label: string };
    machineryRectFt: { x: number; z: number; l: number; w: number; label: string };
    loadingDockRectFt: { x: number; z: number; l: number; w: number; label: string };
    mainPassageRectFt: { x: number; z: number; l: number; w: number; label: string };
  };
  chambers: ComputedChamberLayout[];
  totals: {
    totalChambers: number;
    totalPhysicalUnits: number;
    totalMaxCapacityKg: number;
    totalOccupiedKg: number;
    totalAvailableKg: number;
  };
}

export function buildSharedFacilityModel(params: {
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  buildingLengthFt: number;
  buildingWidthFt: number;
  buildingHeightFt: number;
  mainDoorWidthFt?: number;
  mainPassageWidthFt?: number;
  chambers: ChamberInput[];
  occupiedMap?: Record<
    string,
    { storedKg: number; farmerName?: string; isCurrentFarmer?: boolean }
  >;
}): SharedFacilityModel {
  const wallThicknessFt = 1.0;
  const mainDoorWidthFt = Math.max(8, params.mainDoorWidthFt || 10);
  const mainPassageWidthFt = Math.max(10, params.mainPassageWidthFt || 12);
  const operationalBayLengthFt = 28;

  const leftInputs = params.chambers.filter((c) => c.side !== 'RIGHT');
  const rightInputs = params.chambers.filter((c) => c.side === 'RIGHT');

  const sumChamberLengths = (arr: ChamberInput[]) =>
    arr.reduce((sum, c) => sum + Math.max(20, c.lengthFt) + 2, 0);

  const requiredChambersLenFt = Math.max(
    sumChamberLengths(leftInputs),
    sumChamberLengths(rightInputs),
    40
  );

  const maxLeftWidthFt = leftInputs.reduce((m, c) => Math.max(m, Math.max(20, c.widthFt)), 0);
  const maxRightWidthFt = rightInputs.reduce((m, c) => Math.max(m, Math.max(20, c.widthFt)), 0);
  const maxChamberHeightFt = params.chambers.reduce(
    (m, c) => Math.max(m, Math.max(14, c.heightFt)),
    24
  );

  const buildingLengthFt = Math.max(
    params.buildingLengthFt || 100,
    operationalBayLengthFt + mainPassageWidthFt + requiredChambersLenFt + wallThicknessFt * 4
  );
  const buildingWidthFt = Math.max(
    params.buildingWidthFt || 50,
    maxLeftWidthFt +
      (rightInputs.length > 0 ? mainPassageWidthFt + maxRightWidthFt : 8) +
      wallThicknessFt * 4
  );
  const buildingHeightFt = Math.max(params.buildingHeightFt || 30, maxChamberHeightFt + 4);

  const halfL = buildingLengthFt / 2;
  const halfW = buildingWidthFt / 2;

  const opXCenter = -halfL + wallThicknessFt + operationalBayLengthFt / 2;
  const passageXCenter =
    -halfL + wallThicknessFt + operationalBayLengthFt + mainPassageWidthFt / 2;
  const chambersStartX =
    -halfL + wallThicknessFt + operationalBayLengthFt + mainPassageWidthFt + 1.5;

  const computedChambers: ComputedChamberLayout[] = [];
  let cursorLeftX = chambersStartX;
  let cursorRightX = chambersStartX;

  let totalPhysicalUnits = 0;
  let totalMaxCapacityKg = 0;
  let totalOccupiedKg = 0;

  params.chambers.forEach((ch, idx) => {
    const isRight = ch.side === 'RIGHT' && rightInputs.length > 0;
    const baseSpec =
      ch.unitType === 'PLASTIC_CRATE' ? DEFAULT_PLASTIC_CRATE_SPEC : DEFAULT_WOODEN_BIN_SPEC;

    const unitSpec: UnitSpec = {
      kind: ch.unitType,
      lengthFt: ch.unitLengthFt || baseSpec.lengthFt,
      widthFt: ch.unitWidthFt || baseSpec.widthFt,
      heightFt: ch.unitHeightFt || baseSpec.heightFt,
      spacingFt: ch.spacingFt ?? baseSpec.spacingFt,
      defaultCapacityKg: ch.unitCapacityKg || baseSpec.defaultCapacityKg,
    };

    const maxAllowedLength = Math.max(20, buildingLengthFt - (chambersStartX + halfL) - 2);
    const maxAllowedWidth =
      rightInputs.length > 0
        ? Math.max(18, (buildingWidthFt - mainPassageWidthFt - 6) / 2)
        : Math.max(20, buildingWidthFt - 6);

    const lengthFt = Math.min(Math.max(20, ch.lengthFt), maxAllowedLength);
    const widthFt = Math.min(Math.max(18, ch.widthFt), maxAllowedWidth);
    const heightFt = Math.min(Math.max(12, ch.heightFt), buildingHeightFt - 2);

    const xMinFt = isRight ? cursorRightX : cursorLeftX;
    const xMaxFt = xMinFt + lengthFt;
    if (isRight) cursorRightX = xMaxFt + 2;
    else cursorLeftX = xMaxFt + 2;

    const zMinFt =
      rightInputs.length > 0
        ? isRight
          ? mainPassageWidthFt / 2
          : -halfW + wallThicknessFt + 1
        : -widthFt / 2;
    const zMaxFt = zMinFt + widthFt;

    const centerXFt = (xMinFt + xMaxFt) / 2;
    const centerZFt = (zMinFt + zMaxFt) / 2;

    const wallClearanceFt = ch.wallClearanceFt ?? 1.5;
    const internalAisleWidthFt = ch.internalAisleWidthFt ?? 5.0;
    const usableLengthFt = Math.max(4, lengthFt - wallClearanceFt * 2 - internalAisleWidthFt);
    const usableWidthFt = Math.max(4, widthFt - wallClearanceFt * 2);
    const evaporatorCeilingClearanceFt = 3.5;
    const usableHeightFt = Math.max(unitSpec.heightFt, heightFt - evaporatorCeilingClearanceFt);

    const stepX = unitSpec.lengthFt + unitSpec.spacingFt;
    const stepZ = unitSpec.widthFt + unitSpec.spacingFt;
    const stepY = unitSpec.heightFt + 0.35;

    const colsPerRow = Math.max(2, Math.floor(usableLengthFt / stepX));
    const rowsCount = Math.max(2, Math.floor(usableWidthFt / stepZ));
    const maxSafeLevels = Math.max(1, Math.floor(usableHeightFt / stepY));
    const levelsCount = Math.min(ch.requestedLevels || 4, maxSafeLevels, 10);

    const aisleXMinFt = centerXFt - internalAisleWidthFt / 2;
    const aisleXMaxFt = centerXFt + internalAisleWidthFt / 2;

    const slots: ComputedStorageSlot[] = [];
    let occupiedCapacityKg = 0;
    const chamberCode = ch.code || `CH-${String(idx + 1).padStart(2, '0')}`;
    const leftCols = Math.floor(colsPerRow / 2);

    let unitSeq = 1;
    for (let lvl = 1; lvl <= levelsCount; lvl++) {
      const levelCode = `LEVEL-${String(lvl).padStart(2, '0')}`;
      const centerYFt = (lvl - 0.5) * stepY + 0.25;

      for (let r = 1; r <= rowsCount; r++) {
        const zPos = zMinFt + wallClearanceFt + (r - 0.5) * stepZ;
        if (zPos + unitSpec.widthFt / 2 > zMaxFt - wallClearanceFt) continue;

        for (let c = 1; c <= colsPerRow; c++) {
          const isRightBank = c > leftCols;
          const xPos = !isRightBank
            ? xMinFt + wallClearanceFt + (c - 0.5) * stepX
            : aisleXMaxFt + (c - leftCols - 0.5) * stepX;

          if (xPos + unitSpec.lengthFt / 2 > xMaxFt - wallClearanceFt) continue;

          const prefix = unitSpec.kind === 'WOODEN_BIN' ? 'BIN' : 'CRATE';
          const unitCode = `${prefix}-${String(unitSeq).padStart(4, '0')}`;
          const slotKey = `${chamberCode}:${levelCode}:${unitCode}`;
          const occ = params.occupiedMap?.[slotKey];
          const storedKg = occ ? Math.min(occ.storedKg, unitSpec.defaultCapacityKg) : 0;
          occupiedCapacityKg += storedKg;

          slots.push({
            slotKey,
            facilityId: params.facilityId,
            facilityCode: params.facilityCode,
            chamberId: ch.id,
            chamberCode,
            levelIndex: lvl,
            levelCode,
            row: r,
            col: c,
            unitCode,
            unitType: unitSpec.kind,
            lengthFt: unitSpec.lengthFt,
            widthFt: unitSpec.widthFt,
            heightFt: unitSpec.heightFt,
            capacityKg: unitSpec.defaultCapacityKg,
            storedKg,
            availableKg: Math.max(0, unitSpec.defaultCapacityKg - storedKg),
            status: occ ? (occ.isCurrentFarmer ? 'MY_BOOKING' : 'OCCUPIED') : 'AVAILABLE',
            farmerName: occ?.farmerName,
            centerXFt: xPos,
            centerYFt,
            centerZFt: zPos,
          });
          unitSeq++;
        }
      }
    }

    const actualTotalUnits = slots.length;
    const actualMaxCapacityKg = actualTotalUnits * unitSpec.defaultCapacityKg;

    totalPhysicalUnits += actualTotalUnits;
    totalMaxCapacityKg += actualMaxCapacityKg;
    totalOccupiedKg += occupiedCapacityKg;

    computedChambers.push({
      id: ch.id,
      code: chamberCode,
      name: ch.name || `Chamber ${idx + 1}`,
      side: isRight ? 'RIGHT' : 'LEFT',
      lengthFt,
      widthFt,
      heightFt,
      xMinFt,
      xMaxFt,
      zMinFt,
      zMaxFt,
      centerXFt,
      centerZFt,
      doorXFt: centerXFt,
      doorZFt: zMaxFt,
      doorWidthFt: 8,
      doorHeightFt: 10,
      aisleXMinFt,
      aisleXMaxFt,
      unitSpec,
      colsPerRow,
      rowsCount,
      levelsCount,
      placesPerFloor: Math.floor(actualTotalUnits / levelsCount),
      totalUnits: actualTotalUnits,
      maxCapacityKg: actualMaxCapacityKg,
      occupiedCapacityKg,
      availableCapacityKg: Math.max(0, actualMaxCapacityKg - occupiedCapacityKg),
      slots,
    });
  });

  const usableOpW = buildingWidthFt - wallThicknessFt * 2 - 2;
  const zoneW = usableOpW / 4;

  return {
    facilityId: params.facilityId,
    facilityCode: params.facilityCode,
    facilityName: params.facilityName,
    nominalLengthFt: params.buildingLengthFt,
    nominalWidthFt: params.buildingWidthFt,
    nominalHeightFt: params.buildingHeightFt,
    buildingLengthFt,
    buildingWidthFt,
    buildingHeightFt,
    wallThicknessFt,
    mainDoorWidthFt,
    mainPassageWidthFt,
    operationalBayLengthFt,
    zones: {
      cleaningRectFt: {
        x: opXCenter,
        z: -halfW + wallThicknessFt + zoneW * 0.5,
        l: operationalBayLengthFt - 2,
        w: zoneW - 1,
        label: 'Apple Cleaning & Washing Line',
      },
      gradingSortingRectFt: {
        x: opXCenter,
        z: -halfW + wallThicknessFt + zoneW * 1.5,
        l: operationalBayLengthFt - 2,
        w: zoneW - 1,
        label: 'Optical Grading & Sorting Line',
      },
      packingRectFt: {
        x: opXCenter,
        z: -halfW + wallThicknessFt + zoneW * 2.5,
        l: operationalBayLengthFt - 2,
        w: zoneW - 1,
        label: 'Box / Bin Packing Section',
      },
      machineryRectFt: {
        x: opXCenter,
        z: -halfW + wallThicknessFt + zoneW * 3.5,
        l: operationalBayLengthFt - 2,
        w: zoneW - 1,
        label: 'NH3 / Freon Refrigeration Plant',
      },
      loadingDockRectFt: {
        x: passageXCenter,
        z: halfW + 4,
        l: mainPassageWidthFt + 6,
        w: 8,
        label: 'Loading & Unloading Dock',
      },
      mainPassageRectFt: {
        x: passageXCenter,
        z: 0,
        l: mainPassageWidthFt,
        w: buildingWidthFt - wallThicknessFt * 2,
        label: 'PASSAGE & FORKLIFT CORRIDOR',
      },
    },
    chambers: computedChambers,
    totals: {
      totalChambers: computedChambers.length,
      totalPhysicalUnits,
      totalMaxCapacityKg,
      totalOccupiedKg,
      totalAvailableKg: Math.max(0, totalMaxCapacityKg - totalOccupiedKg),
    },
  };
}
