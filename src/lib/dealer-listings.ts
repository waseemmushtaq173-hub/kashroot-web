/**
 * Dealer listings shown on the Price Comparison page. Stored in the browser
 * under DEALER_LISTINGS_KEY until a listings API exists; the seller portal's
 * "Publish" writes to the same key so published products appear there.
 */
export interface DealerListing {
  id: string;
  category: string;
  item: string;
  name: string;
  location: string;
  price: string;
  verified: boolean;
  updated: string;
  stock: string;
  image?: string;
}

export const DEFAULT_LISTINGS: DealerListing[] = [
  { id: '1', category: "Packaging", item: "Apple Corrugated Box (Universal 10kg)", name: "Valley Packaging Co.", location: "Nashik", price: "145", verified: true, updated: "2 hours ago", stock: "5000" },
  { id: '2', category: "Packaging", item: "Apple Corrugated Box (Universal 10kg)", name: "Orchard Traders", location: "Pune", price: "148", verified: true, updated: "5 hours ago", stock: "2000" },
  { id: '3', category: "Packaging", item: "Apple Corrugated Box (Universal 10kg)", name: "Global Corrugates", location: "Ludhiana", price: "142", verified: false, updated: "1 day ago", stock: "1500" },
  { id: '4', category: "Agrochemicals", item: "DAP Fertilizer (50kg Bag)", name: "Zamindar Agri Center", location: "Indore", price: "11350", verified: true, updated: "1 hour ago", stock: "200" },
  { id: '5', category: "Agrochemicals", item: "DAP Fertilizer (50kg Bag)", name: "Kissan Hub", location: "Jaipur", price: "11365", verified: true, updated: "4 hours ago", stock: "50" },
  { id: '6', category: "Agrochemicals", item: "DAP Fertilizer (50kg Bag)", name: "National Fertilizers", location: "Lucknow", price: "11380", verified: true, updated: "2 days ago", stock: "300" }
];


export const DEALER_LISTINGS_KEY = 'kr_mock_dealer_listings';
