'use client';

/**
 * Shrinks a camera photo to a JPEG data URL small enough for slow mobile
 * networks (longest side `maxSide`, ~100–300 KB) before it is uploaded.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo (JPEG or PNG).');
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('That photo could not be opened. Try another one.');
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare the photo.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
