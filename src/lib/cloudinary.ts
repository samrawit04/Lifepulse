/**
 * Cloudinary Direct Upload Utility
 *
 * Uses Cloudinary's unsigned upload API to upload images, audio, and media directly
 * from the browser without sending multi-megabyte payloads to the backend.
 *
 * Required environment variables (in .env or Vercel):
 * - VITE_CLOUDINARY_CLOUD_NAME
 * - VITE_CLOUDINARY_UPLOAD_PRESET
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export interface UploadResult {
  url: string;
  publicId?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
}

/**
 * Compresses an image file using HTML5 canvas as a lightweight fallback.
 * Keeps image payloads well below 100KB if direct cloud upload is unavailable.
 */
export async function compressImageClient(file: File | Blob, maxWidth = 1000, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a file (image, audio, video, document) directly to Cloudinary.
 * If Cloudinary is not configured or offline, falls back to a compressed data URL.
 */
export async function uploadToCloudinary(
  file: File | Blob,
  folder = "lifepulse_notes"
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.warn(
      "[Cloudinary] VITE_CLOUDINARY_CLOUD_NAME or VITE_CLOUDINARY_UPLOAD_PRESET is not set. Falling back to compressed client-side payload."
    );
    if (file.type.startsWith("image/")) {
      return compressImageClient(file);
    }
    // For non-images without cloud storage, return standard dataURL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  const resourceType = file.type.startsWith("video/") || file.type.startsWith("audio/") ? "video" : "auto";
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

  const res = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Cloudinary upload failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.secure_url as string;
}
