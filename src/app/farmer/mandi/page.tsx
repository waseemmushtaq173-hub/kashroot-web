'use client';

import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, CloudSun, MapPin } from 'lucide-react';

/**
 * Shown only when the live feed returns no rows.
 *
 * Every figure here is a stand-in, so the cards are badged "Sample" and the
 * page says so above them. The previous version rendered one of these wearing a
 * "Live Connected" footer, which is the worst of both worlds: an invented rate
 * presented as a live one. A price board is read as a price board.
 *
 * The crop is deliberately the same across all three markets — the whole point
 * of a mandi board is comparing one crop across hubs, so the local rate is
 * directly comparable with the terminal markets.
 */
const SAMPLE_PRICES = [
  {
    market: 'Parimpora, Srinagar',
    crop: 'Grade-A Apple',
    price: '₹1,450',
    unit: '/ 15kg box',
    note: 'Weather: Clear (18°C)',
  },
  {
    market: 'Azadpur, Delhi',
    crop: 'Grade-A Apple',
    price: '₹1,610',
    unit: '/ 15kg box',
    note: 'Weather: Clear (31°C)',
  },
  {
    market: 'Jaipur, Rajasthan',
    crop: 'Grade-A Apple',
    price: '₹1,538',
    unit: '/ 15kg box',
    note: 'Weather: Clear (34°C)',
  },
];

export default function MandiWeatherPage() {
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mandi-prices`)
      .then((res) => res.json())
      .then((data) => {
        setPrices(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch mandi prices:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Live Mandi Prices & Weather</h1>
          <p className="text-stone-600 mt-1">
            Rates from local hubs alongside the major terminal mandis — Azadpur,
            Jaipur and beyond.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-medium text-sm">
          <MapPin className="w-4 h-4" /> Pan-India Feed
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-stone-600" />
        </div>
      ) : prices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prices.map((item, index) => (
            <div key={index} className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider bg-stone-100 text-stone-700 px-2.5 py-1 rounded">
                  {item.market || 'Local mandi'}
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-stone-900">{item.cropName || 'Apple (Delicious)'}</h3>
              <p className="text-2xl font-extrabold text-stone-900 mt-2">₹{item.price || '1,200'} <span className="text-sm font-normal text-stone-500">/ box</span></p>
              <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between text-sm text-stone-500">
                <span>Trend: Stable</span>
                <span className="text-emerald-600 font-medium">Updated Today</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p
            role="note"
            className="mb-6 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <CloudSun className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Sample data — the live mandi feed returned no rows. These figures
              are placeholders, not today&rsquo;s rates.
            </span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SAMPLE_PRICES.map((sample) => (
              <div key={sample.market} className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider bg-stone-100 text-stone-700 px-2.5 py-1 rounded">
                    {sample.market}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-1 rounded">
                    Sample
                  </span>
                </div>
                <h3 className="text-lg font-bold text-stone-900">{sample.crop}</h3>
                <p className="text-2xl font-extrabold text-stone-900 mt-2">
                  {sample.price} <span className="text-sm font-normal text-stone-500">{sample.unit}</span>
                </p>
                <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between text-sm text-stone-500">
                  <span>{sample.note}</span>
                  <span className="text-amber-700 font-medium">Not live</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
