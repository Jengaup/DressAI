/**
 * process-image Edge Function
 *
 * Orchestrates the full garment upload pipeline:
 * 1. Receives base64 image from client
 * 2. Calls remove.bg for background removal
 * 3. Returns processed image as base64
 *
 * The client handles:
 *  - Final upload to Supabase Storage
 *  - Calling classify-garment separately
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType }: ProcessRequest = await req.json();
    const removeBgKey = Deno.env.get('REMOVE_BG_API_KEY')!;

    // Convert base64 to binary for multipart upload
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const formData = new FormData();
    formData.append(
      'image_file',
      new Blob([bytes], { type: mimeType }),
      'garment.jpg',
    );
    formData.append('size', 'auto');
    formData.append('format', 'png'); // PNG preserves transparency

    const removeBgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': removeBgKey },
      body: formData,
    });

    if (!removeBgRes.ok) {
      const errText = await removeBgRes.text();
      throw new Error(`remove.bg error ${removeBgRes.status}: ${errText}`);
    }

    const processedBuffer = await removeBgRes.arrayBuffer();
    const processedBase64 = btoa(
      String.fromCharCode(...new Uint8Array(processedBuffer)),
    );

    return new Response(
      JSON.stringify({
        processedBase64,
        mimeType: 'image/png',
        creditsCharged: removeBgRes.headers.get('X-Credits-Charged'),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
