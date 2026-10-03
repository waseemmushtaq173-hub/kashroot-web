'use client';

import { useRouter } from 'next/navigation';

export function RoleSwitcher() {
  const router = useRouter();
  
  return (
    <select 
      className="kr-input kr-input-sm bg-kr-bg-sunken border-transparent text-caption text-kr-text-secondary" 
      onChange={(e) => {
        if (e.target.value) router.push(e.target.value);
      }}
    >
      <option value="">Switch Role...</option>
      <option value="/farmer/dashboard">Farmer</option>
      <option value="/buyer/dashboard">Buyer</option>
      <option value="/seller/dashboard">Hardware Seller</option>
      <option value="/dealer/dashboard">Fertilizer Dealer</option>
      <option value="/provider/dashboard">Rental Provider</option>
      <option value="/horticulture/dashboard">Horticulture Admin</option>
    </select>
  );
}
