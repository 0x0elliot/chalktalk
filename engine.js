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
  };
  const brandOf = (key) => (key ? BRANDS[String(key).toLowerCase().replace(/[\s_-]/g, "")] : null);
  const paint = (c) => PALETTE[c] || (brandOf(c) && brandOf(c).color) || c || PALETTE.ink;

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
    lines.forEach((line, i) => {
      const span = make("tspan", { x, dy: i ? "1.15em" : `${-(lines.length - 1) * 0.575}em` }, t);
      span.textContent = line;
    });
    return t;
  }

  function build(svg, it, rand, codes, open) {
    const g = make("g", {}, svg);
    const out = [];
    if (it.brand && !it.color) it.color = brandOf(it.brand) ? brandOf(it.brand).color : undefined;
    const ink = paint(it.color);
    const stroke = (d, dashed) => {
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
      cardStyle(make("rect", { x, y, width: w, height: h, rx: r, fill: "var(--sketch-card, #ffffff)", stroke: ink, "stroke-width": 1.5 }, g));
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
        if (it.label) label(it.label, x + w / 2 + shift, y + h / 2 - (it.sub ? 11 : 0), { size: it.size || 22 });
        if (it.sub) label(it.sub, x + w / 2 + shift, y + h / 2 + 15, { size: 16, color: it.subColor || "gray" });
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
        if (it.label) label(it.label, it.cx, it.cy + ry + 22, { size: 18 });
        break;
      }
      case "arrow": {
        const [shaft, head] = arrow(rand, it);
        stroke(shaft);
        stroke(head);
        if (it.label) {
          const at = it.labelAt || [(it.from[0] + it.to[0]) / 2, (it.from[1] + it.to[1]) / 2 - 18];
          label(it.label, at[0], at[1], { size: 18 });
        }
        break;
      }
      case "line":
        stroke(wobble(rand, it.points, 1.2), it.dashed);
        break;
      case "text":
        label(it.text, it.x, it.y, { size: it.size, anchor: it.anchor, mono: it.mono });
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
    svg.style.display = "block";
    if (scene.background) make("image", { href: scene.background, x: 0, y: 0, width: W, height: H, preserveAspectRatio: "xMidYMid meet" }, svg);
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
          if (animate) t += 0.04 * stretch;
        } else {
          const d = Math.min(0.9, Math.max(0.2, node.getTotalLength() / 700));
          node.style.transition = animate ? `stroke-dashoffset ${d}s ease-in-out ${t}s` : "none";
          node.style.strokeDashoffset = 0;
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
      current = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach((_, k) => hide(k));
      svg.getBoundingClientRect();
      for (let k = 0; k < current; k++) reveal(k, false);
      const step = scene.steps[current];
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

  global.Chalktalk = { mount, palette: PALETTE, brands: BRANDS, pickVoice };
})(window);
