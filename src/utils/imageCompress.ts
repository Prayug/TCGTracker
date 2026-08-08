/** Downscale + re-encode a data URL so phone captures stay valid and under API limits. */
export async function compressImageDataUrl(
  dataUrl: string,
  options: { maxSide?: number; quality?: number } = {}
): Promise<string> {
  const maxSide = options.maxSide ?? 1600;
  const quality = options.quality ?? 0.85;

  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Expected an image data URL');
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image for compression'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
  const width = Math.max(1, Math.round((img.width || 1) * scale));
  const height = Math.max(1, Math.round((img.height || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  const compressed = canvas.toDataURL('image/jpeg', quality);
  // Sanity: a real JPEG data URL should be well above this.
  if (compressed.length < 256) {
    throw new Error('Compressed image looks empty — please retake the photo');
  }
  return compressed;
}
