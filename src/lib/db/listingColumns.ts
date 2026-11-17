/**
 * The columns of market_listings a browser may read. Never `*`: the table also holds the seller's payout account (UPI id,
 * bank account name, number and IFSC), which only the escrow reads inside the database when it pays the farmer. The
 * database refuses those four columns to every browser (20261201000000_close_open_tables.sql), so a query that asked for
 * `*` would be refused whole.
 *
 * The heavy columns (`photo`, `photos`) are left out of the list reads and fetched separately, a batch at a time, only for
 * a listing that is new or changed (`PHOTO_COLUMNS`): a refresh then costs a few kilobytes instead of every photo again.
 */

/** A listing without photos and without the payout account. */
export const MARKET_COLUMNS =
  'id, seller_id, seller_name, phone, district, category, subcategory, product, variety, grade, unit, price, quantity, details, photo_at, active, created_at, updated_at, org_id, ' +
  'box_capacity_kg, packing_layers, apples_per_box, captured_lat, captured_lng, captured_accuracy_m, captured_address, captured_at_iso, is_live_camera_verified';

/** What a database that has not had the latest SQL steps yet certainly has. */
export const MARKET_CORE_COLUMNS = 'id, seller_id, seller_name, phone, district, category, subcategory, product, variety, grade, unit, price, quantity, details, active, created_at, updated_at';

/** The first photo of a listing and the version (updated_at) it belongs to. */
export const PHOTO_COLUMNS = 'id, photo, updated_at';

/** The same for a seller's own products, whose version is `photo_at`. */
export const MY_PHOTO_COLUMNS = 'id, photo, photo_at';

/** Every photo of one listing (up to three). */
export const ALL_PHOTO_COLUMNS = 'id, photo, photos';

/** Is this error "a column is missing" (a database that has not run the newest SQL)? */
export const isMissingColumn = (error: { message?: string; code?: string } | null | undefined): boolean =>
  Boolean(error) && (error!.code === '42703' || error!.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(error!.message ?? ''));
