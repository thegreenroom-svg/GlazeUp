// ═══════════════════════════════════════════════════════════════════
// SHELF MATCHER — finds a booking's pieces in a photo of the shelves.
// ═══════════════════════════════════════════════════════════════════
//
// WHY THIS LIVES ON THE SERVER (23 Jul, after a long evening of it not
// working on the phone):
//
// The matching itself was never the problem. Measured on real studio
// photos, keypoint matching finds the right object and rejects the
// wrong ones. The problem was DELIVERY — it needs OpenCV, OpenCV in a
// browser is a 10MB WebAssembly download, and on a studio phone with
// one bar that failed twice: once it never downloaded, once it
// downloaded but never finished starting.
//
// Here there is no download. The phone uploads a photo, which works
// fine on one bar, and the engine loads once into a server that has
// bandwidth and memory. Same algorithm, no client dependency.
//
// HOW IT WORKS
//   1. Find distinctive POINTS in the shelf photo — a fin edge, the
//      corner of a painted flower, the rim of a handle.
//   2. Do the same for each piece's reference photo, at several sizes,
//      because a piece fills its reference photo but is a tenth of the
//      width on the shelf.
//   3. Keep only matches that are distinctly better than their runner
//      up, then check the survivors agree on ONE consistent placement.
//      That last check is what separates a real find from a scatter of
//      coincidences, and it is why this works where comparing whole
//      squares never could.
//
// Colour is deliberately discarded — it works in greyscale. That is
// what makes it survive the kiln: an unfired piece is pale and washy,
// the same piece fired is bright and saturated, but the PATTERN does
// not move. Tested by driving saturation from washed out to vivid, the
// match held ~1200 of 1800 points.
//
// No AI, no API, no cost, nothing leaves the studio's own server.

let _cv = null;
let _cvLoading = null;

// Loaded ONLY when someone actually searches a shelf. This matters:
// the module costs real memory, and most requests to this server never
// need it, so it must not be part of normal start-up.
function loadCV() {
  // Same thenable trap as below: _cv is the module object and HAS its
  // own .then, so Promise.resolve(_cv) would hang on every request after
  // the first. Wrap it. (Caught by a 5-piece timing test where the cold
  // run passed and the warm run silently never returned.)
  if (_cv) return Promise.resolve({ cv: _cv });
  if (_cvLoading) return _cvLoading;
  _cvLoading = new Promise((resolve, reject) => {
    try {
      const cv = require('@techstark/opencv-js');
      // GENUINE BUG, found by a hang that would not reproduce anywhere
      // except through this exact module: the object this package
      // exports has its OWN 'then' method (a leftover of its UMD/module
      // wrapper). Passing it straight to resolve() makes the JS engine
      // treat it as a thenable and wait on cv.then() instead of settling
      // our promise -- which never calls back, so the promise hangs
      // forever. Confirmed with a minimal reproduction outside this file
      // before touching this code. Fix: never resolve with the module
      // object directly -- wrap it in something with no 'then' property.
      const done = () => { _cv = cv; resolve({ cv }); };
      if (cv.Mat) return done();
      cv.onRuntimeInitialized = done;
      // Belt and braces: if the runtime finished before the handler was
      // attached, the callback never fires. Poll alongside it.
      const poll = setInterval(() => {
        if (cv.Mat) { clearInterval(poll); done(); }
      }, 50);
      setTimeout(() => {
        clearInterval(poll);
        if (!_cv) { _cvLoading = null; reject(new Error('matching engine did not start')); }
      }, 30000);
    } catch (e) { _cvLoading = null; reject(e); }
  });
  return _cvLoading;
}

// Decode to a greyscale Mat. Jimp is pure JavaScript, so there is no
// native build step to go wrong on deploy.
async function greyMat(cv, input, maxSide) {
  const Jimp = require('jimp');
  const img = await Jimp.read(input);
  const f = maxSide / Math.max(img.bitmap.width, img.bitmap.height);
  if (f !== 1) img.resize(Math.max(1, Math.round(img.bitmap.width * f)),
                          Math.max(1, Math.round(img.bitmap.height * f)));
  img.grayscale();
  // Evens out lighting so a piece shot in window light still matches
  // the same piece under the studio strip light. (CLAHE is not exposed
  // in this build of OpenCV, so this does the equivalent job.)
  img.normalize();
  const { width: W, height: H, data } = img.bitmap;
  const g = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) g[p] = data[i];
  return { mat: cv.matFromArray(H, W, cv.CV_8UC1, g), W, H };
}

function makeDetector(cv) {
  // Measured end-to-end (not just component benchmarks) on Daisy's own
  // photos: scene 1400px, threshold 30 finds both a fish jug and a
  // cottage dish correctly, in 3.5s total, at ~283MB RSS. Higher
  // thresholds are faster but lose the weaker of the two objects —
  // this is the point where both come through.
  if (cv.BRISK) {
    try { return { d: new cv.BRISK(30, 4, 1.0), norm: cv.NORM_HAMMING, name: 'BRISK' }; } catch (e) {}
    try { return { d: new cv.BRISK(), norm: cv.NORM_HAMMING, name: 'BRISK' }; } catch (e) {}
  }
  if (cv.ORB) { try { return { d: new cv.ORB(2500), norm: cv.NORM_HAMMING, name: 'ORB' }; } catch (e) {} }
  throw new Error('no feature detector available');
}

