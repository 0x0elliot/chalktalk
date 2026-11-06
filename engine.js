(function (global) {
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = {
    ink: "var(--sketch-ink, currentColor)",
    red: "#E24B4A",
    green: "#1D9E75",
    blue: "#378ADD",
    amber: "#EF9F27",
    purple: "#7F77DD",
    gray: "#888780",
  };
  const HAND = "'Patrick Hand', 'Comic Sans MS', cursive";
  const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const LINE_H = 20;
  const CHAR_W = 7.8;
  const GUTTER = 48;

  const BRANDS = {
    meta: { slug: "meta", color: "#0467DF", name: "Meta" },
    facebook: { slug: "facebook", color: "#0866FF", name: "Facebook" },
    instagram: { slug: "instagram", color: "#E4405F", name: "Instagram" },
    google: { slug: "google", color: "#4285F4", name: "Google" },
    ga4: { slug: "googleanalytics", color: "#E37400", name: "Google Analytics" },
    googleanalytics: { slug: "googleanalytics", color: "#E37400", name: "Google Analytics" },
    googleads: { slug: "googleads", color: "#4285F4", name: "Google Ads" },
    tiktok: { slug: "tiktok", color: "#111111", name: "TikTok" },
    snapchat: { slug: "snapchat", color: "#E6C200", name: "Snapchat" },
    pinterest: { slug: "pinterest", color: "#BD081C", name: "Pinterest" },
    reddit: { slug: "reddit", color: "#FF4500", name: "Reddit" },
    x: { slug: "x", color: "#111111", name: "X" },
    shopify: { slug: "shopify", color: "#5E8E3E", name: "Shopify" },
    woocommerce: { slug: "woocommerce", color: "#96588A", name: "WooCommerce" },
    gmail: { slug: "gmail", color: "#EA4335", name: "Gmail" },
    slack: { slug: "slack", color: "#4A154B", name: "Slack" },
    zapier: { slug: "zapier", color: "#FF4F00", name: "Zapier" },
    hubspot: { slug: "hubspot", color: "#FF7A59", name: "HubSpot" },
    stripe: { slug: "stripe", color: "#635BFF", name: "Stripe" },
    linear: { slug: "linear", color: "#5E6AD2", name: "Linear" },
    github: { slug: "github", color: "#181717", name: "GitHub" },
    gtm: { slug: "googletagmanager", color: "#246FDB", name: "Google Tag Manager" },
    googletagmanager: { slug: "googletagmanager", color: "#246FDB", name: "Google Tag Manager" },
    youtube: { slug: "youtube", color: "#FF0000", name: "YouTube" },
    whatsapp: { slug: "whatsapp", color: "#25D366", name: "WhatsApp" },
    zappush: {
      slug: null,
      color: "#F4A261",
      name: "Zappush",
      src:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#F4A261"/><text x="100" y="112" text-anchor="middle" dominant-baseline="central" font-family="Arial Narrow, Arial, Helvetica, sans-serif" font-weight="bold" font-size="42" fill="white" letter-spacing="1" font-stretch="condensed">ZAPPUSH</text></svg>',
        ),
    },
  };
  const brandOf = (key) => (key ? BRANDS[String(key).toLowerCase().replace(/[\s_-]/g, "")] : null);
  const paint = (c) => PALETTE[c] || (brandOf(c) && brandOf(c).color) || c || PALETTE.ink;
  const tint = (color, amount) => {
    const m = /^#([0-9a-f]{6})$/i.exec(color || "");
    if (!m) return "var(--sketch-card, #ffffff)";
    const n = parseInt(m[1], 16);
    const mix = (c) => Math.round(c * amount + 255 * (1 - amount));
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  };
  const REAL = {
    ink: "#33363d", red: "#b8473d", green: "#5b8f5a", blue: "#3f6fa8", amber: "#d39b3a", purple: "#7a5ea8",
    gray: "#8c8c8c", grey: "#8c8c8c", white: "#f2f2ef", black: "#232323", steel: "#8a9199", brick: "#a4553f",
    wood: "#a87b4f", concrete: "#a7a49e", water: "#3f7fb5", foliage: "#5f8d4e", grass: "#6a9a4f", gold: "#c9a24a",
    copper: "#b87333", paper: "#f3efe6", glass: "#dfe9ef", plastic: "#e8e6e1", rubber: "#2b2b2b",
  };

  function part3d(T, p) {
    const s = p.size || [];
    const num = (v, d) => (typeof v === "number" && isFinite(v) && v > 0 ? v : d);
    let geo;
    switch (p.shape || "box") {
      case "sphere":
        geo = new T.SphereGeometry(num(p.r, 0.5), 48, 32);
        break;
      case "cylinder":
        geo = new T.CylinderGeometry(num(p.r, 0.5), num(p.r, 0.5), num(p.h, 1), 48);
        break;
      case "cone":
        geo = new T.ConeGeometry(num(p.r, 0.5), num(p.h, 1), 48);
        break;
      case "torus":
        geo = new T.TorusGeometry(num(p.r, 0.5), num(p.tube, 0.15), 24, 64);
        break;
      case "capsule":
        geo = new T.CapsuleGeometry(num(p.r, 0.3), num(p.h, 1), 8, 24);
        break;
      default: {
        const [w, h, d] = [num(s[0], 1), num(s[1], 1), num(s[2], 1)];
        const r = Math.min(w, h, d) * 0.12;
        geo = T.RoundedBoxGeometry ? new T.RoundedBoxGeometry(w, h, d, 4, r) : new T.BoxGeometry(w, h, d);
      }
    }
    const brand = brandOf(p.brand);
    const color = REAL[p.color] || (brand && brand.color) || (brandOf(p.color) && brandOf(p.color).color) || p.color || "#d9d4ca";
    const kind = p.material || (p.color === "glass" ? "glass" : p.color === "steel" || p.color === "gold" || p.color === "copper" ? "metal" : "matte");
    const mat =
      kind === "glass"
        ? new T.MeshPhysicalMaterial({ color, transmission: 1, roughness: 0.06, thickness: 0.4, ior: 1.45, transparent: true })
        : kind === "metal"
          ? new T.MeshStandardMaterial({ color, metalness: 1, roughness: 0.32 })
          : kind === "gloss"
            ? new T.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 })
            : new T.MeshPhysicalMaterial({ color, roughness: 0.62, clearcoat: 0.12 });
    const mesh = new T.Mesh(geo, mat);
    const at = Array.isArray(p.at) ? p.at : [0, 0, 0];
    mesh.position.set(+at[0] || 0, +at[1] || 0, +at[2] || 0);
    const turn = Array.isArray(p.turn) ? p.turn : [0, 0, 0];
    mesh.rotation.set(((+turn[0] || 0) * Math.PI) / 180, ((+turn[1] || 0) * Math.PI) / 180, ((+turn[2] || 0) * Math.PI) / 180);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  async function figure3d(host, it, url) {
    const note = (text) => {
      host.textContent = text;
      host.style.cssText += ";display:flex;align-items:center;justify-content:center;font:16px system-ui,sans-serif;color:#7E838D";
    };
    if (!url) return note("3D figures need the Chalktalk helper running.");
    let T;
    try {
      T = await import(url);
    } catch {
      return note("The 3D library didn't load.");
    }
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab";
    host.append(canvas);
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      canvas.remove();
      return note("This screen can't draw 3D (WebGL is off).");
    }
    renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    renderer.toneMapping = T.AgXToneMapping ?? T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
    const group = new T.Group();
    scene.add(group);
    const tags = [];
    (it.parts || []).slice(0, 60).forEach((p) => {
      const mesh = part3d(T, p);
      group.add(mesh);
      if (p.label) {
        const tag = document.createElement("div");
        tag.textContent = p.label;
        tag.style.cssText =
          "position:absolute;transform:translate(-50%,-100%);padding:2px 10px;border-radius:999px;background:rgba(251,250,246,.92);color:#30333A;font:16px 'Patrick Hand',system-ui,sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.12)";
        host.append(tag);
        tags.push({ mesh, tag });
      }
    });
    const bounds = new T.Box3().setFromObject(group);
    const size = bounds.getSize(new T.Vector3());
    const center = bounds.getCenter(new T.Vector3());
    group.position.set(-center.x, -bounds.min.y, -center.z);
    const radius = Math.max(0.5, size.length() / 2);
    const ground = new T.Mesh(new T.PlaneGeometry(radius * 10, radius * 10), new T.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    scene.add(new T.HemisphereLight(0xffffff, 0x8a8a8a, 0.5));
    const sun = new T.DirectionalLight(0xffffff, 2.2);
    sun.position.set(radius * 2, radius * 3.2, radius * 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -radius * 2, right: radius * 2, top: radius * 2, bottom: -radius * 2, near: 0.1, far: radius * 10 });
    scene.add(sun);
    const camera = new T.PerspectiveCamera(35, 1, 0.01, radius * 40);
    const eye = Array.isArray(it.camera) ? it.camera : [radius * 2.1, radius * 1.4, radius * 2.6];
    camera.position.set(+eye[0], +eye[1], +eye[2]);
    const controls = new T.OrbitControls(camera, canvas);
    controls.target.set(0, size.y / 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = radius * 1.1;
    controls.maxDistance = radius * 7;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotate = it.spin !== false;
    controls.autoRotateSpeed = 1.4;
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
      canvas.style.cursor = "grabbing";
    });
    controls.addEventListener("end", () => (canvas.style.cursor = "grab"));
    const fit = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    if (global.ResizeObserver) new ResizeObserver(fit).observe(host);
    const v = new T.Vector3();
    renderer.setAnimationLoop(() => {
      if (!host.isConnected) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        return;
      }
      controls.update();
      renderer.render(scene, camera);
      tags.forEach(({ mesh, tag }) => {
        const box = new T.Box3().setFromObject(mesh);
        v.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(camera);
        tag.style.left = `${((v.x + 1) / 2) * host.clientWidth}px`;
        tag.style.top = `${((1 - v.y) / 2) * host.clientHeight - 6}px`;
      });
    });
  }

  function logo(parent, brand, x, y, size) {
    const b = brandOf(brand);
    const color = b ? b.color : PALETTE.gray;
    const dot = () => make("circle", { cx: x + size / 2, cy: y + size / 2, r: size / 2.4, fill: color }, parent);
    if (!b || (!b.slug && !b.src)) return dot();
    const href = b.src || `https://cdn.simpleicons.org/${b.slug}/${color.slice(1)}`;
    const img = make("image", { href, x, y, width: size, height: size }, parent);
    img.addEventListener("error", () => {
      img.remove();
      dot();
    });
    return img;
  }

  const GOOD_VOICES = ["Ava", "Zoe", "Evan", "Nathan", "Samantha", "Karen", "Daniel", "Moira", "Tessa", "Rishi", "Google UK English Female", "Google US English"];
  const NOVELTY = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Fred|Good News|Jester|Junior|Kathy|Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley/;

  function pickVoice(name) {
    const all = (global.speechSynthesis ? global.speechSynthesis.getVoices() : []).filter((v) => /^en/i.test(v.lang));
    if (name) {
      const exact = all.find((v) => v.name.includes(name));
      if (exact) return exact;
    }
    const score = (v) => {
      if (NOVELTY.test(v.name)) return -1;
      let s = 0;
      if (/Premium/i.test(v.name)) s += 40;
      else if (/Enhanced|Neural|Natural/i.test(v.name)) s += 30;
      const rank = GOOD_VOICES.findIndex((g) => v.name.startsWith(g));
      if (rank >= 0) s += 20 - rank;
      if (v.localService) s += 1;
      return s;
    };
    return all.sort((a, b) => score(b) - score(a))[0] || null;
  }

  function make(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function seeded(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647 - 0.5;
    };
  }

  function wobble(rand, pts, amp) {
    const j = () => rand() * amp;
    let d = `M${pts[0][0] + j()} ${pts[0][1] + j()}`;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      d += ` Q${(ax + bx) / 2 + j() * 2} ${(ay + by) / 2 + j() * 2} ${bx + j()} ${by + j()}`;
    }
    return d;
  }

  function oval(cx, cy, rx, ry) {
    const pts = [];
    for (let i = 0; i <= 22; i++) {
      const a = -0.4 + (i / 22) * Math.PI * 2.15;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }

  function arrow(rand, it) {
    const [x0, y0] = it.from;
    const [x1, y1] = it.to;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const bend = it.bend || 0;
    const cx = (x0 + x1) / 2 - ((y1 - y0) / len) * bend;
    const cy = (y0 + y1) / 2 + ((x1 - x0) / len) * bend;
    const shaft = `M${x0} ${y0} Q${cx + rand() * 3} ${cy + rand() * 3} ${x1} ${y1}`;
    const ang = Math.atan2(y1 - cy, x1 - cx);
    const wing = (s) => [x1 - 13 * Math.cos(ang + s * 0.45), y1 - 13 * Math.sin(ang + s * 0.45)];
    const [ax, ay] = wing(1);
    const [bx, by] = wing(-1);
    return [shaft, `M${ax} ${ay} L${x1} ${y1} L${bx} ${by}`];
  }

  function write(parent, opts, x, y) {
    const lines = String(opts.text).split("\n");
    const t = make(
      "text",
      {
        x,
        y,
        fill: paint(opts.color),
        "font-family": opts.mono ? MONO : HAND,
        "font-size": opts.size || 20,
        "text-anchor": opts.anchor || "middle",
        "dominant-baseline": "central",
      },
      parent,
    );
    t.style.whiteSpace = "pre";
    if (opts.halo) {
      t.setAttribute("stroke", "var(--sketch-paper, #fbfaf6)");
      t.setAttribute("stroke-width", "5");
      t.setAttribute("stroke-linejoin", "round");
      t.setAttribute("paint-order", "stroke");
    }
    lines.forEach((line, i) => {
      const span = make("tspan", { x, dy: i ? "1.15em" : `${-(lines.length - 1) * 0.575}em` }, t);
      span.textContent = line;
    });
    if (opts.maxWidth) {
      let size = opts.size || 20;
      try {
        while (size > 11 && t.getComputedTextLength() > opts.maxWidth) {
          size -= 1;
          t.setAttribute("font-size", size);
        }
      } catch {}
    }
    return t;
  }

  function build(svg, it, rand, codes, open) {
    const g = make("g", {}, svg);
    const out = [];
    if (it.brand && !it.color) it.color = brandOf(it.brand) ? brandOf(it.brand).color : undefined;
    const ink = paint(it.color);
    const pen = (d) => {
      const defs = svg.querySelector("defs");
      const id = `sk-pen-${Math.random().toString(36).slice(2, 9)}`;
      const mask = make("mask", { id, maskUnits: "userSpaceOnUse" }, defs);
      const guide = make("path", { d, fill: "none", stroke: "#fff", "stroke-linecap": "round", "stroke-linejoin": "round" }, mask);
      let L = 0;
      try {
        L = guide.getTotalLength();
      } catch {}
      if (!(L > 1)) {
        mask.remove();
        return false;
      }
      const half = (it.weight || 2.4) * 0.66;
      const n = Math.max(6, Math.min(140, Math.round(L / 4)));
      const left = [];
      const right = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = guide.getPointAtLength(Math.max(0, t * L - 0.6));
        const b = guide.getPointAtLength(Math.min(L, t * L + 0.6));
        const p = guide.getPointAtLength(t * L);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const w = half * (0.42 + 0.58 * Math.pow(Math.sin(Math.PI * t), 0.55)) * (1 + rand() * 0.12);
        left.push(`${(p.x + nx * w).toFixed(1)} ${(p.y + ny * w).toFixed(1)}`);
        right.push(`${(p.x - nx * w).toFixed(1)} ${(p.y - ny * w).toFixed(1)}`);
      }
      guide.setAttribute("stroke-width", half * 3 + 4);
      make("path", { d: `M${left.join(" L")} L${right.reverse().join(" L")} Z`, fill: ink, mask: `url(#${id})` }, g);
      out.push({ node: guide, kind: "stroke", at: it.at });
      return true;
    };
    const stroke = (d, dashed) => {
      if (!dashed && svg.dataset.pen !== "even" && pen(d)) return;
      const p = make(
        "path",
        {
          d,
          fill: "none",
          stroke: ink,
          "stroke-width": it.weight || 2.4,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-dasharray": dashed ? "6 7" : null,
        },
        g,
      );
      out.push({ node: p, kind: dashed ? "fade" : "stroke", at: it.at });
    };
    const fade = (node) => out.push({ node, kind: "fade", at: it.at });
    const solid = (item) => (item.look || svg.dataset.look) !== "sketch";
    const cardStyle = (node) => {
      node.setAttribute("filter", `url(#${svg.dataset.shadow})`);
      out.push({ node, kind: "fade", at: it.at, rise: true });
    };
    const card = (x, y, w, h, r) =>
      cardStyle(make("rect", { x, y, width: w, height: h, rx: r, fill: it.color ? tint(ink, 0.08) : "var(--sketch-card, #ffffff)", stroke: ink, "stroke-width": 1.5 }, g));
    const dot = (cx, cy, r) =>
      cardStyle(make("circle", { cx, cy, r, fill: "var(--sketch-card, #ffffff)", stroke: ink, "stroke-width": 1.5 }, g));
    const label = (text, x, y, opts) => fade(write(g, { color: it.color, ...opts, text }, x, y));

    switch (it.type) {
      case "box": {
        const { x, y, w, h } = it;
        if (it.open) make("rect", { x, y, width: w, height: h, fill: "transparent" }, g);
        if (solid(it)) card(x, y, w, h, 10);
        else stroke(wobble(rand, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + 3, y - 2]], 1.4));
        const shift = it.brand ? 16 : 0;
        if (it.brand) fade(logo(g, it.brand, x + 10, y + h / 2 - 13, 26));
        const room = w - 20 - shift * 2;
        if (it.label) label(it.label, x + w / 2 + shift, y + h / 2 - (it.sub ? 11 : 0), { size: it.size || 22, maxWidth: room });
        if (it.sub) label(it.sub, x + w / 2 + shift, y + h / 2 + 15, { size: 16, color: it.subColor || "gray", maxWidth: room });
        break;
      }
      case "logo": {
        const size = it.size || 32;
        fade(logo(g, it.brand, it.x, it.y, size));
        if (it.label) label(it.label, it.x + size / 2, it.y + size + 16, { size: 16 });
        break;
      }
      case "bubble": {
        const { x, y, w, h } = it;
        const r = 14;
        if (it.to) {
          const [tx, ty] = it.to;
          const sx = x + w / 2;
          const sy = y + h;
          [0.35, 0.7].forEach((f, k) => {
            const cx = sx + (tx - sx) * f;
            const cy = sy + (ty - sy) * f;
            if (solid(it)) dot(cx, cy, 6 - k * 2);
            else stroke(wobble(rand, oval(cx, cy, 6 - k * 2, 6 - k * 2), 0.5));
          });
        }
        if (solid(it)) card(x, y, w, h, 18);
        else
          stroke(
            wobble(
              rand,
              [
                [x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h],
                [x + r, y + h], [x, y + h - r], [x, y + r], [x + r + 2, y - 1],
              ],
              1.1,
            ),
          );
        if (it.who) label(it.who, x + 8, y - 14, { size: 16, anchor: "start", color: it.whoColor || it.color || "gray" });
        if (it.text) label(it.text, x + w / 2, y + h / 2, { size: it.size || 18 });
        break;
      }
      case "circle": {
        const rx = it.rx || it.r;
        const ry = it.ry || it.r;
        stroke(wobble(rand, oval(it.cx, it.cy, rx, ry), 1.2));
        if (it.label) label(it.label, it.cx, it.cy + ry + 22, { size: 18, halo: true });
        break;
      }
      case "arrow": {
        const [shaft, head] = arrow(rand, it);
        stroke(shaft);
        stroke(head);
        if (it.label) {
          const midX = (it.from[0] + it.to[0]) / 2;
          const midY = (it.from[1] + it.to[1]) / 2;
          const upright = Math.abs(it.to[1] - it.from[1]) > Math.abs(it.to[0] - it.from[0]);
          const tw = String(it.label).length * 8.5;
          const spots = upright
            ? [[midX + 12, midY, "start"], [midX - 12, midY, "end"]]
            : [[midX, midY - 18], [midX, midY + 20]];
          const clear = ([x, y, anchor]) => {
            const x0 = anchor === "start" ? x : anchor === "end" ? x - tw : x - tw / 2;
            return !(svg.__boxes || []).some((r) => x0 < r.x + r.w && r.x < x0 + tw && y - 11 < r.y + r.h && r.y < y + 11);
          };
          const [lx, ly, anchor] = it.labelAt ? [...it.labelAt] : spots.find(clear) || spots[0];
          label(it.label, lx, ly, { size: 18, halo: true, anchor });
        }
        break;
      }
      case "line":
        stroke(wobble(rand, it.points, 1.2), it.dashed);
        break;
      case "text":
        label(it.text, it.x, it.y, { size: it.size, anchor: it.anchor, mono: it.mono, halo: true });
        break;
      case "person": {
        const { x, y } = it;
        stroke(wobble(rand, oval(x, y, 13, 13), 0.8));
        stroke(wobble(rand, [[x, y + 13], [x, y + 60]], 1));
        stroke(wobble(rand, [[x - 26, y + 32], [x + 26, y + 32]], 1));
        stroke(wobble(rand, [[x - 20, y + 98], [x, y + 60], [x + 20, y + 98]], 1));
        if (it.label) label(it.label, x, y + 120, { size: 20 });
        break;
      }
      case "code": {
        const lines = it.lines || [];
        const start = it.start || 1;
        const w = it.w || GUTTER + 16 + Math.max(10, ...lines.map((l) => l.length)) * CHAR_W;
        const h = lines.length * LINE_H + 16;
        codes[it.id || "code"] = { x: it.x, y: it.y, start, lines };
        fade(make("rect", { x: it.x, y: it.y, width: w, height: h, rx: 8, fill: "var(--sketch-code-bg, rgba(127,127,127,0.08))", stroke: "rgba(127,127,127,0.35)" }, g));
        if (it.file) label(`${it.file}:${start}`, it.x, it.y - 12, { size: 13, anchor: "start", mono: true, color: "gray" });
        lines.forEach((line, i) => {
          const ly = it.y + 8 + i * LINE_H + LINE_H / 2;
          fade(write(g, { text: String(start + i), size: 12, anchor: "end", mono: true, color: "gray" }, it.x + GUTTER - 10, ly));
          fade(write(g, { text: line, size: 13, anchor: "start", mono: true }, it.x + GUTTER, ly));
        });
        break;
      }
      case "ring":
      case "underline": {
        const c = codes[it.code || "code"];
        const row = it.line - c.start;
        const text = c.lines[row] || "";
        const cy = c.y + 8 + row * LINE_H + LINE_H / 2;
        const [a, b] = it.cols || [text.length - text.trimStart().length, text.length];
        const x0 = c.x + GUTTER + a * CHAR_W;
        const x1 = c.x + GUTTER + b * CHAR_W;
        if (it.type === "ring") stroke(wobble(rand, oval((x0 + x1) / 2, cy, (x1 - x0) / 2 + 10, 14), 1));
        else stroke(wobble(rand, [[x0, cy + 11], [x1, cy + 11]], 1));
        if (it.note) {
          const at = it.noteAt || [x1 + 24, cy];
          label(it.note, at[0], at[1], { size: 18, anchor: "start" });
        }
        break;
      }
      case "figure": {
        const { x, y, w, h } = it;
        const fo = make("foreignObject", { x, y, width: w, height: h }, g);
        const host = document.createElement("div");
        host.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden";
        fo.append(host);
        fade(fo);
        figure3d(host, it, svg.dataset.three);
        if (it.label) label(it.label, x + w / 2, y + h + 16, { size: 18, halo: true });
        break;
      }
      case "image":
        fade(make("image", { href: it.href, x: it.x || 0, y: it.y || 0, width: it.w, height: it.h, preserveAspectRatio: "xMidYMid meet" }, g));
        break;
    }
    if (it.open) {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => open(it.open));
    }
    return out;
  }

  let audio = null;
  let noise = null;
  const soundOn = () => {
    try {
      return global.localStorage.getItem("chalktalkSound") !== "off";
    } catch {
      return true;
    }
  };
  function mixer() {
    if (!soundOn()) return null;
    if (!audio) {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      audio = new Ctx();
      const length = audio.sampleRate * 2;
      noise = audio.createBuffer(1, length, audio.sampleRate);
      const data = noise.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = white * 0.5 + brown * 3;
      }
    }
    if (audio.state === "suspended") audio.resume().catch(() => {});
    return audio;
  }
  const sound = {
    scratch(delay, duration, kind = "pen") {
      const c = mixer();
      if (!c || !(duration > 0.05)) return;
      const t0 = c.currentTime + Math.max(0, delay);
      const t1 = t0 + duration;
      const src = c.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const low = c.createBiquadFilter();
      low.type = "highpass";
      low.frequency.value = kind === "marker" ? 700 : 1100;
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = (kind === "marker" ? 1900 : 3400) + Math.random() * 600;
      band.Q.value = 0.8;
      const level = kind === "marker" ? 0.07 : 0.045;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(level, t0 + 0.04);
      gain.gain.setValueAtTime(level, Math.max(t0 + 0.05, t1 - 0.06));
      gain.gain.linearRampToValueAtTime(0, t1);
      const wobble = c.createOscillator();
      wobble.frequency.value = 7 + Math.random() * 6;
      const depth = c.createGain();
      depth.gain.value = level * 0.45;
      wobble.connect(depth).connect(gain.gain);
      src.connect(low).connect(band).connect(gain).connect(c.destination);
      src.start(t0, Math.random() * 1.5);
      src.stop(t1 + 0.05);
      wobble.start(t0);
      wobble.stop(t1 + 0.05);
      sound.flick(t1 - c.currentTime);
    },
    flick(delay) {
      const c = mixer();
      if (!c) return;
      const t0 = c.currentTime + Math.max(0, delay);
      const src = c.createBufferSource();
      src.buffer = noise;
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 4200;
      band.Q.value = 1.4;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.05, t0);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.07);
      src.connect(band).connect(gain).connect(c.destination);
      src.start(t0, Math.random());
      src.stop(t0 + 0.08);
    },
    wipe(delay) {
      const c = mixer();
      if (!c) return;
      const t0 = c.currentTime + Math.max(0, delay);
      const src = c.createBufferSource();
      src.buffer = noise;
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 0.7;
      band.frequency.setValueAtTime(900, t0);
      band.frequency.exponentialRampToValueAtTime(2600, t0 + 0.32);
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.07, t0 + 0.08);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.36);
      src.connect(band).connect(gain).connect(c.destination);
      src.start(t0, Math.random());
      src.stop(t0 + 0.4);
    },
    thump(delay) {
      const c = mixer();
      if (!c) return;
      const t0 = c.currentTime + Math.max(0, delay);
      const src = c.createBufferSource();
      src.buffer = noise;
      const lowpass = c.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 520;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      src.connect(lowpass).connect(gain).connect(c.destination);
      src.start(t0, Math.random());
      src.stop(t0 + 0.14);
    },
  };

  function layout(scene, W, H) {
    const items = (scene.steps || []).flatMap((s) => s.items || []);
    const ends = items.flatMap((it) =>
      it.type === "arrow" ? [it.from, it.to] : it.type === "line" ? it.points || [] : it.type === "bubble" && it.to ? [it.to] : [],
    );
    const near = (r, pad) => ends.some((p) => Array.isArray(p) && p[0] > r.x - pad && p[0] < r.x + r.w + pad && p[1] > r.y - pad && p[1] < r.y + r.h + pad);
    const gap = 10;
    let placed = [];
    const all = [];
    const hit = (r) => placed.find((p) => r.x < p.x + p.w + gap && p.x < r.x + r.w + gap && r.y < p.y + p.h + gap && p.y < r.y + r.h + gap);
    (scene.steps || []).forEach((step) => {
      if (step.clear) placed = [];
      (step.items || []).forEach((it) => place(it));
    });
    return all;
    function place(it) {
      if (!["box", "bubble", "figure"].includes(it.type) || ![it.x, it.y, it.w, it.h].every(Number.isFinite)) return;
      const r = { x: it.x, y: it.y, w: it.w, h: it.h };
      if (!near(r, 24)) {
        for (let tries = 0, other = hit(r); other && tries < 6; tries++, other = hit(r)) {
          if (other.y + other.h + gap + r.h <= H) r.y = other.y + other.h + gap;
          else if (other.x + other.w + gap + r.w <= W) r.x = other.x + other.w + gap;
          else break;
        }
        it.x = r.x;
        it.y = r.y;
      }
      placed.push(r);
      all.push(r);
    }
  }

  function mount(container, scene) {
    const W = scene.width || 680;
    const H = scene.height || 400;
    const rand = seeded(scene.seed || 11);
    const codes = {};
    const editorUrl = (target) => {
      const m = /^(.*?)(?::(\d+))?$/.exec(target);
      const file = m[1].startsWith("/") ? m[1] : `${scene.root || ""}/${m[1]}`;
      return `${scene.editor || "vscode"}://file${file}${m[2] ? `:${m[2]}` : ""}`;
    };
    const open = (target) => (scene.onOpen ? scene.onOpen(target) : (location.href = editorUrl(target)));

    container.innerHTML = "";
    const svg = make("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": scene.title || "Chalktalk" }, container);
    const shadowId = `sk-shadow-${Math.random().toString(36).slice(2, 8)}`;
    const defs = make("defs", {}, svg);
    const filter = make("filter", { id: shadowId, x: "-20%", y: "-20%", width: "140%", height: "160%" }, defs);
    make("feDropShadow", { dx: 0, dy: 4, stdDeviation: 6, "flood-color": "#1b1b18", "flood-opacity": 0.12 }, filter);
    svg.dataset.shadow = shadowId;
    svg.dataset.look = scene.look || "solid";
    svg.dataset.pen = scene.pen || "felt";
    if (scene.three || global.CHALKTALK_THREE) svg.dataset.three = scene.three || global.CHALKTALK_THREE;
    svg.style.display = "block";
    if (scene.background) make("image", { href: scene.background, x: 0, y: 0, width: W, height: H, preserveAspectRatio: "xMidYMid meet" }, svg);
    svg.__boxes = layout(scene, W, H);
    const steps = (scene.steps || []).map((step) => (step.items || []).flatMap((it) => build(svg, it, rand, codes, open)));

    const bar = document.createElement("div");
    bar.className = "sketch-bar";
    bar.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px";
    const caption = document.createElement("span");
    caption.className = "sketch-caption";
    caption.style.cssText = "flex:1;min-height:1.5em";
    bar.append(caption);
    const button = (text, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.addEventListener("click", fn);
      bar.append(b);
      return b;
    };
    container.append(bar);
    const say = document.createElement("p");
    say.className = "sketch-say";
    say.style.cssText = "margin:8px 0 0;opacity:.8;line-height:1.6";
    container.append(say);

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const voice = global.speechSynthesis;
    const clips = scene.audio || [];
    let clip = null;
    let current = 0;
    let timer = null;
    let auto = scene.autoplay !== false;
    let speaking = Boolean(scene.voice && (voice || clips.length));
    let run = 0;

    const hide = (i) =>
      steps[i].forEach(({ node, kind, rise }) => {
        node.style.transition = "none";
        if (rise) node.style.transform = "translateY(6px)";
        if (kind === "fade") node.style.opacity = 0;
        else {
          const L = node.getTotalLength();
          node.style.strokeDasharray = L;
          node.style.strokeDashoffset = L;
        }
      });

    const reveal = (i, animate, stretch = 1) => {
      let t = 0;
      steps[i].forEach(({ node, kind, at, rise }) => {
        if (animate && typeof at === "number") t = Math.max(t, at);
        if (kind === "fade") {
          node.style.transition = animate ? `opacity .45s ease ${t}s, transform .55s cubic-bezier(.22,1,.36,1) ${t}s` : "none";
          node.style.opacity = 1;
          if (rise) node.style.transform = "none";
          if (animate && rise && scene.sound !== false) sound.thump(t);
          if (animate) t += 0.04 * stretch;
        } else {
          const d = Math.min(0.9, Math.max(0.2, node.getTotalLength() / 700));
          node.style.transition = animate ? `stroke-dashoffset ${d}s ease-in-out ${t}s` : "none";
          node.style.strokeDashoffset = 0;
          if (animate && scene.sound !== false) sound.scratch(t, d);
          if (animate) t += d * 0.85 * stretch;
        }
      });
      return t;
    };

    function go(i, stretch = 1) {
      clearTimeout(timer);
      if (voice) voice.cancel();
      if (clip) clip.pause();
      if (!steps.length) return;
      const mine = ++run;
      const before = current;
      current = Math.max(0, Math.min(steps.length - 1, i));
      let start = 0;
      for (let k = current; k > 0; k--) {
        if (scene.steps[k].clear) {
          start = k;
          break;
        }
      }
      steps.forEach((_, k) => hide(k));
      svg.getBoundingClientRect();
      for (let k = start; k < current; k++) reveal(k, false);
      const step = scene.steps[current];
      if (step.clear && current === before + 1 && !still) {
        if (scene.sound !== false) sound.wipe(0);
        svg.style.transition = "none";
        svg.style.opacity = "0";
        svg.getBoundingClientRect();
        svg.style.transition = "opacity .35s ease";
        svg.style.opacity = "1";
      }
      caption.textContent = step.caption || "";
      say.textContent = step.say || "";
      const took = reveal(current, !still, stretch);
      const pause = (scene.pause ?? 0.4) * 1000;
      let drawn = false;
      let spoken = !speaking;
      const advance = () => {
        if (mine === run && drawn && spoken && auto && current < steps.length - 1) timer = setTimeout(() => go(current + 1), pause);
      };
      setTimeout(() => {
        drawn = true;
        advance();
      }, took * 1000);
      const finish = () => {
        spoken = true;
        advance();
      };
      if (speaking && clips[current]) {
        clip = new Audio(clips[current]);
        clip.onended = finish;
        clip.onerror = finish;
        clip.play().catch(finish);
      } else if (speaking && voice) {
        const u = new SpeechSynthesisUtterance(step.say || step.caption || "");
        u.rate = scene.rate || 0.9;
        const chosen = pickVoice(scene.voiceName);
        if (chosen) u.voice = chosen;
        u.onend = () => {
          spoken = true;
          advance();
        };
        u.onerror = u.onend;
        voice.speak(u);
      } else spoken = true;
      return took;
    }

    button("Back", () => {
      auto = false;
      go(current - 1);
    });
    button("Next", () => {
      auto = false;
      go(current + 1);
    });
    button("Replay", () => {
      auto = scene.autoplay !== false;
      go(0);
    });
    if (voice || clips.length) {
      const read = button(speaking ? "Stop reading" : "Read aloud", () => {
        speaking = !speaking;
        read.textContent = speaking ? "Stop reading" : "Read aloud";
        auto = true;
        go(current);
      });
    }
    if (scene.fullscreen && container.requestFullscreen) button("Full screen", () => container.requestFullscreen());

    if (scene.onAsk && scene.followups && scene.followups.length) {
      const more = document.createElement("div");
      more.className = "sketch-followups";
      more.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:12px";
      scene.followups.forEach((f) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `${f.label} ↗`;
        b.addEventListener("click", () => scene.onAsk(f.prompt || f.label));
        more.append(b);
      });
      container.append(more);
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        auto = false;
        go(current + 1);
      } else if (e.key === "ArrowLeft") {
        auto = false;
        go(current - 1);
      } else if (e.key === "r") go(0);
    });

    go(0);
    return { go, next: () => go(current + 1), back: () => go(current - 1) };
  }

  global.Chalktalk = { mount, palette: PALETTE, brands: BRANDS, pickVoice, figure: figure3d, sound };
})(window);
