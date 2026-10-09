// [9 Oct] TEST ONLY: could shapes be recognised inside the app, with no AI
// calls and no cost? Daisy: "Test first vigorously before anything."
//
// Nothing here is used by the app. It is one endpoint, run by hand, that:
//  1. loads a small open image model on this server (downloaded once,
//     cached on disk, no per-use cost),
//  2. turns every catalogue stock photo and every piece whose shape is
//     already known into a "fingerprint",
//  3. ranks the catalogue for each known piece by how alike the
//     fingerprints are, in several ways, and scores each way against the
//     answer, the same answer key the AI test uses,
//  4. records how much memory and time it took, because this server is
//     small and a model that does not fit is no use however accurate.
// Results go to vision_test_runs. Square is not touched.

let lib = null;
const loadLib = async () => (lib ||= await import('@huggingface/transformers'));

const MODELS = [
  { id: 'Xenova/clip-vit-base-patch32', kind: 'clip' },
  { id: 'Xenova/dinov2-small', kind: 'dino', alt: ['onnx-community/dinov2-small', 'onnx-community/dinov2-small-ONNX'] },
];

const norm = (v) => {
  let s = 0; for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return Float32Array.from(v, (x) => x / s);
};
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const mb = () => Math.round(process.memoryUsage().rss / 1048576);

