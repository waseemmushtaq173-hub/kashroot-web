import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ reply: 'I did not catch that. Please speak again.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set. Returning dummy response for dev.");
      return NextResponse.json({ 
        reply: `You said: "${query}". (Configure GEMINI_API_KEY to enable live AI responses)` 
      });
    }

    const requestBody = {
      system_instruction: {
        parts: [{ text: "You are the KashRoot AI Voice Assistant. Keep answers brief and conversational since they are read via TTS. ZERO-FABRICATION RULE: You must use tools to retrieve market prices or weather. Tool outputs return `{ value, source, observed_at, fetched_at }`. If a tool returns no data or 'NOT_FOUND', state plainly: '[Market/Location] has not reported today. Last report: [Date]' and NEVER invent numbers, estimates, or ranges." }]
      },
      contents: [{ parts: [{ text: query }] }],
      tools: [
        {
          function_declarations: [
            {
              name: "get_market_price",
              description: "Get the current market price for an agricultural commodity at a specific mandi (market).",
              parameters: {
                type: "OBJECT",
                properties: {
                  commodity: { type: "STRING", description: "The crop or item (e.g. Apples, Walnuts)" },
                  market: { type: "STRING", description: "The mandi or location (e.g. Sopore, Azadpur)" }
                },
                required: ["commodity", "market"]
              }
            },
            {
              name: "get_weather",
              description: "Get the localized weather forecast for an agricultural area.",
              parameters: {
                type: "OBJECT",
                properties: {
                  location: { type: "STRING", description: "The district or region" }
                },
                required: ["location"]
              }
            }
          ]
        }
      ]
    };

    let response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Google API returned ${response.status}: ${await response.text()}`);
    }

    let data = await response.json();
    let parts = data.candidates?.[0]?.content?.parts || [];

    // Check if the model decided to call a function
    const functionCallPart = parts.find((p: any) => p.functionCall);

    if (functionCallPart) {
      const { name, args } = functionCallPart.functionCall;
      
      // MOCK BACKEND DATA TO SATISFY ZERO-FABRICATION
      let toolResponse = {};
      
      if (name === "get_market_price") {
        if (args.market?.toLowerCase().includes("sopore")) {
          toolResponse = { value: "₹1,450 per box", source: "Sopore APMC", observed_at: "2026-10-04", fetched_at: new Date().toISOString() };
        } else {
          toolResponse = { value: "NOT_FOUND", source: "System", observed_at: "2026-10-01", fetched_at: new Date().toISOString() };
        }
      } else if (name === "get_weather") {
        toolResponse = { value: "Clear skies, 22°C", source: "IMD", observed_at: "2026-10-04", fetched_at: new Date().toISOString() };
      }

      // Send the tool response back to Gemini to get the final answer
      requestBody.contents.push({ parts });
      (requestBody.contents as any).push({
        role: "function",
        parts: [{
          functionResponse: {
            name: name,
            response: toolResponse
          }
        }]
      });

      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      data = await response.json();
      parts = data.candidates?.[0]?.content?.parts || [];
    }

    const reply = parts.find((p: any) => p.text)?.text || "I received a blank thought. Could you repeat that?";
    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('AI Route Error:', error);
    return NextResponse.json(
      { reply: "Sorry, I am unable to connect to my brain right now." },
      { status: 500 }
    );
  }
}
