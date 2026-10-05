import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const LOCATIONS = {
  Srinagar: { lat: 34.0837, lng: 74.7973 },
  Shopian: { lat: 33.7153, lng: 74.8322 },
  Sopore: { lat: 34.2965, lng: 74.4727 },
  Pulwama: { lat: 33.8716, lng: 74.8946 }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get('district') || 'Srinagar';
  
  const coords = LOCATIONS[district as keyof typeof LOCATIONS];
  if (!coords) {
    return NextResponse.json({ error: 'Unsupported district' }, { status: 400 });
  }

  try {
    // Open-Meteo API doesn't require an API key
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FKolkata`
    );
    
    if (!res.ok) throw new Error('Failed to fetch from Open-Meteo');
    const data = await res.json();
    
    return NextResponse.json({
      location: district,
      temperature: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      observedAt: data.current.time,
      station: `Open-Meteo Precision (${coords.lat}, ${coords.lng})`,
      source: 'live'
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 502 });
  }
}
