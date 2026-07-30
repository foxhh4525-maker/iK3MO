import { v2 as cloudinary } from "cloudinary";
import { logger } from "./logger";

// ⚙️ التخزين الخارجي للصور (Cloudinary) — بدل ما نخزّن الصور Base64 داخل
// قاعدة البيانات (اللي يخليها تكبر وتبطئ بسرعة)، نرفعها هنا ونحفظ بس الرابط.
// المتغيرات الثلاثة لازم تكون موجودة فـ Environment Variables (Render):
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export const isCloudinaryConfigured = Boolean(cloudName && apiKey && apiSecret);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
} else {
  logger.warn(
    "⚠️ متغيرات Cloudinary غير مكتملة (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) — رفع الصور للتخزين الخارجي معطّل، بيرجع لطريقة Base64 القديمة.",
  );
}

/**
 * يرفع صورة (data URL بصيغة Base64) لـ Cloudinary ويرجّع الرابط العام (secure_url).
 * folder اختياري لتنظيم الصور (مثلاً "kemo/records").
 */
export async function uploadImageToCloudinary(dataUrl: string, folder = "kemo"): Promise<string> {
  if (!isCloudinaryConfigured) {
    throw new Error("Cloudinary غير مهيّأ — تأكد من متغيرات البيئة");
  }
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder,
    resource_type: "image",
    overwrite: true,
  });
  return result.secure_url;
}

export interface StorageStatus {
  name: "cloudinary";
  configured: boolean;
  ok: boolean;
  usedPercent: number | null;
  usedCredits?: number;
  limitCredits?: number;
  error?: string;
}

/**
 * يتحقق فعلياً إن Cloudinary شغّال (مو بس المتغيرات موجودة) ويجيب نسبة استهلاك
 * الباقة المجانية (Credits) عشان نعرضها بشريط الحالة بلوحة الأدمن.
 */
export async function getCloudinaryStatus(): Promise<StorageStatus> {
  if (!isCloudinaryConfigured) {
    return { name: "cloudinary", configured: false, ok: false, usedPercent: null, error: "غير مهيّأ" };
  }
  try {
    const usage = await cloudinary.api.usage();
    // credits.usage / credits.limit تعكس استهلاك الباقة (تخزين + تحويلات + نقل بيانات) بوحدة موحّدة
    const used = usage?.credits?.usage ?? null;
    const limit = usage?.credits?.limit ?? null;
    const usedPercent = used !== null && limit ? Math.round((used / limit) * 100) : null;
    return {
      name: "cloudinary",
      configured: true,
      ok: true,
      usedPercent,
      usedCredits: used ?? undefined,
      limitCredits: limit ?? undefined,
    };
  } catch (err: any) {
    logger.error({ err }, "Cloudinary usage check failed");
    return { name: "cloudinary", configured: true, ok: false, usedPercent: null, error: "تعذّر الاتصال بـ Cloudinary" };
  }
}