// Compresses a photo IN THE BROWSER before it ever goes over the network,
// rather than relying on the server to do it.
//
// Why this exists: the server's resize step (sharp/libvips) genuinely
// cannot decode or encode HEIC in this environment -- proven directly,
// twice, against a real HEIC file: the encoder throws "Unsupported
// compression" and the decoder throws "Unsupported codec". An iPad or
// iPhone camera very often captures HEIC. So HEIC photos have been going
// to Gemini at full size, unresized -- slow to upload from the studio's
// own wifi, slow to process, exactly the "extremely slow" complaint this
// was all meant to fix.
//
// Safari on iOS/iPadOS can decode HEIC natively -- it's Apple's own
// format -- so doing the resize here, on the device, before upload,
// sidesteps the server's codec gap entirely and also cuts the upload
// itself, which matters on a studio's real wifi. The server-side resize
// stays in place as a safety net for anything that reaches it unresized
// (a browser where this fails, a non-HEIC photo that's still large).
//
// Matches the server's own target -- 1024px long edge, JPEG quality
// 82 -- so results stay comparable to what was already tested.
export async function compressPhotoForUpload(file: File, maxDim = 1024, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('canvas produced no blob');
    return blob;
  } catch {
    // Any failure -- an old browser, a format the canvas path can't
    // decode either -- and the original file goes through untouched.
    // The server-side resize (or its own HEIC-aware skip) is still
    // there as the real safety net; this is a speed optimisation, not
    // something later code should depend on having succeeded.
    return file;
  }
}
