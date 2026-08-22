/** Client-side blur / brightness gate using a downscaled canvas sample. */
export async function assessClientQuality(src: string | File): Promise<string | null> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load image'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    const maxSide = 320;
    const scale = maxSide / Math.max(img.width, img.height);
    canvas.width = Math.max(32, Math.round(img.width * scale));
    canvas.height = Math.max(32, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let sum = 0;
    let sumSq = 0;
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = g;
      sum += g;
      sumSq += g * g;
    }
    const n = gray.length;
    const mean = sum / n;
    const contrast = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

    let lap = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const v = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width];
        lap += v * v;
        count++;
      }
    }
    const sharpness = lap / Math.max(1, count);

    if (sharpness < 28) return 'Photo looks blurry. Hold steady, tap to focus, and retake.';
    if (mean < 40) return 'Photo is too dark. Use even lighting and avoid shadows.';
    if (mean > 245) return 'Photo is overexposed. Reduce glare or bright reflections.';
    if (contrast < 16) return 'Low contrast — place the card on a contrasting solid background.';
    return null;
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}
