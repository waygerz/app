// Client-side image normalization. The media service never sees upload bytes
// (presigned direct-to-S3), so any transform happens here before the PUT.
//
// jpeg/png -> webp; gif is passed through untouched (canvas flattens animation).
// Falls back to jpeg if the browser can't encode webp from a canvas.

export interface WebpOptions {
  /** Output edge length in px (square) or max dimension (non-square). */
  size?: number;
  /** 0..1 encoder quality. */
  quality?: number;
  /** Center-crop to a square (logos/avatars). Default true. */
  square?: boolean;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('could not read file'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('invalid image'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

export async function imageToWebp(file: File, opts: WebpOptions = {}): Promise<File> {
  // Animated GIFs can't survive a canvas round-trip — keep as-is.
  if (file.type === 'image/gif') return file;

  const { size = 400, quality = 0.85, square = true } = opts;
  const img = await loadImage(await readAsDataUrl(file));

  const canvas = document.createElement('canvas');
  let sx = 0, sy = 0, sw = img.width, sh = img.height, dw: number, dh: number;
  if (square) {
    const side = Math.min(img.width, img.height);
    sx = (img.width - side) / 2;
    sy = (img.height - side) / 2;
    sw = sh = side;
    canvas.width = canvas.height = dw = dh = size;
  } else {
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    canvas.width = dw = Math.round(img.width * scale);
    canvas.height = dh = Math.round(img.height * scale);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  // Prefer webp; some older Safari builds ignore it and hand back png, so verify
  // the returned type and fall back to jpeg for a predictable, smaller result.
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  let type = 'image/webp';
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    type = 'image/jpeg';
    ext = 'jpg';
  }
  if (!blob) throw new Error('image encoding failed');

  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.${ext}`, { type });
}
