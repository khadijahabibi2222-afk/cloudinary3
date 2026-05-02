/**
 * lib/cloudinary.js — Photo upload via Cloudinary
 *
 * Replaces multer + base64 storage.
 * Photos are uploaded as data URIs (base64 strings from the frontend).
 *
 * Usage:
 *   const { uploadPhoto, deletePhoto } = require('./lib/cloudinary');
 *
 *   const result = await uploadPhoto(base64DataUri, 'orphan_id_123');
 *   // result: { url, publicId, width, height } | null if Cloudinary not configured
 *
 *   await deletePhoto('orphans/orphan_id_123');
 */

const cloudinary = require('cloudinary').v2;
const logger     = require('./logger');

// Configure only if credentials are present
const CONFIGURED = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY    &&
  process.env.CLOUDINARY_API_SECRET
);

if (CONFIGURED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('✅ Cloudinary configured');
} else {
  logger.warn('⚠️  Cloudinary not configured — photos stored as base64 (not recommended for production)');
}

/**
 * Upload a photo to Cloudinary.
 * @param {string} dataUri  — base64 data URI (data:image/jpeg;base64,...)
 * @param {string} orphanId — used as public_id for easy management
 * @returns {{ url, publicId, width, height } | null}
 */
async function uploadPhoto(dataUri, orphanId) {
  if (!CONFIGURED || !dataUri) return null;
  if (!dataUri.startsWith('data:')) return null;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      public_id:      'orphans/' + orphanId,
      overwrite:      true,
      resource_type:  'image',
      folder:         'orphan-management',
      timeout:        20000,                             // 20-second hard timeout (was 120s)
      transformation: [
        { width: 800, height: 800, crop: 'limit' },    // max 800×800
        { quality: 'auto:good' },                       // auto compress
        { fetch_format: 'auto' },                       // webp on supported browsers
      ],
    });
    return {
      url:      result.secure_url,
      publicId: result.public_id,
      width:    result.width,
      height:   result.height,
    };
  } catch (err) {
    logger.error('Cloudinary upload failed', { orphanId, err: err.message });
    return null;
  }
}

/**
 * Delete a photo from Cloudinary.
 * @param {string} publicId — e.g. 'orphans/orphan_id_123'
 */
async function deletePhoto(publicId) {
  if (!CONFIGURED || !publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn('Cloudinary delete failed', { publicId, err: err.message });
  }
}

/** Generate optimized thumbnail URL from existing Cloudinary URL */
function thumbUrl(url, width = 120) {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/w_${width},h_${width},c_fill,q_auto/`);
}

module.exports = { uploadPhoto, deletePhoto, thumbUrl, CONFIGURED };
