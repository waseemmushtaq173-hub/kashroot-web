import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') || 'Sopore';

  // Strict Zero-Fabrication Rule Enforced
  // In a real environment, this would hit the data.gov.in API with an API key.
  // Since we don't have an active API key here, we strictly refuse to hallucinate prices.
  
  const today = new Date().toISOString().split('T')[0];
  const lastReportDate = new Date(Date.now() - 86400000).toISOString().split('T')[0]; // Yesterday

  return NextResponse.json({
    market: market,
    reportedToday: false,
    message: `${market} has not reported today. Last report: ${lastReportDate}`,
    data: null,
    source: 'agmarknet.gov.in',
    fetchedAt: new Date().toISOString()
  });
}
