const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClassifyRequest {
  imageBase64: string;    // base64 encoded image
  mimeType: string;       // image/jpeg | image/png | image/webp
}

interface ClassificationResult {
  type: string;
  subtype: string | null;
  primary_color: string;
  secondary_color: string | null;
  color_label: string;
  pattern: string;
  occasions: string[];
  season: string[];
  ai_confidence: number;
  vision_raw: Record<string, unknown>;
}

// Maps Google Vision labels to our garment types
function mapLabelToType(labels: string[]): { type: string; subtype: string | null } {
  const labelLower = labels.map((l) => l.toLowerCase());

  if (labelLower.some((l) => l.includes('shoe') || l.includes('boot') || l.includes('sneaker') || l.includes('sandal'))) {
    return { type: 'shoes', subtype: labelLower.find((l) => l.includes('sneaker') || l.includes('boot') || l.includes('heel')) ?? null };
  }
  if (labelLower.some((l) => l.includes('bag') || l.includes('purse') || l.includes('handbag'))) {
    return { type: 'bag', subtype: null };
  }
  if (labelLower.some((l) => l.includes('dress') || l.includes('gown'))) {
    return { type: 'dress', subtype: null };
  }
  if (labelLower.some((l) => l.includes('coat') || l.includes('jacket') || l.includes('blazer') || l.includes('hoodie'))) {
    return { type: 'outerwear', subtype: labelLower.find((l) => l.includes('blazer') || l.includes('coat') || l.includes('jacket')) ?? null };
  }
  if (labelLower.some((l) => l.includes('pants') || l.includes('jeans') || l.includes('trousers') || l.includes('skirt') || l.includes('shorts'))) {
    const subtype = labelLower.find((l) => l.includes('jeans') || l.includes('shorts') || l.includes('skirt')) ?? null;
    return { type: 'bottom', subtype };
  }
  if (labelLower.some((l) => l.includes('swimwear') || l.includes('bikini') || l.includes('swimsuit'))) {
    return { type: 'swimwear', subtype: null };
  }
  if (labelLower.some((l) => l.includes('activewear') || l.includes('sportswear') || l.includes('legging'))) {
    return { type: 'activewear', subtype: null };
  }
  if (labelLower.some((l) =>
    l.includes('shirt') || l.includes('blouse') || l.includes('top') ||
    l.includes('sweater') || l.includes('tee') || l.includes('polo')
  )) {
    const subtype = labelLower.find((l) => l.includes('polo') || l.includes('blouse') || l.includes('sweater')) ?? null;
    return { type: 'top', subtype };
  }

  return { type: 'top', subtype: null }; // safe default
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToColorLabel(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Basic color naming heuristic
  if (r > 200 && g < 100 && b < 100) return 'rojo';
  if (r < 100 && g > 150 && b < 100) return 'verde';
  if (r < 100 && g < 100 && b > 180) return 'azul';
  if (r > 200 && g > 200 && b < 100) return 'amarillo';
  if (r > 180 && g < 100 && b > 180) return 'morado';
  if (r > 200 && g > 100 && b < 80) return 'naranja';
  if (r > 180 && g > 130 && b > 100) return 'beige';
  if (r > 200 && g > 200 && b > 200) return 'blanco';
  if (r < 60 && g < 60 && b < 60) return 'negro';
  if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30) return 'gris';
  if (r > 150 && g < 80 && b < 80) return 'rojo oscuro';
  if (r < 80 && g < 80 && b > 120) return 'azul marino';
  if (r > 100 && g > 60 && b < 40) return 'café';
  return 'multicolor';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType }: ClassifyRequest = await req.json();
    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY')!;

    const visionPayload = {
      requests: [
        {
          image: { content: imageBase64 },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 15 },
            { type: 'IMAGE_PROPERTIES', maxResults: 5 },
          ],
        },
      ],
    };

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visionPayload),
      },
    );

    if (!visionRes.ok) {
      throw new Error(`Vision API error: ${visionRes.status}`);
    }

    const visionData = await visionRes.json();
    const response = visionData.responses?.[0];

    // Extract labels
    const labels: string[] = (response?.labelAnnotations ?? []).map(
      (a: { description: string }) => a.description,
    );
    const topLabelScore: number = response?.labelAnnotations?.[0]?.score ?? 0.5;

    // Extract colors
    const colorProps = response?.imagePropertiesAnnotation?.dominantColors?.colors ?? [];
    const sortedColors = [...colorProps].sort(
      (a: { score: number }, b: { score: number }) => b.score - a.score,
    );

    const primaryRgb = sortedColors[0]?.color ?? { red: 128, green: 128, blue: 128 };
    const secondaryRgb = sortedColors[1]?.color;

    const primaryHex = rgbToHex(
      Math.round(primaryRgb.red ?? 0),
      Math.round(primaryRgb.green ?? 0),
      Math.round(primaryRgb.blue ?? 0),
    );
    const secondaryHex = secondaryRgb
      ? rgbToHex(
          Math.round(secondaryRgb.red ?? 0),
          Math.round(secondaryRgb.green ?? 0),
          Math.round(secondaryRgb.blue ?? 0),
        )
      : null;

    // Classify type
    const { type, subtype } = mapLabelToType(labels);

    // Infer occasions from labels
    const occasions: string[] = [];
    const labelStr = labels.join(' ').toLowerCase();
    if (labelStr.includes('casual') || labelStr.includes('denim') || labelStr.includes('sneaker')) occasions.push('casual');
    if (labelStr.includes('suit') || labelStr.includes('blazer') || labelStr.includes('formal')) occasions.push('formal');
    if (labelStr.includes('sport') || labelStr.includes('athletic') || labelStr.includes('gym')) occasions.push('sport');
    if (occasions.length === 0) occasions.push('casual');

    const result: ClassificationResult = {
      type,
      subtype,
      primary_color: primaryHex,
      secondary_color: secondaryHex,
      color_label: hexToColorLabel(primaryHex),
      pattern: labelStr.includes('stripe') ? 'striped'
        : labelStr.includes('plaid') || labelStr.includes('check') ? 'plaid'
        : labelStr.includes('floral') ? 'floral'
        : labelStr.includes('print') ? 'graphic'
        : 'solid',
      occasions,
      season: ['all'],
      ai_confidence: topLabelScore,
      vision_raw: response,
    };

    return new Response(JSON.stringify(result), {
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
