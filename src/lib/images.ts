const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file is not a usable image."));
    image.src = src;
  });
}

/**
 * Reads a photo the person picked and shrinks it to a square (or a wide cover)
 * that fits comfortably in local storage. Everything stays on the device.
 */
export async function photoToDataUrl(
  file: File,
  options: { width?: number; height?: number; quality?: number } = {},
): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP, GIF, or AVIF image.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("That image is larger than 12 MB. Choose a smaller one.");
  }
  const width = options.width ?? 640;
  const height = options.height ?? 640;
  const quality = options.quality ?? 0.85;
  const raw = await readAsDataUrl(file);
  try {
    const image = await loadImage(raw);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return raw;
    // Cover the frame without stretching the photo.
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(
      image,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    // A browser that cannot decode the image can still keep the original data
    // URL; the preview will simply render what was chosen.
    return raw;
  }
}

/** Square profile picture. */
export function profilePhoto(file: File): Promise<string> {
  return photoToDataUrl(file, { width: 512, height: 512, quality: 0.85 });
}

/** Wide organization cover. */
export function coverPhoto(file: File): Promise<string> {
  return photoToDataUrl(file, { width: 1280, height: 720, quality: 0.82 });
}
