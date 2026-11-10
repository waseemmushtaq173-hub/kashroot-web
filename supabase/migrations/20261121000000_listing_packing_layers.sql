-- Produce listings: add packing layers, single-box capacity, and live
-- camera/GPS verification metadata so buyers can compare like-for-like and
-- trust that photos/videos were captured live at the orchard (not uploaded
-- from a gallery). Columns are nullable so existing listings keep working;
-- all RLS policies are unchanged.

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS box_capacity_kg numeric(6,2);

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS packing_layers text;

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS apples_per_box text;

-- Live camera + GPS verification metadata (engraved into photo/video pixels).
ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS captured_lat numeric(9,6);

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS captured_lng numeric(9,6);

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS captured_accuracy_m numeric(6,2);

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS captured_address text;

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS captured_at_iso timestamptz;

ALTER TABLE market_listings
ADD COLUMN IF NOT EXISTS is_live_camera_verified boolean DEFAULT false;

-- Helpful index for buyer-side filtering/sorting by packing layers.
CREATE INDEX IF NOT EXISTS idx_market_listings_packing_layers ON market_listings(packing_layers) WHERE packing_layers IS NOT NULL;

-- Comment the columns for clarity.
COMMENT ON COLUMN market_listings.box_capacity_kg IS 'Net weight of one box in kg (e.g. 16.0, 18.0, 20.0).';
COMMENT ON COLUMN market_listings.packing_layers IS 'Packing style per box (e.g. "4 Layer", "5 Layer", "3 Layer", "2 Layer (Half Box)", "Loose / Crate Packed").';
COMMENT ON COLUMN market_listings.apples_per_box IS 'Approximate apple count per box (e.g. "80–100 pieces", "125–150 pieces").';
COMMENT ON COLUMN market_listings.captured_lat IS 'Live GPS latitude of the photo/video capture location.';
COMMENT ON COLUMN market_listings.captured_lng IS 'Live GPS longitude of the photo/video capture location.';
COMMENT ON COLUMN market_listings.captured_accuracy_m IS 'GPS accuracy in metres at capture time.';
COMMENT ON COLUMN market_listings.captured_address IS 'Reverse-geocoded address of the capture location.';
COMMENT ON COLUMN market_listings.captured_at_iso IS 'ISO timestamp of the live capture.';
COMMENT ON COLUMN market_listings.is_live_camera_verified IS 'True when the listing photo/video was captured via live camera with GPS lock.';
