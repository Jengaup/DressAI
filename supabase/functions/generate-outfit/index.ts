/**
 * generate-outfit Edge Function
 *
 * Calls Claude claude-haiku-4-5 to produce outfit suggestions from a wardrobe list.
 * Supports optional SSE streaming via ?stream=true query param.
 *
 * Rate limiting: relies on Anthropic API limits + a per-request timeout.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.32.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface GarmentSummary {
  id: string;
  type: string;
  name: string;
  color_label: string;
  primary_color: string;
  secondary_color: string | null;
  pattern: string;
  occasions: string[];
  season: string[];
  brand: string | null;
}

interface RequestBody {
  garments: GarmentSummary[];
  occasion: string;
  season: string;
  num_suggestions: number;
  pinned_garment_id: string | null;
  exclude_combinations: string[][];
  weather?: { temp_c: number; condition: string };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(body: RequestBody): string {
  const {
    garments, occasion, season, num_suggestions,
    pinned_garment_id, exclude_combinations, weather,
  } = body;

  const wardrobeText = garments.map((g) =>
    [
      `• ID: ${g.id}`,
      `  Tipo: ${g.type}${g.brand ? ` (${g.brand})` : ''}`,
      `  Nombre: ${g.name}`,
      `  Color: ${g.color_label} ${g.primary_color}${g.secondary_color ? ` + ${g.secondary_color}` : ''}`,
      `  Patrón: ${g.pattern}`,
      `  Ocasiones: ${g.occasions.join(', ')}`,
      `  Temporada: ${g.season.join(', ')}`,
    ].join('\n')
  ).join('\n\n');

  const pinnedPiece = pinned_garment_id
    ? garments.find((g) => g.id === pinned_garment_id)
    : null;

  const excludeText = exclude_combinations.length > 0
    ? `\n⚠️ EVITAR estas combinaciones (ya vistas recientemente):\n${
        exclude_combinations.slice(0, 5).map((ids) => `- ${ids.join(', ')}`).join('\n')
      }`
    : '';

  const weatherText = weather
    ? `\n🌤 Clima actual: ${weather.temp_c}°C, ${weather.condition}.`
    : '';

  return `Eres Aria, una estilista personal con 15 años de experiencia en moda contemporánea española y latinoamericana. Tu criterio de estilo es impecable y tus consejos son siempre accionables.

════════════ GUARDARROPA DISPONIBLE ════════════
${wardrobeText}

════════════ CONTEXTO DE LA CLIENTA ════════════
Ocasión: ${occasion}
Temporada: ${season}${weatherText}
${pinnedPiece ? `\n⭐ PIEZA OBLIGATORIA — DEBE aparecer en todos los outfits:\n   ID: ${pinnedPiece.id} | ${pinnedPiece.name} (${pinnedPiece.color_label})` : ''}
${excludeText}

════════════ TU MISIÓN ════════════
Crea ${num_suggestions} outfit${num_suggestions > 1 ? 's' : ''} completo${num_suggestions > 1 ? 's' : ''} usando ÚNICAMENTE las prendas del guardarropa listado arriba.

════════════ REGLAS ABSOLUTAS ════════════
1. RESPONDE SOLO con JSON válido — sin markdown, sin texto fuera del JSON
2. Cada outfit DEBE incluir: parte superior O vestido + pantalón/falda (si no es vestido)
3. Añade zapatos y accesorios si están disponibles en el guardarropa
4. USA ÚNICAMENTE los IDs exactos que aparecen arriba — ningún otro
5. Los "tags" son términos de moda en español (ej: "casual chic", "minimalista") — máx 4
6. El "advice" es un consejo ESPECÍFICO y ACCIONABLE para este look — 60 a 100 caracteres
7. El "mood" describe la imagen o estado de ánimo que proyecta el look — máx 30 caracteres
8. Varía el estilo entre outfits para que sean claramente distintos
9. "occasion_fit" es un número 0-100 que indica qué tan apropiado es el outfit para la ocasión dada

════════════ ESQUEMA JSON REQUERIDO ════════════
{
  "outfits": [
    {
      "garment_ids": ["id-exacto-1", "id-exacto-2", "id-exacto-3"],
      "name": "Nombre creativo del look en español",
      "tags": ["casual", "minimalista", "verano"],
      "advice": "Consejo específico: cómo llevar este look y qué destacar",
      "color_harmony": "análogo|complementario|monocromático|neutro|triádico",
      "occasion_fit": 88,
      "mood": "confiada y sofisticada"
    }
  ]
}`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseAndValidate(raw: string, garmentIds: Set<string>): unknown {
  // Strip any accidental markdown fences
  const clean = raw
    .replace(/^```json\s*/gm, '')
    .replace(/^```\s*/gm, '')
    .trim();

  const parsed = JSON.parse(clean);

  if (!parsed?.outfits || !Array.isArray(parsed.outfits)) {
    throw new Error('Response missing outfits array');
  }

  // Validate each outfit's garment IDs exist in the wardrobe
  parsed.outfits = parsed.outfits.map((outfit: Record<string, unknown>) => ({
    ...outfit,
    garment_ids: ((outfit.garment_ids as string[]) ?? []).filter((id) =>
      garmentIds.has(id),
    ),
    // Clamp occasion_fit to 0-100
    occasion_fit: Math.max(0, Math.min(100, Number(outfit.occasion_fit) || 75)),
  }));

  // Remove outfits that ended up with fewer than 2 valid garments
  parsed.outfits = parsed.outfits.filter(
    (o: Record<string, unknown>) => ((o.garment_ids as string[]) ?? []).length >= 2,
  );

  if (parsed.outfits.length === 0) {
    throw new Error('No valid outfits after garment ID validation');
  }

  return parsed;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const wantStream = url.searchParams.get('stream') === 'true';

  try {
    const body: RequestBody = await req.json();
    const { garments, num_suggestions = 3 } = body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!garments || garments.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Se necesitan al menos 2 prendas en el guardarropa', code: 'INSUFFICIENT_WARDROBE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const clampedSuggestions = Math.max(1, Math.min(3, num_suggestions));
    const garmentIds = new Set(garments.map((g) => g.id));
    const prompt = buildPrompt({ ...body, num_suggestions: clampedSuggestions });

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    // ── Streaming mode ────────────────────────────────────────────────────
    if (wantStream) {
      const encoder = new TextEncoder();
      let accumulatedText = '';

      const stream = new ReadableStream({
        async start(controller) {
          try {
            const anthropicStream = client.messages.stream({
              model: 'claude-haiku-4-5',
              max_tokens: 1800,
              system: 'Responde ÚNICAMENTE con JSON válido. Sin markdown. Sin texto fuera del JSON.',
              messages: [{ role: 'user', content: prompt }],
            });

            for await (const event of anthropicStream) {
              if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta'
              ) {
                accumulatedText += event.delta.text;
                const chunk = `data: ${JSON.stringify({ delta: event.delta.text })}\n\n`;
                controller.enqueue(encoder.encode(chunk));
              }
            }

            // Send parsed result at the end
            try {
              const parsed = parseAndValidate(accumulatedText, garmentIds);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ result: parsed })}\n\n`),
              );
            } catch {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ error: 'Parse error' })}\n\n`),
              );
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // ── Non-streaming mode (default) ──────────────────────────────────────
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1800,
      system: 'Responde ÚNICAMENTE con JSON válido. Sin markdown. Sin texto fuera del JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no text content');
    }

    const parsed = parseAndValidate(textBlock.text, garmentIds);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const isRateLimit = err instanceof Error &&
      (err.message.includes('rate_limit') || err.message.includes('429'));

    const status = isRateLimit ? 429 : 500;
    const code = isRateLimit ? 'RATE_LIMITED' : 'AI_FAILED';
    const message = err instanceof Error ? err.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: message, code }),
      {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          ...(isRateLimit ? { 'Retry-After': '10' } : {}),
        },
      },
    );
  }
});