export function registerVisionTestRoutes(app, { supabase, STUDIO_ID, logger, sharp, fetchBuf, cropPiece, catalogue, baseName }) {
  let running = false;

  async function makeEmbedder(m, dtype) {
    const T = await loadLib();
    T.env.cacheDir = '/tmp/hf-cache';
    T.env.allowLocalModels = false;
    const processor = await T.AutoProcessor.from_pretrained(m.id);
    const Model = m.kind === 'clip' ? T.CLIPVisionModelWithProjection : T.AutoModel;
    const model = await Model.from_pretrained(m.id, { dtype });
    const embed = async (buf) => {
      const { data, info } = await sharp(buf).rotate()
        .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const img = new T.RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
      const out = await model(await processor(img));
      const t = out.image_embeds || out.pooler_output || out.last_hidden_state;
      let v;
      if (t.dims.length === 3) v = Array.from(t.data.slice(0, t.dims[2])); // CLS token
      else v = Array.from(t.data);
      return norm(v);
    };
    let text = null;
    if (m.kind === 'clip') {
      const tok = await T.AutoTokenizer.from_pretrained(m.id);
      const tm = await T.CLIPTextModelWithProjection.from_pretrained(m.id, { dtype });
      text = async (strings) => {
        const out = [];
        for (let i = 0; i < strings.length; i += 32) {
          const inputs = tok(strings.slice(i, i + 32), { padding: true, truncation: true });
          const { text_embeds } = await tm(inputs);
          const d = text_embeds.dims[1];
          for (let k = 0; k < text_embeds.dims[0]; k++) out.push(norm(Array.from(text_embeds.data.slice(k * d, (k + 1) * d))));
        }
        return out;
      };
    }
    return { embed, text, dispose: async () => { try { await model.dispose?.(); } catch { /* */ } } };
  }

  async function cached(model, key) {
    const { data } = await supabase.from('vision_embeddings').select('vec').eq('model', model).eq('key', key).maybeSingle();
    return data?.vec ? Float32Array.from(data.vec) : null;
  }
  async function store(model, key, vec) {
    await supabase.from('vision_embeddings').upsert({ model, key, vec: Array.from(vec) }, { onConflict: 'model,key' });
  }

  async function run(runId, opts) {
    const log = [];
    const say = async (s) => {
      log.push(`${new Date().toISOString().slice(11, 19)} ${s} (memory ${mb()}MB)`);
      logger.info(`[vision-test] ${s}`);
      await supabase.from('vision_test_runs').update({ log: log.join('\n') }).eq('id', runId);
    };
    const summary = { memory_peak_mb: mb(), models: {} };
    const detail = [];
    let peak = mb();
    const tick = () => { peak = Math.max(peak, mb()); };

    const shapes = (await catalogue()).filter((s) => s.image_url);
    const allShapes = await catalogue();
    const nameOf = new Map(allShapes.map((s) => [s.square_item_id, s.name]));
    const { data: gold } = await supabase.from('pottery_pieces')
      .select('id, square_item_id, reference_photo_url, photo_box, piece_type, description')
      .eq('studio_id', STUDIO_ID).eq('shape_confirmed', true).not('square_item_id', 'is', null)
      .not('reference_photo_url', 'is', null).not('photo_box', 'is', null).limit(500);
    await say(`${(gold || []).length} known pieces, ${shapes.length} catalogue shapes with a photo`);

    // Crops once, reused for every model.
    const crops = new Map();
    const photos = new Map();
    for (const g of gold || []) {
      try {
        if (!photos.has(g.reference_photo_url)) photos.set(g.reference_photo_url, await fetchBuf(g.reference_photo_url));
        crops.set(g.id, await cropPiece(photos.get(g.reference_photo_url), g.photo_box, 320));
      } catch (e) { await say(`crop failed ${g.id}: ${e.message}`); }
    }
    photos.clear();
    await say(`${crops.size} crops ready`);

    for (const m of MODELS.filter((x) => !opts.only || opts.only === x.kind)) {
      const t0 = Date.now();
      let E = null, lastErr = null;
      for (const id of [m.id, ...(m.alt || [])]) {
        for (const dtype of [opts.dtype || 'q8', 'fp32']) {
          try { E = await makeEmbedder({ ...m, id }, dtype); m.used = `${id} (${dtype})`; break; }
          catch (e) { lastErr = e; }
        }
        if (E) break;
      }
      if (!E) { await say(`${m.id} would not load: ${lastErr?.message}`); summary.models[m.id] = { error: lastErr?.message }; continue; }
      await say(`using ${m.used}`);
      tick();
      await say(`${m.id} loaded in ${Math.round((Date.now() - t0) / 1000)}s`);

      // Catalogue fingerprints, cached so a re-run is quick.
      const cat = [];
      let made = 0, missed = 0;
      const tEmb = Date.now();
      let next = 0;
      const worker = async () => {
        while (next < shapes.length) {
          const s = shapes[next++];
          let v = await cached(m.id, `cat:${s.square_item_id}`);
          if (!v) {
            try { v = await E.embed(await fetchBuf(s.image_url)); await store(m.id, `cat:${s.square_item_id}`, v); made++; }
            catch { missed++; continue; }
          }
          cat.push({ s, v });
          tick();
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      await say(`${m.id}: ${cat.length} catalogue fingerprints (${made} new, ${missed} failed) in ${Math.round((Date.now() - tEmb) / 1000)}s`);

      // Text fingerprints of the shape names (CLIP only).
      let textVecs = null;
      if (E.text) {
        try {
          const tv = await E.text(allShapes.map((s) => `a photo of a hand-painted ceramic ${s.name}`));
          textVecs = new Map(allShapes.map((s, i) => [s.square_item_id, tv[i]]));
          await say(`${m.id}: ${textVecs.size} name fingerprints`);
        } catch (e) { await say(`${m.id}: names failed ${e.message}`); }
      }
      tick();

      // Each known piece.
      const pv = new Map();
      const tP = Date.now();
      for (const g of gold || []) {
        const c = crops.get(g.id);
        if (!c) continue;
        try { pv.set(g.id, await E.embed(c)); } catch { /* skip */ }
      }
      tick();
      const perPieceMs = pv.size ? Math.round((Date.now() - tP) / pv.size) : null;

      const nouns = (t) => String(t || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/(es|s)$/, ''));
      const scoreVariant = (name, rank) => {
        const r = { n: 0, top1: 0, top4: 0, top8: 0, family1: 0, no_photo_truth: 0, ranks: [] };
        for (const g of gold || []) {
          const v = pv.get(g.id);
          if (!v) continue;
          const list = rank(g, v);
          if (!list) continue;
          r.n++;
          const pos = list.findIndex((x) => x === g.square_item_id);
          if (!shapes.some((s) => s.square_item_id === g.square_item_id) && name.includes('photo')) r.no_photo_truth++;
          if (pos === 0) r.top1++;
          if (pos >= 0 && pos < 4) r.top4++;
          if (pos >= 0 && pos < 8) r.top8++;
          if (list[0] && baseName(nameOf.get(list[0])) === baseName(nameOf.get(g.square_item_id))) r.family1++;
          r.ranks.push(pos < 0 ? null : pos + 1);
          detail.push({ model: m.id, variant: name, piece: g.id, truth: nameOf.get(g.square_item_id), rank: pos < 0 ? null : pos + 1, top3: list.slice(0, 3).map((x) => nameOf.get(x)) });
        }
        return r;
      };
      const byPhoto = (g, v) => cat.map((c) => [c.s.square_item_id, dot(v, c.v)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      const variants = { 'photo vs stock photo': byPhoto };
      // Same, but only shapes whose name says what the piece is (a mug
      // against the mugs), when there are any.
      variants['photo, same kind only'] = (g, v) => {
        const kind = nouns(g.piece_type);
        const pool = cat.filter((c) => { const w = new Set(nouns(`${c.s.name} ${c.s.category || ''}`)); return kind.some((k) => w.has(k)); });
        const use = pool.length ? pool : cat;
        return use.map((c) => [c.s.square_item_id, dot(v, c.v)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      };
      if (textVecs) {
        variants['photo vs name'] = (g, v) => [...textVecs.entries()].map(([id, t]) => [id, dot(v, t)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        variants['photo + name'] = (g, v) => {
          const img = new Map(cat.map((c) => [c.s.square_item_id, dot(v, c.v)]));
          return [...textVecs.entries()].map(([id, t]) => [id, dot(v, t) * 2 + (img.get(id) ?? 0)]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        };
      }
      // Learned: other confirmed painted pieces of the same shape (leave
      // this one out). Only possible where a shape has two or more.
      variants['learned from our own pieces'] = (g, v) => {
        const others = (gold || []).filter((o) => o.id !== g.id && pv.get(o.id));
        if (!others.some((o) => o.square_item_id === g.square_item_id)) return null;
        const best = new Map();
        for (const o of others) { const s = dot(v, pv.get(o.id)); if (!best.has(o.square_item_id) || best.get(o.square_item_id) < s) best.set(o.square_item_id, s); }
        return [...best.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      };

      const res = {};
      for (const [name, fn] of Object.entries(variants)) res[name] = scoreVariant(name, fn);
      summary.models[m.id] = { load_s: Math.round((Date.now() - t0) / 1000), per_piece_ms: perPieceMs, catalogue: cat.length, variants: res };
      await say(`${m.id}: scored ${Object.keys(res).length} ways`);
      await E.dispose();
      if (global.gc) global.gc();
    }
    summary.memory_peak_mb = peak;
    await supabase.from('vision_test_runs').update({ status: 'done', summary, detail: detail.slice(0, 2000) }).eq('id', runId);
    await say('done');
  }

  app.post('/api/spec/vision/test', async (req, res) => {
    if (running) return res.json({ started: false, reason: 'already running' });
    running = true;
    const { data: row } = await supabase.from('vision_test_runs').insert({ status: 'running' }).select('id').single();
    res.json({ started: true, id: row?.id });
    try { await run(row.id, req.body || {}); }
    catch (err) {
      logger.error('[vision-test] failed', err.message);
      await supabase.from('vision_test_runs').update({ status: `failed: ${err.message}`.slice(0, 400) }).eq('id', row.id);
    } finally { running = false; }
  });
}
