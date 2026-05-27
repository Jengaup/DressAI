import Anthropic from 'npm:@anthropic-ai/sdk@0.32.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GarmentSummary {
  id: string;
  type: string;
  color_label: string;
  primary_color: string;
  pattern: string;
  occasions: string[];
  season: string[];
  name: string;
}

interface RequestBody {
  garments: GarmentSummary[];
  occasion: string;
  weather?: { temp_c: number; condition: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { garments, occasion, weather } = body;

    if (!garments || garments.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 prendas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const client = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
    });

    const wardrobeText = garments
      .map((g) => `- ID:${g.id} | ${g.name} (${g.type}) | Color: ${g.color_label} ${g.primary_color} | Patrón: ${g.pattern} | Ocasiones: ${g.occasions.join(', ')}`)
      .join('\n');

    const weatherText = weather
      ? `Clima actual: ${weather.temp_c}°C, ${weather.condition}.`
      : '';

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Eres un estilista personal experto en moda. Analiza este guardarropa y crea 3 outfits completos.

GUARDARROPA DISPONIBLE:
${wardrobeText}

OCASIÓN: ${occasion}
${weatherText}

REGLAS:
1. Cada outfit debe tener al minimum: top/vestido + bottom (si no es vestido) + zapatos (si están disponibles)
2. Prioriza armonía de colores: complementarios, análogos o monocromáticos
3. Adapta al clima si se proporcionó
4. Solo usa IDs que aparecen en el guardarropa

Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto extra:
{
  "outfits": [
    {
      "garment_ids": ["id1", "id2", "id3"],
      "reasoning": "explicación breve en español (máx 80 chars)",
      "occasion_fit": 85,
      "color_harmony": "complementario"
    }
  ]
}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    // Strip any accidental markdown fences
    const jsonText = content.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonText);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
