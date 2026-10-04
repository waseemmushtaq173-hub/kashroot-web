import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ reply: 'I did not catch that. Please speak again.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    // If no key is configured in the environment, return a helpful error.
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set. Returning dummy response for dev.");
      return NextResponse.json({ 
        reply: `You said: "${query}". (Configure GEMINI_API_KEY to enable live AI responses)` 
      });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "You are the KashRoot AI Voice Assistant. You answer questions regarding crop disease, localized weather forecasts, or market trends. Keep your answers brief, conversational, and direct since they will be read aloud by Text-To-Speech." }]
        },
        contents: [{ parts: [{ text: query }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`Google API returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I received a blank thought. Could you repeat that?";
    
    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('AI Route Error:', error);
    return NextResponse.json(
      { reply: "Sorry, I am unable to connect to my brain right now." },
      { status: 500 }
    );
  }
}
