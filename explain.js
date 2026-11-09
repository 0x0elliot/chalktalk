(() => {
  const BASE = "http://127.0.0.1:47321";
  const K = `k=${encodeURIComponent(window.__chalktalkKey || "")}`;
  const NS = "http://www.w3.org/2000/svg";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function load(path) {
    const code = await (await fetch(BASE + path)).text();
    (0, eval)(code);
  }

  function oval(x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2 + 12;
    const ry = h / 2 + 10;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = -0.4 + (i / 24) * Math.PI * 2.12;
      const j = 1 + (((i * 7919) % 7) - 3) / 120;
      pts.push(`${(cx + Math.cos(a) * rx * j).toFixed(1)} ${(cy + Math.sin(a) * ry * j).toFixed(1)}`);
    }
    return `M${pts.join(" L")}`;
  }

  function underline(x1, x2, y) {
    const pts = [];
    const steps = Math.max(2, Math.round((x2 - x1) / 28));
    for (let i = 0; i <= steps; i++) {
      const wiggle = (((i * 7919) % 5) - 2) * 0.8;
      pts.push(`${(x1 + ((x2 - x1) * i) / steps).toFixed(1)} ${(y + wiggle).toFixed(1)}`);
    }
    return `M${pts.join(" L")}`;
  }

  function findText(needle) {
    const want = needle.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.data.toLowerCase().indexOf(want);
      if (i < 0 || !node.parentElement || !node.parentElement.getClientRects().length) continue;
      if (node.parentElement.closest("[data-sketch-ui]")) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + needle.length);
      return range;
    }
    return null;
  }

  function resolve(h) {
    if (h.rect) return { kind: "box", rects: [new DOMRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h)], scrollTo: null };
    if (h.text) {
      const range = findText(h.text);
      return range ? { kind: "text", range, rects: [...range.getClientRects()], scrollTo: range.startContainer.parentElement } : null;
    }
    const el = h.selector ? document.querySelector(h.selector) : null;
    return el ? { kind: "box", rects: [el.getBoundingClientRect()], scrollTo: el } : null;
  }

  function button(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "font:inherit;padding:4px 12px;border-radius:999px;border:1px solid #fff5;background:transparent;color:#fff;cursor:pointer;white-space:nowrap";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  window.__sketchExplain = async (lesson) => {
    if (window.__sketchExplainClose) window.__sketchExplainClose();
    if (window.__sketchPoint && window.__sketchPoint.active) window.__sketchPoint.stop();
    await load("/engine.js");
    window.CHALKTALK_THREE = `${BASE}/three.js`;
    const palette = window.Chalktalk.palette;
    const steps = lesson.steps || [];
    const SESSION = lesson.session || window.__sketchSession || "";
    window.__sketchSession = SESSION;
    let TAB = window.__sketchTab;
    if (!TAB) {
      try {
        TAB = sessionStorage.getItem("sketchTab");
      } catch {}
    }
    if (!TAB) TAB = Math.random().toString(36).slice(2, 10);
    window.__sketchTab = TAB;
    try {
      sessionStorage.setItem("sketchTab", TAB);
    } catch {}
    const q = `?tab=${TAB}${SESSION ? `&session=${encodeURIComponent(SESSION)}` : ""}&${K}`;
    let AGENT = "";
    const who = () => AGENT || "Claude";
    let n = steps.length;
    const asset = (href) => (!href || /^(https?:|data:|blob:)/.test(href) ? href : `${BASE}${lesson.assetBase || "/lesson/"}${href}${q}`);
    Object.entries(lesson.brands || {}).forEach(([key, b]) => {
      window.Chalktalk.brands[key.toLowerCase().replace(/[\s_-]/g, "")] = { name: b.name || key, color: b.color || "#2c2c2a", src: asset(b.logo) };
    });
    ["board", "board2"].forEach((key) =>
      steps.forEach((s) => (s[key] || []).forEach((it) => it.type === "image" && (it.href = asset(it.href)))),
    );
    if (window.Chalktalk.prepare) await window.Chalktalk.prepare(steps.flatMap((s) => [...(s.board || []), ...(s.board2 || [])]), BASE);

    if (!document.querySelector("link[data-sketch-font]")) {
      const font = document.createElement("link");
      font.rel = "stylesheet";
      font.href = "https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap";
      font.dataset.sketchFont = "1";
      document.head.append(font);
    }

    const root = document.createElement("div");
    root.dataset.sketchUi = "1";
    root.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;font:15px system-ui,sans-serif";
    const marks = document.createElementNS(NS, "svg");
    marks.setAttribute("width", "100%");
    marks.setAttribute("height", "100%");
    marks.style.cssText =
      "position:absolute;inset:0;overflow:visible;filter:drop-shadow(0 0 2px rgba(255,255,255,.9)) drop-shadow(0 1px 4px rgba(0,0,0,.22))";
    root.append(marks);

    const safe = { top: 0, right: 0, bottom: 0, left: 0, ...(window.__chalktalkSafe || {}) };
    const boardKeys = ["board", "board2"].filter((key) => steps.some((s) => s[key] && s[key].length));
    const panels = [];
    const mounts = [];
    const engines = [];
    let column = null;
    let homeColumn = () => {};
    let columnMoved = false;
    if (boardKeys.length) {
      let side = window.__sketchSide;
      if (!side) {
        try {
          side = sessionStorage.getItem("sketchSide");
        } catch {}
      }
      if (!side) {
        const rects = steps.flatMap((s) =>
          (s.highlight || [])
            .flatMap((h) => (h.from && h.to ? [h.from, h.to] : [h]))
            .map(resolve)
            .filter(Boolean)
            .flatMap((f) => f.rects),
        );
        const width = Math.min(innerWidth * 0.46, 640);
        const coveredRight = rects.filter((r) => r.right > innerWidth - width - 40).length;
        const coveredLeft = rects.filter((r) => r.left < width + 40).length;
        side = coveredLeft < coveredRight ? "left" : "right";
      }
      window.__sketchSide = side;
      try {
        sessionStorage.setItem("sketchSide", side);
      } catch {}
      const away = side === "left" ? "-115%" : "115%";
      column = document.createElement("div");
      column.style.cssText = "position:absolute;display:flex;flex-direction:column;gap:12px;pointer-events:none";
      homeColumn = () => {
        Object.assign(column.style, { left: "", right: "", top: `${16 + safe.top}px`, bottom: `${16 + safe.bottom}px`, width: "min(46vw,640px)", height: "" });
        column.style[side] = `${16 + safe[side]}px`;
      };
      homeColumn();
      const hide = document.createElement("style");
      hide.textContent = "[data-sketch-board] .sketch-bar,[data-sketch-board] .sketch-say,[data-sketch-board] .sketch-followups{display:none!important}";
      column.append(hide);
      boardKeys.forEach((key, k) => {
        const meta = (lesson.boards && lesson.boards[k]) || (k === 0 ? lesson.board : null) || {};
        const panel = document.createElement("div");
        panel.style.cssText = `position:relative;flex:1;min-height:0;background:#fbfaf6;color:#2c2c2a;border:1px solid #8885;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);pointer-events:auto;overflow:auto;padding:12px 16px;box-sizing:border-box;--sketch-ink:#2c2c2a;--sketch-paper:#fbfaf6;opacity:0;transform:translateX(${away});transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .5s ease`;
        const shut = document.createElement("button");
        shut.type = "button";
        shut.textContent = "✕";
        shut.title = "Close this whiteboard";
        shut.style.cssText = "position:absolute;top:8px;right:10px;z-index:1;width:26px;height:26px;border-radius:50%;border:1px solid #8886;background:#fff;color:#2c2c2a;font:13px system-ui,sans-serif;cursor:pointer;line-height:1";
        shut.addEventListener("click", (e) => {
          e.stopPropagation();
          panel.style.display = "none";
          if (panels.every((p) => p.style.display === "none")) column.style.display = "none";
        });
        panel.append(shut);
        if (meta.title) {
          const title = document.createElement("div");
          title.textContent = meta.title;
          title.style.cssText = "font:21px 'Patrick Hand',system-ui,sans-serif;color:#5F5E5A;margin-bottom:2px";
          panel.append(title);
        }
        const mount = document.createElement("div");
        mount.dataset.sketchBoard = "1";
        panel.append(mount);
        mounts.push(mount);
        column.append(panel);
        panels.push(panel);
        engines.push({
          key,
          engine: window.Chalktalk.mount(mount, {
            width: meta.width || 600,
            height: meta.height || (boardKeys.length > 1 ? 260 : 420),
            autoplay: false,
            steps: steps.map((s) => ({ caption: s.caption, items: s[key] || [], clear: Boolean(s.clear) })),
          }),
        });
      });
      const grip = document.createElement("div");
      grip.title = "Drag to move the whiteboard";
      grip.textContent = "⠿ drag to move";
      grip.style.cssText =
        "align-self:center;pointer-events:auto;cursor:grab;user-select:none;padding:3px 12px;border-radius:999px;background:#2c2c2acc;color:#fff;font:12px system-ui,sans-serif;touch-action:none";
      column.prepend(grip);
      const place = (left, top) => {
        const width = column.getBoundingClientRect().width;
        const height = column.getBoundingClientRect().height;
        const x = Math.max(8, Math.min(innerWidth - width - 8, left));
        const y = Math.max(8, Math.min(innerHeight - height - 8, top));
        Object.assign(column.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto", width: `${width}px`, height: `${height}px` });
        return { x, y };
      };
      try {
        const saved = JSON.parse(sessionStorage.getItem("sketchBoardPos") || "null");
        const size = JSON.parse(sessionStorage.getItem("sketchBoardSize") || "null");
        if (saved || size) {
          columnMoved = true;
          requestAnimationFrame(() => {
            if (size) Object.assign(column.style, { width: `${size.w}px`, height: `${size.h}px`, bottom: "auto" });
            const r = column.getBoundingClientRect();
            place(saved ? saved.x : r.left, saved ? saved.y : r.top);
          });
        }
      } catch {}
      const sizer = document.createElement("div");
      sizer.title = "Drag to resize the whiteboard";
      sizer.textContent = "⇲";
      sizer.style.cssText =
        "position:absolute;right:-6px;bottom:-6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#2c2c2a;color:#fff;font:13px system-ui,sans-serif;cursor:nwse-resize;pointer-events:auto;touch-action:none;user-select:none;z-index:2";
      column.append(sizer);
      sizer.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        sizer.setPointerCapture(e.pointerId);
        columnMoved = true;
        const start = column.getBoundingClientRect();
        place(start.left, start.top);
        const move = (ev) => {
          const w = Math.max(280, Math.min(innerWidth - start.left - 8, start.width + ev.clientX - e.clientX));
          const h = Math.max(200, Math.min(innerHeight - start.top - 8 - safe.bottom, start.height + ev.clientY - e.clientY));
          Object.assign(column.style, { width: `${w}px`, height: `${h}px` });
        };
        const up = () => {
          sizer.removeEventListener("pointermove", move);
          sizer.removeEventListener("pointerup", up);
          const r = column.getBoundingClientRect();
          try {
            sessionStorage.setItem("sketchBoardSize", JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }));
          } catch {}
        };
        sizer.addEventListener("pointermove", move);
        sizer.addEventListener("pointerup", up);
      });
      grip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        grip.setPointerCapture(e.pointerId);
        grip.style.cursor = "grabbing";
        columnMoved = true;
        const start = column.getBoundingClientRect();
        const dx = e.clientX - start.left;
        const dy = e.clientY - start.top;
        const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
        const up = (ev) => {
          grip.style.cursor = "grab";
          grip.removeEventListener("pointermove", move);
          grip.removeEventListener("pointerup", up);
          const at = place(ev.clientX - dx, ev.clientY - dy);
          try {
            sessionStorage.setItem("sketchBoardPos", JSON.stringify(at));
          } catch {}
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
      });
      grip.addEventListener("dblclick", () => {
        columnMoved = false;
        homeColumn();
        dodgeBar();
        try {
          sessionStorage.removeItem("sketchBoardPos");
          sessionStorage.removeItem("sketchBoardSize");
        } catch {}
      });
      root.append(column);
    }

    const bar = document.createElement("div");
    const barHome = `position:absolute;right:${24 + safe.right}px;top:${16 + safe.top}px;display:flex;flex-direction:column;gap:8px;width:min(400px,calc(100vw - 48px));padding:10px 14px 12px;border-radius:16px;background:#2c2c2a;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:auto;box-sizing:border-box;font:14px system-ui,sans-serif`;
    bar.style.cssText = barHome;
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:8px";
    const barGrip = document.createElement("div");
    barGrip.textContent = "⠿ drag to move";
    barGrip.title = "Drag to move. Double-click to put it back.";
    barGrip.style.cssText = "flex:1;font:11px system-ui,sans-serif;opacity:.55;cursor:grab;user-select:none;touch-action:none";
    const barShut = document.createElement("button");
    barShut.type = "button";
    barShut.textContent = "✕";
    barShut.title = "Close everything";
    barShut.style.cssText = "width:22px;height:22px;flex:none;border-radius:50%;border:1px solid #fff8;background:transparent;color:#fff;opacity:.75;font:11px system-ui,sans-serif;cursor:pointer;line-height:1;padding:0";
    barShut.addEventListener("click", (e) => {
      e.stopPropagation();
      end();
    });
    head.append(barGrip, barShut);
    const placeBar = (x, y) => {
      const r = bar.getBoundingClientRect();
      const left = Math.max(8, Math.min(innerWidth - r.width - 8, x));
      const top = Math.max(8 + safe.top, Math.min(innerHeight - r.height - 8 - safe.bottom, y));
      Object.assign(bar.style, { left: `${left}px`, top: `${top}px`, right: "auto" });
      return { x: Math.round(left), y: Math.round(top) };
    };
    try {
      const saved = JSON.parse(localStorage.getItem("chalktalkPos:player") || "null");
      if (saved) requestAnimationFrame(() => placeBar(saved.x, saved.y));
    } catch {}
    barGrip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      barGrip.setPointerCapture(e.pointerId);
      const r = bar.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      let last = null;
      const move = (ev) => {
        last = placeBar(ev.clientX - dx, ev.clientY - dy);
        dodgeBar();
      };
      const up = () => {
        barGrip.removeEventListener("pointermove", move);
        barGrip.removeEventListener("pointerup", up);
        try {
          if (last) localStorage.setItem("chalktalkPos:player", JSON.stringify(last));
        } catch {}
      };
      barGrip.addEventListener("pointermove", move);
      barGrip.addEventListener("pointerup", up);
    });
    barGrip.addEventListener("dblclick", () => {
      bar.style.cssText = barHome;
      try {
        localStorage.removeItem("chalktalkPos:player");
      } catch {}
      dodgeBar();
    });
    function dodgeBar() {
      if (!column || columnMoved) return;
      homeColumn();
      const b = bar.getBoundingClientRect();
      const c = column.getBoundingClientRect();
      if (b.left < c.right && c.left < b.right && b.top < c.bottom && c.top < b.bottom) column.style.top = `${Math.round(b.bottom + 12)}px`;
    }
    const top = document.createElement("div");
    top.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:0";
    const bottom = document.createElement("div");
    bottom.style.cssText = "display:flex;flex-direction:column;gap:8px";
    const light = document.createElement("div");
    light.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85;min-width:0";
    const dot = document.createElement("span");
    dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:#888780;flex:none";
    const lightText = document.createElement("span");
    lightText.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0";
    light.append(dot, lightText);
    const line = document.createElement("div");
    line.style.cssText = "display:flex;align-items:baseline;gap:8px;min-width:0";
    const count = document.createElement("span");
    count.style.cssText = "opacity:.55;font-size:12px;flex:none;font-variant-numeric:tabular-nums";
    const caption = document.createElement("span");
    caption.style.cssText = "font:20px/1.25 'Patrick Hand',system-ui,sans-serif;flex:1;min-width:0;text-wrap:balance";
    line.append(count, caption);
    const extra = document.createElement("div");
    extra.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:nowrap";
    const ask = document.createElement("input");
    ask.placeholder = "Ask about this… (Enter to send)";
    ask.style.cssText = "width:100%;min-width:0;font:inherit;padding:6px 12px;border-radius:999px;border:1px solid #fff4;background:#fff1;color:#fff;outline:none;box-sizing:border-box";
    let current = 0;
    let paused = false;
    let audio = null;
    let timer = null;
    let token = 0;
    const back = button("‹ Back", () => go(current - 1));
    const pause = button("Pause", () => togglePause());
    const next = button("Next ›", () => go(current + 1));
    const replay = button("↺ Replay", () => {
      paused = false;
      pause.textContent = "Pause";
      panels.forEach((p) => (p.style.display = ""));
      if (column) column.style.display = "";
      stages.forEach((s) => (s.closed = false));
      go(0);
    });
    const clear = button("Clear", () => fadeMarks(0));
    clear.title = "Wipe the drawings off the screen";
    const soundOn = () => {
      try {
        return localStorage.getItem("chalktalkSound") !== "off";
      } catch {
        return true;
      }
    };
    const sound = button(soundOn() ? "🔊" : "🔇", () => {
      const on = !soundOn();
      try {
        localStorage.setItem("chalktalkSound", on ? "on" : "off");
      } catch {}
      sound.textContent = on ? "🔊" : "🔇";
    });
    sound.title = "Drawing sounds on or off";
    [back, pause, next, replay, clear, sound].forEach((b) => (b.style.padding = "3px 9px"));
    top.append(light, line, extra);
    controls.append(back, pause, next, replay, clear, sound);
    bottom.append(controls, ask);
    // One stage element per id, created where it first appears and never recreated, so dragging a
    // model somewhere keeps it there for the rest of the lesson; only its parts are rebuilt.
    const stages = new Map();
    steps.forEach((s) => {
      if (!s.stage || !Array.isArray(s.stage.parts)) return;
      const id = String(s.stage.id || "stage");
      if (stages.has(id)) return;
      const w = Math.min(s.stage.w || 520, innerWidth - 32);
      const h = Math.min(s.stage.h || 380, innerHeight - 32 - safe.top - safe.bottom);
      const x = Number.isFinite(s.stage.x) ? s.stage.x : (innerWidth - w) / 2;
      const y = Number.isFinite(s.stage.y) ? s.stage.y : Math.max(16 + safe.top, (innerHeight - h) / 2);
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;pointer-events:auto;display:none;opacity:0;transition:opacity .6s ease`;
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;inset:0;overflow:visible";
      const tools = document.createElement("div");
      tools.style.cssText = "position:absolute;top:-14px;left:50%;transform:translateX(-50%);display:flex;gap:6px;opacity:0;transition:opacity .2s;z-index:2";
      const grab = document.createElement("div");
      grab.textContent = "⠿ drag";
      grab.title = "Drag to move";
      grab.style.cssText = "padding:3px 10px;border-radius:999px;background:#2c2c2acc;color:#fff;font:12px system-ui,sans-serif;cursor:grab;user-select:none;touch-action:none";
      const shut = document.createElement("button");
      shut.type = "button";
      shut.textContent = "✕";
      shut.title = "Close";
      shut.style.cssText = "width:24px;height:24px;border-radius:50%;border:0;background:#2c2c2acc;color:#fff;font:11px system-ui,sans-serif;cursor:pointer";
      tools.append(grab, shut);
      el.append(host, tools);
      const tag = document.createElement("div");
      tag.style.cssText = "position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);font:18px 'Patrick Hand',system-ui,sans-serif;color:#30333A;padding:2px 12px;border-radius:999px;background:rgba(251,250,246,.85);white-space:nowrap;pointer-events:none";
      tag.style.display = "none";
      el.append(tag);
      el.addEventListener("pointerenter", () => (tools.style.opacity = "1"));
      el.addEventListener("pointerleave", () => (tools.style.opacity = "0"));
      const rec = { el, host, tag, built: -1, closed: false, api: null, parts: [] };
      shut.addEventListener("click", (e) => {
        e.stopPropagation();
        rec.closed = true;
        el.style.display = "none";
      });
      grab.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        grab.setPointerCapture(e.pointerId);
        const r = el.getBoundingClientRect();
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        const move = (ev) => {
          el.style.left = `${Math.max(-w / 2, Math.min(innerWidth - w / 2, ev.clientX - dx))}px`;
          el.style.top = `${Math.max(safe.top, Math.min(innerHeight - h / 2, ev.clientY - dy))}px`;
        };
        const up = () => {
          grab.removeEventListener("pointermove", move);
          grab.removeEventListener("pointerup", up);
        };
        grab.addEventListener("pointermove", move);
        grab.addEventListener("pointerup", up);
      });
      root.append(el);
      stages.set(id, rec);
    });

    function showStages() {
      stages.forEach((rec, id) => {
        // The last thing this lesson said about the stage wins: parts in place, or hidden.
        let latest = -1;
        let hidden = false;
        for (let i = 0; i <= current; i++) {
          const st = steps[i].stage;
          if (!st || String(st.id || "stage") !== id) continue;
          hidden = Boolean(st.hide);
          latest = hidden ? -1 : i;
        }
        const on = latest >= 0 && !hidden && !rec.closed;
        if (on && rec.built !== latest) {
          const spec = steps[latest].stage;
          // A later step may say "add these parts" instead of repeating the whole model, which is
          // the difference between a 1.5k-character stage and three of them.
          const parts = Array.isArray(spec.parts) ? spec.parts : (rec.parts || []).concat(spec.add || []);
          if (rec.built < 0) {
            rec.api = window.Chalktalk.figure(rec.host, { ...spec, parts }, window.CHALKTALK_THREE);
            if (window.Chalktalk.sound) window.Chalktalk.sound.thump(0.1);
          } else {
            // Same element, same camera: only the parts change, so a model the user moved or turned
            // stays exactly where it is.
            Promise.resolve(rec.api).then((api) => api && api.setParts(parts));
          }
          rec.parts = parts;
          rec.tag.textContent = spec.label || "";
          rec.tag.style.display = spec.label ? "" : "none";
          rec.built = latest;
        }
        rec.el.style.display = on ? "" : "none";
        requestAnimationFrame(() => (rec.el.style.opacity = on ? "1" : "0"));
      });
    }

    function inkSounds() {
      if (!window.Chalktalk.sound) return;
      marks.querySelectorAll("path").forEach((p) => {
        const m = /stroke-dashoffset ([\d.]+)s \S+ ([\d.]+)s/.exec(p.style.transition || "");
        if (m) window.Chalktalk.sound.scratch(Number(m[2]), Number(m[1]), "marker");
      });
    }
    let fadeTimer = 0;
    function fadeMarks(delay) {
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        marks.style.transition = "opacity 1.5s ease";
        marks.style.opacity = "0";
      }, delay);
    }
    function showMarks() {
      clearTimeout(fadeTimer);
      marks.style.transition = "none";
      marks.style.opacity = "1";
    }
    const finished = () => fadeMarks(4000);
    bar.append(head, top, bottom);
    root.append(bar);
    requestAnimationFrame(dodgeBar);
    if (window.ResizeObserver) new ResizeObserver(() => dodgeBar()).observe(bar);

    let lightTimer = null;
    function paint(color, text, busy) {
      dot.style.cssText = busy
        ? "width:9px;height:9px;flex:none;border-radius:50%;border:2px solid #fff3;border-top-color:#fff;animation:sketchSpin .8s linear infinite"
        : `width:9px;height:9px;border-radius:50%;flex:none;background:${color}`;
      lightText.textContent = text;
    }
    if (!document.getElementById("sketch-pulse")) {
      const css = document.createElement("style");
      css.id = "sketch-pulse";
      css.textContent = "@keyframes sketchSpin{to{transform:rotate(360deg)}}";
      document.head.append(css);
    }
    async function checkStatus() {
      if (!root.isConnected) return;
      try {
        const s = await (await fetch(`${BASE}/status${q}`)).json();
        if (s.agent) AGENT = s.agent;
        if (s.claude === "thinking") {
          const secs = Math.round((Date.now() - s.since) / 1000);
          paint("#EF9F27", `${who()} is thinking${s.doing ? ` · ${s.doing}` : ""} · ${secs >= 60 ? `${Math.floor(secs / 60)}m ` : ""}${secs % 60}s`, true);
          if (s.reply) caption.textContent = `Quick answer: ${s.reply}`;
        } else if (s.claude === "listening") paint("#1D9E75", `${who()} is listening`, false);
        else paint("#888780", s.queued ? `${who()} isn't listening · your question is saved` : `${who()} isn't listening`, false);
        if (s.lesson) {
          const next = await (await fetch(`${BASE}/lesson${q}`)).json().catch(() => null);
          if (next) {
            await load("/explain.js");
            return window.__sketchExplain(next);
          }
        }
      } catch {
        paint("#E24B4A", `Chalktalk is off · ask ${who()} in chat to start it`, false);
      }
      lightTimer = setTimeout(checkStatus, 2000);
    }

    function send(kind, note) {
      const step = steps[current] || {};
      const body = { status: "done", kind, to: SESSION || undefined, tab: TAB, url: location.href, note, step: current + 1, caption: step.caption || "", summary: `${kind === "question" ? "Question" : kind === "answer" ? "Answer" : "Follow-up"} on the lesson, step ${current + 1}: ${note}` };
      navigator.clipboard.writeText(body.summary).catch(() => {});
      return fetch(`${BASE}/point?${K}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) }).then(() => {
        token++;
        stopVoice();
        extra.innerHTML = "";
        caption.textContent = "Sent. The answer will play right here.";
        clearTimeout(lightTimer);
        checkStatus();
      });
    }

    ask.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key !== "Enter" || !ask.value.trim()) return;
      e.preventDefault();
      const text = ask.value.trim();
      ask.disabled = true;
      send("question", text)
        .then(() => (ask.value = ""))
        .catch(() => (caption.textContent = `Chalktalk is off. Your question is on your clipboard: paste it into ${who()}.`))
        .finally(() => (ask.disabled = false));
    });
    ask.addEventListener("focus", () => {
      if (!paused) togglePause();
    });
    document.documentElement.append(root);

    const stopVoice = () => {
      clearTimeout(timer);
      if (audio) audio.pause();
      if (track) track.pause();
      cancelAnimationFrame(follow);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };

    const clipCache = new Map();
    function clipFor(i) {
      const s = steps[i];
      if (!s || !s.audio) return null;
      if (!clipCache.has(i)) {
        clipCache.set(
          i,
          fetch(`${BASE}${lesson.assetBase || "/lesson/"}${s.audio}${q}`)
            .then((r) => r.blob())
            .then((b) => URL.createObjectURL(b)),
        );
      }
      return clipCache.get(i);
    }

    function speak(step, done, onStart) {
      const mine = token;
      let finished = false;
      const finish = () => {
        if (finished || mine !== token) return;
        finished = true;
        done();
      };
      const words = String(step.say || step.caption || "").split(/\s+/).length;
      const started = (seconds) => {
        clearTimeout(timer);
        timer = setTimeout(finish, (seconds || words * 0.45) * 1000 + 3000);
        onStart(seconds);
      };
      const pending = clipFor(current);
      clipFor(current + 1);
      if (!pending) {
        started(0);
        browserVoice(step, finish);
        return;
      }
      pending
        .then(
          (url) =>
            new Promise((ok, bad) => {
              if (mine !== token) return ok();
              audio = new Audio(url);
              audio.onended = finish;
              audio.onerror = bad;
              audio.onloadedmetadata = () => {
                started(audio.duration);
                audio.play().then(ok, bad);
              };
            }),
        )
        .catch(() => {
          started(0);
          browserVoice(step, finish);
        });
    }

    function browserVoice(step, finish) {
      if (lesson.voice !== "browser" || !step.say || !window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(step.say);
      u.rate = 0.9;
      const v = window.Chalktalk.pickVoice && window.Chalktalk.pickVoice();
      if (v) u.voice = v;
      u.onend = finish;
      window.speechSynthesis.speak(u);
    }

    function drawMarks(animate) {
      marks.innerHTML = "";
      const step = steps[current];
      (step.highlight || []).forEach((h, k) => {
        if (h.from && h.to) return connect(h, animate ? (typeof h.at === "number" ? h.at : k * 0.5) : 0, animate);
        const found = resolve(h);
        if (!found) return;
        const delay = animate ? (typeof h.at === "number" ? h.at : k * 0.5) : 0;
        const style = h.style || "underline";
        if (style === "underline") {
          const color = palette[h.color] || h.color || "#E24B4A";
          found.rects.forEach((r, i) => {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", underline(r.left - 2, r.right + 2, r.bottom + 3));
            p.setAttribute("fill", "none");
            p.setAttribute("stroke", color);
            p.setAttribute("stroke-width", "3");
            p.setAttribute("stroke-linecap", "round");
            marks.append(p);
            if (animate) {
              const L = p.getTotalLength();
              p.style.strokeDasharray = L;
              p.style.strokeDashoffset = L;
              p.getBoundingClientRect();
              p.style.transition = `stroke-dashoffset .6s ease-out ${delay + i * 0.3}s`;
              p.style.strokeDashoffset = 0;
            }
          });
        } else if (style === "arrow") {
          const r = found.rects[0];
          const color = palette[h.color] || h.color || "#E24B4A";
          const fromLeft = r.left > 240;
          const ex = fromLeft ? r.left - 6 : r.right + 6;
          const ey = r.top + r.height / 2;
          const sx = fromLeft ? ex - 150 : ex + 150;
          const sy = Math.max(36, ey - 70);
          const cx = (sx + ex) / 2;
          const cy = sy - 12;
          const ang = Math.atan2(ey - cy, ex - cx);
          const wing = (s) => `${(ex - 15 * Math.cos(ang + s * 0.45)).toFixed(1)} ${(ey - 15 * Math.sin(ang + s * 0.45)).toFixed(1)}`;
          [`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`, `M${wing(1)} L${ex} ${ey} L${wing(-1)}`].forEach((d, j) => {
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", d);
            p.setAttribute("fill", "none");
            p.setAttribute("stroke", color);
            p.setAttribute("stroke-width", "3.5");
            p.setAttribute("stroke-linecap", "round");
            p.setAttribute("stroke-linejoin", "round");
            marks.append(p);
            if (animate) {
              const L = p.getTotalLength();
              p.style.strokeDasharray = L;
              p.style.strokeDashoffset = L;
              p.getBoundingClientRect();
              p.style.transition = `stroke-dashoffset ${j ? 0.25 : 0.7}s ease-out ${delay + j * 0.7}s`;
              p.style.strokeDashoffset = 0;
            }
          });
          if (h.label) {
            const t = document.createElementNS(NS, "text");
            t.textContent = h.label;
            t.setAttribute("x", sx);
            t.setAttribute("y", sy - 14);
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("fill", color);
            t.setAttribute("font-family", "'Patrick Hand', system-ui, sans-serif");
            t.setAttribute("font-size", "24");
            t.setAttribute("stroke", "#fff");
            t.setAttribute("stroke-width", "5");
            t.setAttribute("paint-order", "stroke");
            marks.append(t);
          }
        } else if (style === "marker") {
          found.rects.forEach((r) => {
            const m = document.createElementNS(NS, "rect");
            m.setAttribute("x", r.left - 2);
            m.setAttribute("y", r.top - 1);
            m.setAttribute("width", r.width + 4);
            m.setAttribute("height", r.height + 2);
            m.setAttribute("rx", "3");
            m.setAttribute("fill", palette[h.color] || h.color || "#FFD400");
            m.style.cssText = `opacity:.42;transform-box:fill-box;transform-origin:left;transform:scaleX(${animate ? 0 : 1});transition:transform .6s ease ${delay}s`;
            marks.append(m);
            if (animate) requestAnimationFrame(() => requestAnimationFrame(() => (m.style.transform = "scaleX(1)")));
          });
        } else {
          const r = found.rects[0];
          const p = document.createElementNS(NS, "path");
          p.setAttribute("d", oval(r.left, r.top, r.width, r.height));
          p.setAttribute("fill", "none");
          p.setAttribute("stroke", palette[h.color] || h.color || "#E24B4A");
          p.setAttribute("stroke-width", "4");
          p.setAttribute("stroke-linecap", "round");
          marks.append(p);
          if (animate) {
            const L = p.getTotalLength();
            p.style.strokeDasharray = L;
            p.style.strokeDashoffset = L;
            p.getBoundingClientRect();
            p.style.transition = `stroke-dashoffset .8s ease-in-out ${delay}s`;
            p.style.strokeDashoffset = 0;
          }
        }
        if (h.label && style !== "arrow") {
          const r = found.rects[0];
          const t = document.createElementNS(NS, "text");
          t.textContent = h.label;
          const nearRight = r.left > innerWidth - 260;
          t.setAttribute("x", nearRight ? Math.min(innerWidth - 12, r.right + 6) : Math.max(8, r.left - 6));
          if (nearRight) t.setAttribute("text-anchor", "end");
          t.setAttribute("y", r.top > 40 ? r.top - 18 : r.bottom + 30);
          t.setAttribute("fill", palette[h.color] || h.color || "#E24B4A");
          t.setAttribute("font-family", "'Patrick Hand', system-ui, sans-serif");
          t.setAttribute("font-size", "22");
          t.setAttribute("stroke", "#fff");
          t.setAttribute("stroke-width", "5");
          t.setAttribute("paint-order", "stroke");
          t.style.cssText = `opacity:${animate ? 0 : 1};transition:opacity .4s ease ${delay + 0.6}s`;
          marks.append(t);
          if (animate) requestAnimationFrame(() => requestAnimationFrame(() => (t.style.opacity = 1)));
        }
      });
    }

    function connect(h, delay, animate) {
      const a = resolve(h.from);
      const b = resolve(h.to);
      if (!a || !b) return;
      const ra = a.rects[0];
      const rb = b.rects[0];
      const mid = (r) => [r.left + r.width / 2, r.top + r.height / 2];
      const [ax, ay] = mid(ra);
      const [bx, by] = mid(rb);
      const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
      const sx = horizontal ? (bx > ax ? ra.right + 6 : ra.left - 6) : ax;
      const sy = horizontal ? ay : by > ay ? ra.bottom + 6 : ra.top - 6;
      const ex = horizontal ? (bx > ax ? rb.left - 6 : rb.right + 6) : bx;
      const ey = horizontal ? by : by > ay ? rb.top - 6 : rb.bottom + 6;
      const lift = Math.min(120, Math.hypot(ex - sx, ey - sy) * 0.25);
      const cx = (sx + ex) / 2 + (horizontal ? 0 : lift);
      const cy = (sy + ey) / 2 - (horizontal ? lift : 0);
      const color = palette[h.color] || h.color || "#EF9F27";
      const ang = Math.atan2(ey - cy, ex - cx);
      const wing = (s) => `${(ex - 16 * Math.cos(ang + s * 0.45)).toFixed(1)} ${(ey - 16 * Math.sin(ang + s * 0.45)).toFixed(1)}`;
      [`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`, `M${wing(1)} L${ex} ${ey} L${wing(-1)}`].forEach((d, j) => {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", color);
        p.setAttribute("stroke-width", "4");
        p.setAttribute("stroke-linecap", "round");
        p.setAttribute("stroke-linejoin", "round");
        marks.append(p);
        if (animate) {
          const L = p.getTotalLength();
          p.style.strokeDasharray = L;
          p.style.strokeDashoffset = L;
          p.getBoundingClientRect();
          p.style.transition = `stroke-dashoffset ${j ? 0.25 : 0.9}s ease-in-out ${delay + j * 0.9}s`;
          p.style.strokeDashoffset = 0;
        }
      });
      if (h.label) {
        const t = document.createElementNS(NS, "text");
        t.textContent = h.label;
        t.setAttribute("x", cx);
        t.setAttribute("y", cy - 4);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", color);
        t.setAttribute("font-family", "'Patrick Hand', system-ui, sans-serif");
        t.setAttribute("font-size", "24");
        t.setAttribute("stroke", "#fff");
        t.setAttribute("stroke-width", "5");
        t.setAttribute("paint-order", "stroke");
        marks.append(t);
      }
    }

    function followups() {
      extra.innerHTML = "";
      if (current !== n - 1) return;
      (lesson.followups || []).forEach((f) => {
        extra.append(
          button(`${f.label} ↗`, () => {
            const buttons = [...extra.querySelectorAll("button")];
            buttons.forEach((b) => (b.disabled = true));
            send("followup", f.prompt || f.label).catch(() => {
              buttons.forEach((b) => (b.disabled = false));
              caption.textContent = `Chalktalk is off. Your question is on your clipboard: paste it into ${who()}.`;
            });
          }),
        );
      });
    }

    const streaming = Boolean(lesson.stream);
    const timeline = !streaming && lesson.audio && Array.isArray(lesson.timeline) && lesson.timeline.length === n ? lesson.timeline : null;
    let track = null;
    let reportedStart = false;
    let follow = 0;
    let waitTimer = 0;
    const trackReady = timeline
      ? fetch(`${BASE}${lesson.assetBase || "/lesson/"}${lesson.audio}${q}`)
          .then((r) => r.blob())
          .then((b) => {
            track = new Audio(URL.createObjectURL(b));
            track.onended = () => {
              cancelAnimationFrame(follow);
              if (current !== n - 1) go(n - 1, true);
              if (!steps[n - 1].ask) finished();
            };
            return track;
          })
          .catch(() => null)
      : Promise.resolve(null);
    const cueEnd = (i) =>
      i + 1 < n ? timeline[i + 1] : track && Number.isFinite(track.duration) ? track.duration : timeline[i] + 8;
    function followTrack() {
      cancelAnimationFrame(follow);
      const tick = () => {
        if (!track || track.paused) return;
        if (steps[current].ask && track.currentTime >= cueEnd(current) - 0.15) {
          track.pause();
          return;
        }
        let i = current;
        while (i + 1 < n && track.currentTime >= timeline[i + 1]) i++;
        if (i !== current) go(i, true);
        follow = requestAnimationFrame(tick);
      };
      follow = requestAnimationFrame(tick);
    }

    async function go(i, fromTrack = false) {
      token++;
      showMarks();
      if (!timeline) stopVoice();
      current = Math.max(0, Math.min(n - 1, i));
      const step = steps[current];
      count.textContent = `${current + 1}/${n}`;
      caption.textContent = step.caption || "";
      followups();
      if (step.ask) {
        caption.textContent = step.ask.question || caption.textContent;
        (step.ask.options || []).forEach((option) => {
          extra.append(
            button(option, () => {
              [...extra.querySelectorAll("button")].forEach((b) => (b.disabled = true));
              send("answer", option).catch(() => (caption.textContent = "Chalktalk is off. Answer in the chat instead."));
            }),
          );
        });
        if (current < n - 1) extra.append(button("Skip", () => go(current + 1)));
      }
      clearInterval(waitTimer);
      if (step.waitFor && !resolve(step.waitFor)) {
        stopVoice();
        caption.textContent = step.waitFor.hint || "Do that, I'll wait";
        const mine = token;
        waitTimer = setInterval(() => {
          if (mine !== token || !root.isConnected) return clearInterval(waitTimer);
          if (!resolve(step.waitFor)) return;
          clearInterval(waitTimer);
          setTimeout(() => go(current), 350);
        }, 300);
        return;
      }
      const first = (step.highlight || []).flatMap((h) => (h.from && h.to ? [h.from, h.to] : [h])).map(resolve).find(Boolean);
      const shown = first && first.rects[0] && first.rects[0].top >= 0 && first.rects[0].bottom <= innerHeight - 160;
      if (first && first.scrollTo && !shown) {
        first.scrollTo.scrollIntoView({ block: "center", behavior: "smooth" });
        if (!timeline) await sleep(450);
      }
      drawMarks(true);
      inkSounds();
      showStages();
      if (!reportedStart) {
        reportedStart = true;
        fetch(`${BASE}/lesson/started${q}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }).catch(() => {});
      }
      const drawBoard = (seconds) => {
        engines.forEach(({ key, engine }, k) => {
          if (step[key] && step[key].length) {
            panels[k].style.transform = "none";
            panels[k].style.opacity = "1";
          }
          const natural = engine.go(current);
          const timed = (step[key] || []).some((item) => typeof item.at === "number");
          if (!timed && seconds && natural > 0.3 && seconds * 0.85 > natural) engine.go(current, (seconds * 0.85) / natural);
        });
      };
      if (streaming) {
        const mine = token;
        drawBoard(step.seconds || 8);
        if (paused) return;
        if (!step.audio) return void waitForClip(mine);
        stopVoice();
        const el = new Audio(`${BASE}${lesson.assetBase || "/lesson/"}${step.audio}${q}`);
        track = el;
        el.onended = () => {
          if (mine !== token) return;
          if (current < n - 1) go(current + 1);
          else if (lesson.done) finished();
          else waitForNext(mine);
        };
        el.play().catch(() => (caption.textContent = "Press Play to hear it"));
        return;
      }
      if (timeline) {
        drawBoard(cueEnd(current) - timeline[current]);
        if (fromTrack) return;
        const t = await trackReady;
        if (!t) return;
        t.currentTime = timeline[current];
        if (!paused) {
          t.play().catch(() => (caption.textContent = "Press Play to hear it"));
          followTrack();
        }
        return;
      }
      if (paused) {
        drawBoard(0);
        return;
      }
      const mine = token;
      speak(
        step,
        () => {
          if (mine === token && !paused && current < n - 1 && !step.ask) timer = setTimeout(() => go(current + 1), 250);
          else if (mine === token && current === n - 1 && !step.ask) finished();
        },
        drawBoard,
      );
    }

    // A streamed lesson grows while it plays: fetch the newer file, rebuild the boards it changed,
    // and keep going. The stage and the audio are untouched.
    async function grow() {
      try {
        const res = await fetch(`${BASE}/lesson/live${q}`);
        if (!res.ok) return false;
        const data = await res.json();
        if (data.done) lesson.done = true;
        if (!Array.isArray(data.steps) || data.steps.length <= n) return false;
        for (let i = 0; i < data.steps.length; i++) steps[i] = data.steps[i];
        n = steps.length;
        await window.Chalktalk.prepare(steps.flatMap((s) => [...(s.board || []), ...(s.board2 || [])]), BASE);
        engines.forEach((entry, k) => {
          const meta = (lesson.boards && lesson.boards[k]) || (k === 0 ? lesson.board : null) || {};
          entry.engine = window.Chalktalk.mount(mounts[k], {
            width: meta.width || 600,
            height: meta.height || (boardKeys.length > 1 ? 260 : 420),
            autoplay: false,
            steps: steps.map((s) => ({ caption: s.caption, items: s[entry.key] || [], clear: Boolean(s.clear) })),
          });
          entry.engine.go(current);
        });
        count.textContent = `${current + 1}/${n}`;
        return true;
      } catch {
        return false;
      }
    }

    async function waitForNext(mine) {
      caption.textContent = "…";
      for (let tries = 0; tries < 300; tries++) {
        if (mine !== token) return;
        if (await grow()) {
          if (current < n - 1) go(current + 1);
          return;
        }
        if (lesson.done) {
          finished();
          return;
        }
        await sleep(800);
      }
    }

    async function waitForClip(mine) {
      for (let tries = 0; tries < 300; tries++) {
        if (mine !== token) return;
        if (steps[current].audio) return go(current);
        if (!(await grow())) await sleep(700);
      }
    }

    function togglePause() {
      paused = !paused;
      pause.textContent = paused ? "Play" : "Pause";
      if (paused) stopVoice();
      else if (timeline && track) {
        track.play().catch(() => {});
        followTrack();
      } else go(current);
    }

    let raf = 0;
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => drawMarks(false));
    };
    const onKey = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") go(current + 1);
      else if (e.key === "ArrowLeft") go(current - 1);
      else if (e.key === "Escape") end();
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("scroll", redraw, { passive: true, capture: true });
    window.addEventListener("resize", redraw);
    window.addEventListener("keydown", onKey, true);

    function end(replacing = false) {
      token++;
      clearTimeout(fadeTimer);
      stopVoice();
      clearTimeout(lightTimer);
      clearInterval(waitTimer);
      window.removeEventListener("scroll", redraw, { capture: true });
      window.removeEventListener("resize", redraw);
      window.removeEventListener("keydown", onKey, true);
      root.remove();
      window.__sketchExplainClose = null;
      if (!replacing && window.__chalktalkScreen) window.__chalktalkScreen.done();
    }
    window.__sketchExplainClose = () => end(true);

    checkStatus();
    go(0);
    return `lesson with ${n} steps showing`;
  };
})();