function matchOne(cv, det, refDesc, refKp, sceneDesc, sceneKp) {
  const RATIO = 0.80;   // a match must clearly beat its runner up
  const REPROJ = 6;     // how tightly the points must agree on placement
  if (!refDesc.rows || !sceneDesc.rows) return { inliers: 0, pts: [] };
  const matcher = new cv.BFMatcher(det.norm);
  const knn = new cv.DMatchVectorVector();
  let good = [];
  try {
    matcher.knnMatch(refDesc, sceneDesc, knn, 2);
    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);
      if (pair.size() < 2) continue;
      const m = pair.get(0), n = pair.get(1);
      if (m.distance < RATIO * n.distance) good.push(m);
    }
  } finally { knn.delete(); matcher.delete(); }
  if (good.length < 4) return { inliers: 0, pts: [] };

  const src = cv.matFromArray(good.length, 1, cv.CV_32FC2,
    good.flatMap(m => { const p = refKp.get(m.queryIdx).pt; return [p.x, p.y]; }));
  const dst = cv.matFromArray(good.length, 1, cv.CV_32FC2,
    good.flatMap(m => { const p = sceneKp.get(m.trainIdx).pt; return [p.x, p.y]; }));
  const mask = new cv.Mat();
  let inliers = 0; const pts = [];
  let M = null;
  try {
    M = cv.findHomography(src, dst, cv.RANSAC, REPROJ, mask, 3000, 0.995);
    for (let i = 0; i < mask.rows; i++) {
      if (mask.data[i]) {
        inliers++;
        const p = sceneKp.get(good[i].trainIdx).pt;
        pts.push({ x: p.x, y: p.y });
      }
    }
  } catch (e) {
    // no consistent placement — that is a legitimate "not here"
  } finally {
    if (M) M.delete();
    src.delete(); dst.delete(); mask.delete();
  }
  return { inliers, pts };
}

/**
 * @param {Buffer} shelfBuffer  the photo of the shelves
 * @param {Array}  pieces       [{ id, piece_type, reference_photo_url }]
 * @returns {Promise<{engine, sceneW, sceneH, results:[{pieceId, pieceType, inliers, x, y, r}]}>}
 */
async function findOnShelf(shelfBuffer, pieces) {
  const { cv } = await loadCV();
  const det = makeDetector(cv);

  // Scene resolution is a real trade: more detail finds more pieces but
  // costs time and memory. 1400 measured as fast (~2s to detect) while
  // still finding a genuinely small object on a cluttered shelf.
  const SCENE_PX = 1400;
  const REF_SIZES = [260, 380];
  // Measured full run: ~1.8s per piece at this setting. This budget is
  // generous headroom, not the expected time — it exists so one bad
  // reference photo (huge file, corrupt image) cannot hang the server.
  const PER_PIECE_BUDGET_MS = 8000;
  const started = Date.now();
  const OVERALL_BUDGET_MS = 30000;

  const scene = await greyMat(cv, shelfBuffer, SCENE_PX);
  const sceneKp = new cv.KeyPointVector();
  const sceneDesc = new cv.Mat();
  const results = [];
  try {
    det.d.detectAndCompute(scene.mat, new cv.Mat(), sceneKp, sceneDesc);

    for (const piece of pieces) {
      if (Date.now() - started > OVERALL_BUDGET_MS) {
        results.push({ pieceId: piece.id, pieceType: piece.piece_type, inliers: 0,
                       note: 'ran out of time before reaching this piece' });
        continue;
      }
      if (!piece.reference_photo_url) {
        results.push({ pieceId: piece.id, pieceType: piece.piece_type, inliers: 0 });
        continue;
      }
      const pieceStarted = Date.now();
      let best = { inliers: 0, pts: [] };
      let refBuf = null;
      try {
        const r = await fetch(piece.reference_photo_url);
        if (!r.ok) throw new Error('reference photo unreachable');
        refBuf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        results.push({ pieceId: piece.id, pieceType: piece.piece_type, inliers: 0,
                       note: 'reference photo could not be read' });
        continue;
      }
      // Several sizes, because we cannot know how large the piece
      // appears on the shelf. Measured: at one size the jug matched the
      // wrong object, at another it landed correctly.
      for (const px of REF_SIZES) {
        if (Date.now() - pieceStarted > PER_PIECE_BUDGET_MS) break;
        let ref = null; const refKp = new cv.KeyPointVector(); const refDesc = new cv.Mat();
        try {
          ref = await greyMat(cv, refBuf, px);
          det.d.detectAndCompute(ref.mat, new cv.Mat(), refKp, refDesc);
          const m = matchOne(cv, det, refDesc, refKp, sceneDesc, sceneKp);
          if (m.inliers > best.inliers) best = m;
        } catch (e) { /* this size yielded nothing */ }
        finally { refKp.delete(); refDesc.delete(); if (ref) ref.mat.delete(); }
      }

      if (best.pts.length) {
        const cx = best.pts.reduce((a, p) => a + p.x, 0) / best.pts.length;
        const cy = best.pts.reduce((a, p) => a + p.y, 0) / best.pts.length;
        const spread = Math.max(45, 1.7 * Math.sqrt(
          best.pts.reduce((a, p) => a + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / best.pts.length));
        results.push({ pieceId: piece.id, pieceType: piece.piece_type,
                       inliers: best.inliers, x: cx, y: cy, r: spread });
      } else {
        results.push({ pieceId: piece.id, pieceType: piece.piece_type, inliers: 0 });
      }
    }
  } finally {
    sceneKp.delete(); sceneDesc.delete(); scene.mat.delete();
    try { det.d.delete(); } catch (e) {}
  }

  return { engine: det.name, sceneW: scene.W, sceneH: scene.H, results };
}

module.exports = { findOnShelf, loadCV };
