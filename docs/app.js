// Day 14 · The map that knows too much — one 1 m UTCI model, shown at 100 m, 10 m and 1 m.
// The coarser maps are block averages of the same 1 m result, computed here in the browser.
(async () => {
  const $ = s => document.querySelector(s);
  const [meta, squares, plazas] = await Promise.all(["data/meta.json", "data/squares.json", "data/plazas.geojson"].map(u => fetch(u).then(r => r.json())));
  const W = meta.width, H = meta.height, [LO, HI] = meta.range, STEPS = [100, 50, 25, 10, 5, 2, 1];
  const S = { hour: meta.hours.indexOf(meta.peak), s: 1, sq: squares.find(q => q.name === "Römerberg").id, playing: false };

  // ── colour: UTCI heat-stress classes, continuous ──
  const STOPS = [[24, [92, 178, 168]], [28, [180, 214, 140]], [32, [255, 226, 128]], [36, [253, 166, 76]], [40, [236, 92, 52]], [44, [196, 34, 72]], [46, [140, 18, 92]], [50, [58, 10, 70]]];
  const ramp = v => { if (v <= STOPS[0][0]) return STOPS[0][1]; for (let i = 1; i < STOPS.length; i++) if (v <= STOPS[i][0]) { const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], k = (v - a) / (b - a); return ca.map((c, j) => c + k * (cb[j] - c)); } return STOPS.at(-1)[1]; };
  const css = v => `rgb(${ramp(v).map(Math.round).join(",")})`;
  $("#legend").innerHTML = `<div class="bar" style="background:linear-gradient(90deg,${[30, 34, 38, 42, 46, 50].map(v => css(v)).join(",")})"></div>
    <div class="ticks"><span>30</span><span>34</span><span>38</span><span>42</span><span>46</span><span>50 °C</span></div>
    <div class="cls"><span>strong</span><span></span><span>very strong</span><span>extreme</span></div>`;

  // ── data: 1 m frames → Float32 (NaN = building / river), block means per resolution ──
  const img = url => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const pixels = async url => { const i = await img(url), c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return g.getImageData(0, 0, W, H).data; };
  const pidPx = await pixels("data/plaza_id.png"), PID = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) PID[p] = pidPx[p * 4];
  const F = {}, A = {};
  async function frame(h) {
    if (F[h]) return F[h];
    const d = await pixels(`data/utci_${meta.hours[h]}.png`), a = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) { const v = d[p * 4]; a[p] = v ? LO + (v - 1) / 254 * (HI - LO) : NaN; }
    return (F[h] = a);
  }
  function agg(h, s) {                       // block means (≥ 25 % open), as a small grid
    const key = h + "_" + s; if (A[key]) return A[key];
    const a = F[h], gw = Math.ceil(W / s), gh = Math.ceil(H / s), sum = new Float32Array(gw * gh), n = new Uint32Array(gw * gh);
    for (let y = 0; y < H; y++) { const by = (y / s | 0) * gw; for (let x = 0; x < W; x++) { const v = a[y * W + x]; if (v === v) { const b = by + (x / s | 0); sum[b] += v; n[b]++; } } }
    const g = new Float32Array(gw * gh); for (let b = 0; b < g.length; b++) g[b] = n[b] >= 0.25 * s * s ? sum[b] / n[b] : NaN;
    return (A[key] = { g, gw, gh, s });
  }
  const valueAt = (h, s, x, y) => { if (s === 1) return F[h][y * W + x]; const G = agg(h, s); return G.g[(y / s | 0) * G.gw + (x / s | 0)]; };

  // ── the overlay canvas ──
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const cx = cv.getContext("2d"), ID = cx.createImageData(W, H);
  const LUT = new Uint8ClampedArray(1024 * 3); for (let i = 0; i < 1024; i++) LUT.set(ramp(LO + i / 1023 * (HI - LO)), i * 3);
  async function draw() {
    await frame(S.hour); const h = S.hour, s = S.s, d = ID.data;
    const G = s > 1 ? agg(h, s) : null, a = F[h];
    let cells = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, v = G ? G.g[(y / s | 0) * G.gw + (x / s | 0)] : a[p];
      if (v !== v) { d[p * 4 + 3] = 0; continue; }
      const k = Math.max(0, Math.min(1023, Math.round((v - LO) / (HI - LO) * 1023))) * 3;
      d[p * 4] = LUT[k]; d[p * 4 + 1] = LUT[k + 1]; d[p * 4 + 2] = LUT[k + 2]; d[p * 4 + 3] = 235;
    }
    cells = G ? G.g.reduce((n, v) => n + (v === v), 0) : a.reduce((n, v) => n + (v === v), 0);
    cx.putImageData(ID, 0, 0);
    if (s >= 5) { cx.strokeStyle = "rgba(10,8,14,.35)"; cx.lineWidth = s >= 25 ? 1.2 : 0.5; cx.beginPath();
      for (let x = 0; x <= W; x += s) { cx.moveTo(x, 0); cx.lineTo(x, H); } for (let y = 0; y <= H; y += s) { cx.moveTo(0, y); cx.lineTo(W, y); } cx.stroke(); }
    const src = map.getSource("utci"); if (src) src.play(), setTimeout(() => src.pause(), 60);
    $("#resv").textContent = `${s} m · ${cells.toLocaleString("en-US")} cell${cells > 1 ? "s" : ""}`;
    document.querySelectorAll(".res button").forEach(b => b.classList.toggle("on", +b.dataset.s === s));
    $("#hourv").textContent = `${meta.hours[h]}:00`;
    side();
  }

  // ── map ──
  const DOP = "https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=he_dop20_rgb&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg";
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const wide = innerWidth > 900;
  const map = new maplibregl.Map({ container: "map", style: { version: 8, glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf", sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0d0b10" } }] },
    center: wide ? [8.6825, 50.1108] : [8.6815, 50.1112], zoom: wide ? 15.55 : 14.7, maxZoom: 20, attributionControl: { compact: true, customAttribution: "UTCI: SOLWEIG 1 m · Aerial © HVBG Hessen (DOP20) · ALKIS" } });
  window.map = map;
  map.on("load", async () => {
    map.addSource("aerial", { type: "raster", tiles: [DOP], tileSize: 512, maxzoom: 20 });
    map.addLayer({ id: "aerial", type: "raster", source: "aerial", paint: { "raster-saturation": -0.55, "raster-brightness-max": 0.5, "raster-fade-duration": 150 } });
    // the same DOP20 photo for the model area, served with the map (works even when the Hessen WMS is slow or blocked)
    map.addSource("dop", { type: "image", url: "data/dop20_altstadt.jpg", coordinates: meta.corners });
    map.addLayer({ id: "dop", type: "raster", source: "dop", paint: { "raster-saturation": -0.55, "raster-brightness-max": 0.62, "raster-fade-duration": 0 } });
    let err = 0; map.on("error", e => { if (e.sourceId === "aerial" && ++err === 4) { map.removeLayer("aerial"); map.removeSource("aerial");
      map.addSource("aerial", { type: "raster", tiles: [ESRI], tileSize: 256, maxzoom: 19 }); map.addLayer({ id: "aerial", type: "raster", source: "aerial", paint: { "raster-saturation": -0.55, "raster-brightness-max": 0.5 } }, "dop"); } });
    map.addSource("utci", { type: "canvas", canvas: cv, coordinates: meta.corners, animate: false });
    map.addLayer({ id: "utci", type: "raster", source: "utci", paint: { "raster-resampling": "nearest", "raster-opacity": 0.86, "raster-fade-duration": 0 } });
    map.addSource("sq", { type: "geojson", data: plazas });
    map.addLayer({ id: "sq-line", type: "line", source: "sq", paint: { "line-color": "#fff", "line-width": ["case", ["==", ["get", "id"], S.sq], 2.6, 1], "line-opacity": 0.85 } });
    map.addLayer({ id: "sq-hit", type: "fill", source: "sq", paint: { "fill-color": "#fff", "fill-opacity": 0 } });
    await draw();
  });

  // pixel of a click (the grid is a slightly skewed rectangle in lon/lat: solve on its corners)
  const [NW, NE, , SW] = meta.corners;
  function toPx(ll) { const ax = NE[0] - NW[0], ay = NE[1] - NW[1], bx = SW[0] - NW[0], by = SW[1] - NW[1], dx = ll.lng - NW[0], dy = ll.lat - NW[1], det = ax * by - ay * bx;
    const u = (dx * by - dy * bx) / det, v = (ax * dy - ay * dx) / det; return [Math.floor(u * W), Math.floor(v * H)]; }
  const fmt = v => v === v && v != null ? `${v.toFixed(1)} °C` : "—";
  map.on("click", async e => {
    const [x, y] = toPx(e.lngLat); if (x < 0 || y < 0 || x >= W || y >= H) return;
    await frame(S.hour); const h = S.hour, id = PID[y * W + x], q = squares.find(q => q.id === id), st = q && q.h[meta.hours[h]];
    const v1 = valueAt(h, 1, x, y), v10 = valueAt(h, 10, x, y), v100 = valueAt(h, 100, x, y);
    if (q) { S.sq = id; map.setPaintProperty("sq-line", "line-width", ["case", ["==", ["get", "id"], id], 2.6, 1]); side(); }
    new maplibregl.Popup({ closeButton: false, maxWidth: "260px" }).setLngLat(e.lngLat).setHTML(`<div class="pop"><h4>${q ? q.name : "This spot"}</h4>
      <table><tr><td>at 100 m</td><td>${fmt(v100)}</td></tr><tr><td>at 10 m</td><td>${fmt(v10)}</td></tr><tr><td style="color:var(--acc)">at 1 m</td><td style="color:var(--acc)">${v1 === v1 ? fmt(v1) : "building"}</td></tr></table>
      ${st && v1 === v1 ? `<div class="d">${Math.abs(v1 - st.mean) < 0.3 ? "Right at" : v1 > st.mean ? `<b>${(v1 - st.mean).toFixed(1)} °C hotter</b> than` : `<b>${(st.mean - v1).toFixed(1)} °C cooler</b> than`} the square's mean (${st.mean.toFixed(1)} °C).</div>` : ""}</div>`).addTo(map);
  });
  map.on("mousemove", "sq-hit", () => map.getCanvas().style.cursor = "pointer"); map.on("mouseleave", "sq-hit", () => map.getCanvas().style.cursor = "");

  // ── side panel: what each resolution says about one square ──
  function side() {
    const hh = meta.hours[S.hour], q = squares.find(q => q.id === S.sq), st = q.h[hh];
    $("#sq-name").textContent = q.name; $("#sq-eb").textContent = `Square · ${hh}:00 · ${q.area.toLocaleString("en-US")} m²`;
    const r = a => a ? (a[1] - a[0] < 0.25 ? `${a[0].toFixed(1)}°` : `${a[0].toFixed(0)}–${a[1].toFixed(0)}°`) : "—";
    $("#say100").textContent = r(st.r100); $("#say10").textContent = r(st.r10); $("#say1").textContent = `${st.p5.toFixed(0)}–${st.p95.toFixed(0)}°`;
    // histogram of the 1 m values, with the 100 m cells and the mean marked
    const [b0, , bw] = meta.hist_bins, D0 = 36, D1 = 50, mx = Math.max(...st.hist), w = 300, h = 110, X = v => 6 + (Math.min(D1, Math.max(D0, v)) - D0) / (D1 - D0) * (w - 12);
    let g = st.hist.map((c, i) => { const v = b0 + i * bw; return c && v >= D0 && v < D1 ? `<rect x="${X(v)}" y="${h - 22 - (c / mx) * (h - 34)}" width="${X(v + bw) - X(v) - 0.6}" height="${(c / mx) * (h - 34)}" fill="${css(v + bw / 2)}"/>` : ""; }).join("");
    if (st.r100) g += `<rect x="${X(st.r100[0])}" y="4" width="${Math.max(2, X(st.r100[1]) - X(st.r100[0]))}" height="${h - 26}" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-dasharray="3 2"/><text x="${X((st.r100[0] + st.r100[1]) / 2)}" y="${h - 26 - (h - 34) - 2 > 10 ? 12 : 12}" fill="#fff" font-size="9.5" text-anchor="middle" font-family="JetBrains Mono">100 m</text>`;
    g += `<line x1="${X(st.mean)}" x2="${X(st.mean)}" y1="6" y2="${h - 22}" stroke="#fff" stroke-width="1.5"/>`;
    for (const t of [36, 38, 40, 42, 44, 46, 48, 50]) g += `<text x="${X(t)}" y="${h - 8}" fill="#b9b1a8" font-size="9.5" text-anchor="middle" font-family="JetBrains Mono">${t}°</text>`;
    $("#hist").innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Distribution of the 1 m values on this square">${g}</svg>`;
    const hot = st.hist.reduce((a, c, i) => a + (b0 + i * bw >= 46 ? c : 0), 0) / st.hist.reduce((a, c) => a + c, 0) * 100;
    $("#sq-text").innerHTML = `At 100 m this square is <b>${st.cells100 > 1 ? `${st.cells100} cells, ${r(st.r100)}` : `one number, ${r(st.r100)}`}</b>. At 1 m it is <b>${(st.p95 - st.p5).toFixed(0)} °C wide</b>: `
      + `${hot >= 1 ? `<b>${hot.toFixed(0)}%</b> of it is in extreme heat stress (≥ 46 °C), ` : ""}the shade of a tree or a façade a few steps away is ${(st.p95 - st.p5).toFixed(0)} °C cooler. `
      + `<b>${st.off2}%</b> of the square is more than 2 °C away from its own average.`
      + (st.r100 ? (() => { const tot = st.hist.reduce((x, c) => x + c, 0), inside = st.hist.reduce((x, c, i) => { const v = b0 + i * bw + bw / 2; return x + (v >= st.r100[0] - 0.25 && v <= st.r100[1] + 0.25 ? c : 0); }, 0) / tot * 100;
          return inside < 35 ? ` And the 100 m value? Only <b>${inside.toFixed(0)}%</b> of the square actually feels it: it is the average of sun and shade, a temperature almost nobody stands in.` : ""; })() : "");
    // the list: squares where the 1 m spread is widest compared with what 100 m shows
    const L = squares.map(q => { const t = q.h[hh]; return { q, hid: (t.p95 - t.p5) - (t.r100 ? t.r100[1] - t.r100[0] : 0), t }; }).sort((a, b) => b.hid - a.hid).slice(0, 8);
    const top = L[0].hid;
    $("#list").innerHTML = L.map(({ q, hid, t }) => `<li data-id="${q.id}" class="${q.id === S.sq ? "on" : ""}"><span>${q.name}</span><span class="rg">+${hid.toFixed(1)} °C</span>
      <span class="bar" style="background:linear-gradient(90deg,${css(t.p5)},${css(t.p95)});width:${(hid / top * 100).toFixed(0)}%"></span></li>`).join("");
    document.querySelectorAll("#list li").forEach(li => li.onclick = () => { S.sq = +li.dataset.id; const f = plazas.features.find(f => f.properties.id === S.sq);
      const cs = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates.flat(1)[0] ? f.geometry.coordinates.flat(2) : [];
      const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]); map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: wide ? { left: 420, right: 400, top: 80, bottom: 80 } : 40, maxZoom: 18.2, duration: 1200 });
      map.setPaintProperty("sq-line", "line-width", ["case", ["==", ["get", "id"], S.sq], 2.6, 1]); side(); });
  }

  // ── controls ──
  document.querySelectorAll(".res button").forEach(b => b.onclick = () => { S.s = +b.dataset.s; draw(); });
  $("#hour").max = meta.hours.length - 1; $("#hour").value = S.hour;
  $("#hour").oninput = e => { S.hour = +e.target.value; draw(); };
  $("#play").onclick = async () => { if (S.playing) return; S.playing = true; for (const s of STEPS) { S.s = s; await draw(); await new Promise(r => setTimeout(r, 750)); } S.playing = false; };
  $("#about").onclick = () => $("#drawer").hidden = false; $("#dclose").onclick = () => $("#drawer").hidden = true;
  $("#drawer").onclick = e => { if (e.target.id === "drawer") $("#drawer").hidden = true; };
  $("#find").innerHTML = `At 16:00 on the hottest day, the 100 m map gives <b>${meta.nobody100} of ${squares.length} squares</b> a temperature that less than 1% of their ground actually has. `
    + `It is the average of sun (about <b>${Math.round(meta.sun_shade[1])} °C</b>) and shade (about <b>${Math.round(meta.sun_shade[0])} °C</b>), a value almost nobody stands in.`;
  window.S = S; window.draw = draw;
})();
