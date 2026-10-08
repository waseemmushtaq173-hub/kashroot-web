export interface Seller {
  id: string;
  name: string;
  district: string;
  isVerified: boolean;
  joinedAt: Date;
}

export interface ListingType {
  id: string;
  category: 'apple' | 'saffron' | 'walnut' | 'cherry' | 'other';
  variety: string;
  grade: 'A' | 'B' | 'C' | 'Premium';
}

export interface Listing {
  id: string;
  sellerId: string;
  typeId: string;
  quantity: number;
  unit: 'box' | 'kg' | 'quintal';
  pricePerUnit: number;
  location: string;
  status: 'active' | 'sold' | 'pending';
  createdAt: Date;
}

export interface InventoryMovement {
  id: string;
  listingId: string;
  type: 'in' | 'out' | 'adjustment';
  quantityChange: number;
  date: Date;
  note?: string;
}
