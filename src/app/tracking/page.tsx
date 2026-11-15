/**
 * The unified Live GPS Vehicle & Shipment Tracking Portal:
 *   1. Buyer & Farmer Authorized Shipment Tracker (live map, breadcrumbs).
 *   2. Driver & Vehicle Owner console (sign-in with PIN, vehicle registration
 *      with honest verification status, real device GPS streaming).
 *   3. AIS-140 / external telematics device pairing and webhook format.
 *
 * The older consignment tracking portal stays at /tracking/dashboard; the
 * legacy /track, /logistics and /provider links still land there unchanged.
 */
import UnifiedLiveTrackingPortal from '@/components/tracking/UnifiedLiveTrackingPortal';

export const metadata = {
  title: 'Live GPS Tracking - KashRoot',
  description:
    'Real-time consent-based GPS vehicle tracking for KashRoot shipments: buyer and farmer tracking, driver console and AIS-140 telematics ingestion.',
};

export default function TrackingPage() {
  return <UnifiedLiveTrackingPortal />;
}
