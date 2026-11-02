/**
 * Region skins: the background photograph behind the portals, picked by the
 * person's state (lib/region: the phone's location when allowed → the state
 * they chose → Kashmir). Only photographs KashRoot may use, each credited
 * where it is shown and in public/regions/<state>/CREDITS.md. A state without
 * its own photograph gets Kashmir's. The KashRoot look itself (chinar green,
 * saffron gold, ivory, the copper chinar leaf) stays the same everywhere.
 */
export interface RegionSkin {
  /** public/regions/<folder> */
  folder: string;
  /** What the photograph shows (its alt text is empty: it is decoration). */
  scene: string;
  /** Which part of the photograph to keep when the band crops it. */
  focus: string;
  /** Kashmir's own drawn scenery (ridge, shikara) under the leaves — only for Kashmir. */
  valley: boolean;
  credit: { author: string; licence: string; licenceUrl: string; source: string };
}

const KASHMIR: RegionSkin = {
  folder: 'jammu-and-kashmir',
  scene: 'Chinar trees in autumn beside a canal in Kashmir',
  focus: '50% 50%',
  valley: true,
  credit: { author: 'Talib kashmir', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'https://commons.wikimedia.org/wiki/File:Chinar_bagh.jpg' },
};

export const REGION_SKINS: Record<string, RegionSkin> = {
  'Jammu and Kashmir': KASHMIR,
  Kerala: {
    folder: 'kerala',
    scene: 'A houseboat on the Kerala backwaters',
    focus: '50% 45%',
    valley: false,
    credit: { author: 'RndmCrs', licence: 'CC0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:A_Houseboat_in_Backwaters_of_Kerala.jpg' },
  },
  Karnataka: {
    folder: 'karnataka',
    scene: 'Shade-grown coffee plantations in the hills of Chikmagalur',
    focus: '50% 45%',
    valley: false,
    credit: { author: 'Anand Osuri', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'https://commons.wikimedia.org/wiki/File:Shade_coffee_plantation_landscape_Chikmagalur.jpg' },
  },
  'Himachal Pradesh': {
    folder: 'himachal-pradesh',
    scene: 'Apples ripening in an orchard at Kotgarh, Himachal Pradesh',
    focus: '50% 40%',
    valley: false,
    credit: { author: 'Ashish Gupta from Noida, India',licence: 'CC BY 2.0', licenceUrl: 'https://creativecommons.org/licenses/by/2.0', source: 'https://commons.wikimedia.org/wiki/File:Apple_orchards_in_Kotgarh_(21487239943).jpg' },
  },
};

/** The skin for a state (Ladakh and states without their own photograph: Kashmir's). */
export function skinFor(state: string | null | undefined): RegionSkin {
  return (state && REGION_SKINS[state]) || KASHMIR;
}
