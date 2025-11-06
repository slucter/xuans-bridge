import axios from 'axios';
import FormData from 'form-data';

// Using ImgBB as free S3 alternative (or you can use other free services)
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

export async function uploadThumbnailToS3(file: File | Blob | Buffer, filename: string = 'thumbnail.jpg'): Promise<string> {
  // If using ImgBB
  if (IMGBB_API_KEY) {
    const formData = new FormData();
    let buffer: Buffer;
    
    if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (typeof File !== 'undefined' && file instanceof File) {
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (file instanceof Blob) {
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      throw new Error('Invalid file type');
    }
    
    formData.append('image', buffer, { filename });
    formData.append('key', IMGBB_API_KEY);

    const response = await axios.post(IMGBB_UPLOAD_URL, formData, {
      headers: formData.getHeaders(),
    });

    if (response.data.success) {
      return response.data.data.url;
    }
    throw new Error('ImgBB upload failed');
  }

  // Alternative: Using Cloudinary free tier or other services
  // For now, return a placeholder or throw error
  throw new Error('S3 upload service not configured. Please set IMGBB_API_KEY or configure Cloudinary');
}

// Alternative: Using Cloudinary
export async function uploadThumbnailToCloudinary(file: File | Blob | Buffer, filename: string = 'thumbnail.jpg'): Promise<string> {
  const CLOUDINARY_UPLOAD_URL = process.env.CLOUDINARY_UPLOAD_URL || '';
  const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || '';

  if (!CLOUDINARY_UPLOAD_URL || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary not configured');
  }

  const formData = new FormData();
  let buffer: Buffer;
  
  if (Buffer.isBuffer(file)) {
    buffer = file;
  } else if (typeof File !== 'undefined' && file instanceof File) {
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (file instanceof Blob) {
    buffer = Buffer.from(await file.arrayBuffer());
  } else {
    throw new Error('Invalid file type');
  }
  
  formData.append('file', buffer, { filename });
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await axios.post(CLOUDINARY_UPLOAD_URL, formData, {
    headers: formData.getHeaders(),
  });

  return response.data.secure_url;
}

