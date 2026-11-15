'use client';

export async function compressImageForFastScan(
  fileOrBlob: File | Blob,
  maxDimension = 1024,
  quality = 0.82
): Promise<{ base64DataUrl: string; width: number; height: number; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const base64DataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({
        base64DataUrl,
        width,
        height,
        sizeBytes: Math.round((base64DataUrl.length * 3) / 4),
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image for scanning'));
    };

    img.src = objectUrl;
  });
}
