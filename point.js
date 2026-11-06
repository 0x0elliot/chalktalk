(() => {
  try {
    if (window.__sketchPoint && window.__sketchPoint.active) window.__sketchPoint.stop();
  } catch {}
  window.__sketchPoint = null;

  const NS = "http://www.w3.org/2000/svg";
  const INTERACTIVE =
    'button, a, input, select, textarea, label, [role="switch"], [role="checkbox"], [role="radio"], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="combobox"], [contenteditable="true"]';
  const CONTEXT = 'tr, li, [role="row"], [role="listitem"], fieldset, form, section, article, [role="dialog"]';
  const SCREEN = window.__chalktalkScreen || null;
  const state = { status: "drawing", strokes: [], bbox: null, targets: [], note: "", screen: null };
  const waiters = [];

  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.04);touch-action:none";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.cssText = "position:absolute;inset:0;overflow:visible";
  layer.append(svg);
  const hint = document.createElement("div");
  hint.textContent = "Circle what you mean, or just press Enter to talk. Z to undo, Esc to cancel";
  hint.style.cssText =
    "position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:#2c2c2a;color:#fff;font:14px system-ui,sans-serif;pointer-events:none";
  layer.append(hint);
  document.documentElement.append(layer);

  let sessions = [];
  let agent = "";
  const who = () => agent || "Claude";
  let chosen = window.__sketchSession || null;
  const LISTEN = "/chalktalk listen";
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
  fetch(`http://127.0.0.1:47321/status?tab=${TAB}`)
    .then((r) => r.json())
    .then(async (s) => {
      if (s.agent) agent = s.agent;
      if (s.lesson && s.session) {
        const lesson = await (await fetch(`http://127.0.0.1:47321/lesson?session=${encodeURIComponent(s.session)}&tab=${TAB}`)).json();
        (0, eval)(await (await fetch("http://127.0.0.1:47321/explain.js")).text());
        stop();
        return window.__sketchExplain(lesson);
      }
      sessions = (s.sessions || []).filter((x) => x.state !== "away");
      if (!sessions.length) {
        const box = document.createElement("div");
        box.style.cssText =
          "position:fixed;top:58px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:min(92vw,720px);padding:8px 12px;border-radius:12px;background:#2c2c2a;color:#fff;font:13px system-ui,sans-serif;pointer-events:auto";
        box.addEventListener("pointerdown", (e) => e.stopPropagation());
        const text = document.createElement("span");
        text.textContent = `No ${who()} session is listening. Circle and talk anyway: it is saved. To have ${who()} answer, paste this into a Claude Code session:`;
        const code = document.createElement("code");
        code.textContent = LISTEN;
        code.style.cssText = "background:#fff2;padding:2px 6px;border-radius:6px;white-space:nowrap";
        const copy = document.createElement("button");
        copy.textContent = "Copy";
        copy.style.cssText = "font:inherit;padding:2px 10px;border-radius:999px;border:1px solid #fff5;background:transparent;color:#fff;cursor:pointer";
        copy.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(LISTEN).then(() => (copy.textContent = "Copied"));
        });
        box.append(text, code, copy);
        layer.append(box);
      } else if (!chosen || !sessions.some((x) => x.id === chosen)) chosen = sessions[0].id;
    })
    .catch(() => {});

  fetch(`http://127.0.0.1:47321/recent?path=${encodeURIComponent(SCREEN ? "" : location.pathname.replace(/\/+$/, ""))}`)
    .then((r) => r.json())
    .then((saved) => {
      if (!Array.isArray(saved) || !saved.length) return;
      const box = document.createElement("div");
      box.style.cssText =
        "position:fixed;top:104px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;max-width:min(92vw,560px);padding:10px 14px;border-radius:14px;background:#2c2c2a;color:#fff;font:13px system-ui,sans-serif;pointer-events:auto";
      box.addEventListener("pointerdown", (e) => e.stopPropagation());
      const head = document.createElement("div");
      head.style.opacity = ".75";
      head.textContent = "Replay a recent explanation for this page:";
      box.append(head);
      saved.slice(0, 3).forEach((item) => {
        const play = document.createElement("button");
        play.textContent = `▶ Replay: ${item.title}`;
        play.style.cssText = "font:inherit;text-align:left;padding:5px 12px;border-radius:999px;border:1px solid #fff5;background:transparent;color:#fff;cursor:pointer";
        play.addEventListener("click", async (e) => {
          e.stopPropagation();
          play.textContent = "Loading…";
          const lesson = await (await fetch(`http://127.0.0.1:47321/recent/${item.id}`)).json();
          (0, eval)(await (await fetch("http://127.0.0.1:47321/explain.js")).text());
          stop();
          window.__sketchExplain(lesson);
        });
        box.append(play);
      });
      layer.append(box);
    })
    .catch(() => {});

  let points = null;
  let path = null;
  const d = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  const swallow = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  layer.addEventListener("pointerdown", (e) => {
    if (state.status !== "drawing") return;
    swallow(e);
    layer.setPointerCapture(e.pointerId);
    points = [[e.clientX, e.clientY]];
    path = document.createElementNS(NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#E24B4A");
    path.setAttribute("stroke-width", "4");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  });
  layer.addEventListener("pointermove", (e) => {
    if (!points) return;
    swallow(e);
    points.push([e.clientX, e.clientY]);
    path.setAttribute("d", d(points));
  });
  layer.addEventListener("pointerup", (e) => {
    if (!points) return;
    swallow(e);
    if (points.length > 2) state.strokes.push({ points, path });
    else path.remove();
    points = null;
  });
  ["click", "mousedown", "mouseup", "contextmenu", "wheel"].forEach((type) => layer.addEventListener(type, swallow, { passive: false }));

  function describe(el) {
    const rect = el.getBoundingClientRect();
    const text = (node) => (node ? (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160) : null);
    const labelled = el.getAttribute("aria-labelledby");
    const forLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
    const path = [];
    for (let n = el; n && n.nodeType === 1 && path.length < 5; n = n.parentElement) {
      let part = n.tagName.toLowerCase();
      if (n.id) {
        path.unshift(`${part}#${n.id}`);
        break;
      }
      const cls = [...n.classList].filter((c) => !/[:[\]/]/.test(c)).slice(0, 2);
      if (cls.length) part += `.${cls.join(".")}`;
      path.unshift(part);
    }
    const described = {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      type: el.getAttribute("type"),
      id: el.id || null,
      name: el.getAttribute("name"),
      testid: el.getAttribute("data-testid"),
      ariaLabel: el.getAttribute("aria-label"),
      label: text(labelled ? document.getElementById(labelled) : forLabel || el.closest("label")),
      checked: el.getAttribute("aria-checked") ?? (typeof el.checked === "boolean" ? String(el.checked) : null),
      state: el.getAttribute("data-state"),
      disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
      text: text(el),
      context: text(el.closest(CONTEXT)),
      selector: path.join(" > "),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    };
    return Object.fromEntries(Object.entries(described).filter(([, v]) => v !== null && v !== "" && v !== false));
  }

  function findTargets(box) {
    const seen = new Map();
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 6; j++) {
        const x = box.x + (box.w * i) / 6;
        const y = box.y + (box.h * j) / 6;
        for (const hit of document.elementsFromPoint(x, y)) {
          if (hit === document.documentElement || hit === document.body) continue;
          let el = hit.closest(INTERACTIVE) || hit;
          while (el.ownerSVGElement && !el.matches(INTERACTIVE)) el = el.ownerSVGElement;
          if (!seen.has(el)) seen.set(el, 0);
          seen.set(el, seen.get(el) + 1);
          break;
        }
      }
    }
    const scored = [...seen.keys()].map((el) => {
      const r = el.getBoundingClientRect();
      const ix = Math.max(0, Math.min(r.right, box.x + box.w) - Math.max(r.left, box.x));
      const iy = Math.max(0, Math.min(r.bottom, box.y + box.h) - Math.max(r.top, box.y));
      const area = Math.max(1, r.width * r.height);
      return { el, interactive: el.matches(INTERACTIVE), inside: (ix * iy) / area, area };
    });
    scored.sort((a, b) => b.interactive - a.interactive || b.inside - a.inside || a.area - b.area);
    return scored.slice(0, 5).map((s) => ({ ...describe(s.el), insideCircle: Math.round(s.inside * 100) / 100 }));
  }

  function movable(box, key, onClose) {
    const storeKey = `chalktalkPos:${key}`;
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";
    const grip = document.createElement("div");
    grip.textContent = "⠿ drag to move";
    grip.title = "Drag to move. Double-click to put it back.";
    grip.style.cssText = "flex:1;font:11px system-ui,sans-serif;opacity:.55;cursor:grab;user-select:none;padding-bottom:2px;touch-action:none";
    head.append(grip);
    if (onClose) {
      const shut = document.createElement("button");
      shut.type = "button";
      shut.textContent = "✕";
      shut.title = "Close";
      shut.style.cssText = "width:22px;height:22px;flex:none;border-radius:50%;border:1px solid currentColor;background:transparent;color:inherit;opacity:.6;font:11px system-ui,sans-serif;cursor:pointer;line-height:1;padding:0";
      shut.addEventListener("pointerdown", (e) => e.stopPropagation());
      shut.addEventListener("click", (e) => {
        e.stopPropagation();
        onClose();
      });
      head.append(shut);
    }
    const place = (x, y) => {
      const r = box.getBoundingClientRect();
      const left = Math.min(Math.max(8, x), innerWidth - Math.min(r.width, innerWidth - 16) - 8);
      const top = Math.min(Math.max(8, y), innerHeight - 40);
      Object.assign(box.style, { left: `${left}px`, top: `${top}px`, right: "auto", bottom: "auto", transform: "none" });
      return { x: Math.round(left), y: Math.round(top) };
    };
    const defaults = box.style.cssText;
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || "null");
      if (saved) requestAnimationFrame(() => place(saved.x, saved.y));
    } catch {}
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = box.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      grip.setPointerCapture(e.pointerId);
      grip.style.cursor = "grabbing";
      let last = null;
      const move = (ev) => (last = place(ev.clientX - dx, ev.clientY - dy));
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.style.cursor = "grab";
        try {
          if (last) localStorage.setItem(storeKey, JSON.stringify(last));
        } catch {}
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });
    grip.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      try {
        localStorage.removeItem(storeKey);
      } catch {}
      box.style.cssText = defaults;
    });
    box.prepend(head);
    return grip;
  }

  let pill = null;
  let pillBody = null;
  function showPill(color, text, plan = [], step = 0, reply = "") {
    if (!pill) {
      pill = document.createElement("div");
      pill.style.cssText =
        "position:fixed;right:24px;top:96px;display:flex;flex-direction:column;gap:6px;padding:10px 16px 12px;border-radius:16px;background:#2c2c2a;color:#fff;font:14px system-ui,sans-serif;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.25);width:min(380px,calc(100vw - 48px));box-sizing:border-box";
      pillBody = document.createElement("div");
      pillBody.style.cssText = "display:flex;flex-direction:column;gap:6px";
      pill.append(pillBody);
      movable(pill, "answer", () => {
        pill.style.display = "none";
      });
      document.documentElement.append(pill);
    }
    pillBody.innerHTML = "";
    if (reply) {
      const quick = document.createElement("div");
      quick.style.cssText = "font:19px/1.35 'Patrick Hand',system-ui,sans-serif;padding-bottom:6px;border-bottom:1px solid #fff2";
      quick.textContent = `Quick answer: ${reply}`;
      pillBody.append(quick);
    }
    plan.forEach((line, i) => {
      const row = document.createElement("div");
      const n = i + 1;
      row.style.cssText = `display:flex;gap:8px;opacity:${n < step ? 0.55 : n === step ? 1 : 0.7}`;
      const mark = document.createElement("span");
      mark.style.cssText = `width:16px;display:flex;align-items:center;justify-content:center;color:${n < step ? "#5DCAA5" : "#fff8"}`;
      if (n === step) mark.append(spinner());
      else mark.textContent = n < step ? "✓" : "○";
      const label = document.createElement("span");
      label.textContent = `${n}. ${line}`;
      row.append(mark, label);
      pillBody.append(row);
    });
    const head = document.createElement("div");
    head.style.cssText = `display:flex;align-items:center;gap:8px;${plan.length ? "border-top:1px solid #fff2;padding-top:6px;opacity:.8;font-size:13px" : ""}`;
    let dot;
    if (color === "#EF9F27") dot = spinner();
    else {
      dot = document.createElement("span");
      dot.style.cssText = `width:9px;height:9px;border-radius:50%;flex:none;background:${color}`;
    }
    const words = document.createElement("span");
    words.textContent = text;
    head.append(dot, words);
    pillBody.append(head);
  }

  function spinner() {
    if (!document.getElementById("chalktalk-spin")) {
      const css = document.createElement("style");
      css.id = "chalktalk-spin";
      css.textContent = "@keyframes chalktalkSpin{to{transform:rotate(360deg)}}";
      document.head.append(css);
    }
    const s = document.createElement("span");
    s.style.cssText = "display:inline-block;width:10px;height:10px;flex:none;border-radius:50%;border:2px solid #fff3;border-top-color:#fff;animation:chalktalkSpin .8s linear infinite;box-sizing:border-box";
    return s;
  }

  function waitForLesson(until) {
    const again = (ms) => Date.now() < until && setTimeout(() => waitForLesson(until), ms);
    const q = `?tab=${window.__sketchTab}${window.__sketchSession ? `&session=${encodeURIComponent(window.__sketchSession)}` : ""}`;
    fetch(`http://127.0.0.1:47321/status${q}`)
      .then((r) => r.json())
      .then(async (s) => {
        if (s.session && !window.__sketchSession) window.__sketchSession = s.session;
        if (s.agent) agent = s.agent;
        if (s.lesson) {
          const lesson = await (await fetch(`http://127.0.0.1:47321/lesson${q}`)).json();
          (0, eval)(await (await fetch("http://127.0.0.1:47321/explain.js")).text());
          if (pill) pill.remove();
          pill = null;
          return window.__sketchExplain(lesson);
        }
        if (s.claude === "thinking") {
          const secs = Math.round((Date.now() - s.since) / 1000);
          const clock = `${secs >= 60 ? `${Math.floor(secs / 60)}m ` : ""}${secs % 60}s`;
          showPill("#EF9F27", s.plan && s.plan.length ? `${who()} is thinking · ${clock}` : `${who()} is thinking${s.doing ? ` · ${s.doing}` : ""} · ${clock}`, s.plan || [], s.step || 0, s.reply || "");
        } else if (s.claude === "listening") showPill("#1D9E75", `${who()} is listening · your note is queued`);
        else showPill("#888780", `No ${who()} session is listening · your note is saved · paste "${LISTEN}" into a Claude Code session`);
        again(1500);
      })
      .catch(() => {
        showPill("#E24B4A", "Chalktalk is off · your note is on your clipboard");
        again(3000);
      });
  }

  function settle(status) {
    state.status = status;
    waiters.splice(0).forEach((resolve) => resolve(result()));
  }

  async function readScreen(box) {
    const got = await SCREEN.capture(box);
    if (!got) return;
    const { elements, ...rest } = got;
    state.screen = rest;
    if (box && elements) state.targets = elements;
  }

  async function finish() {
    state.status = "reading";
    if (!state.strokes.length) {
      hint.remove();
      layer.style.pointerEvents = "none";
      layer.style.background = "transparent";
      if (SCREEN) await readScreen(null);
      askNote({ x: innerWidth / 2 + 210, y: 80, w: 0, h: 0 });
      return;
    }
    const all = state.strokes.flatMap((s) => s.points);
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    state.bbox = Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]));
    hint.remove();
    layer.style.pointerEvents = "none";
    layer.style.background = "transparent";
    if (SCREEN) await readScreen(state.bbox);
    else state.targets = findTargets(box);
    askNote(box);
  }

  function askNote(box) {
    state.status = "talking";
    const panel = document.createElement("div");
    const left = Math.min(Math.max(16, box.x + box.w - 420), innerWidth - 436);
    const top = box.y + box.h + 190 < innerHeight ? box.y + box.h + 12 : Math.max(16, box.y - 190);
    panel.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:420px;pointer-events:auto;background:#fff;color:#2c2c2a;border:2px solid #E24B4A;border-radius:12px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);font:14px system-ui,sans-serif`;
    const title = document.createElement("div");
    title.style.cssText = "margin-bottom:8px;font-weight:500";
    title.textContent = state.mode === "ask" ? "Ask me anything. Talk or type." : "What's wrong here? Talk or type.";
    const note = document.createElement("textarea");
    note.placeholder = "Wispr types straight into this box";
    note.style.cssText = "width:100%;box-sizing:border-box;height:110px;font:15px system-ui,sans-serif;padding:8px;border:1px solid #ccc;border-radius:8px;resize:vertical;color:#2c2c2a;background:#fff";
    const foot = document.createElement("div");
    foot.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-top:8px";
    const help = document.createElement("span");
    help.style.opacity = ".6";
    help.textContent = "⌘Enter to send · Esc to skip";
    const send = document.createElement("button");
    send.textContent = `Send to ${who()}`;
    send.style.cssText = "font:inherit;padding:4px 14px;border-radius:8px;border:0;background:#E24B4A;color:#fff;cursor:pointer";
    foot.append(help, send);
    panel.append(title);
    movable(panel, "note", () => {
      panel.remove();
      stop();
      settle("cancelled");
      if (SCREEN) SCREEN.done();
    });
    if (sessions.length > 1) {
      const pick = document.createElement("select");
      pick.style.cssText = "width:100%;margin-bottom:8px;font:14px system-ui,sans-serif;padding:6px;border-radius:8px;border:1px solid #ccc;background:#fff;color:#2c2c2a";
      sessions.forEach((x) => {
        const o = document.createElement("option");
        o.value = x.id;
        o.textContent = `Send to: ${x.id}${x.state === "thinking" ? " (busy)" : ""}`;
        o.selected = x.id === chosen;
        pick.append(o);
      });
      pick.addEventListener("change", () => (chosen = pick.value));
      pick.addEventListener("keydown", (e) => e.stopPropagation());
      panel.append(pick);
    }
    panel.append(note, foot);
    layer.append(panel);
    const close = () => {
      state.note = note.value.trim();
      panel.remove();
      settle("done");
      svg.style.transition = "opacity 1.2s ease .6s";
      svg.style.opacity = "0";
      const top = state.targets[0] || {};
      const where = SCREEN
        ? `on screen, in ${(state.screen && state.screen.app) || "an app"}${state.screen && state.screen.window ? ` (${state.screen.window})` : ""}${state.screen && state.screen.url ? ` at ${state.screen.url}` : ""}`
        : `on ${location.href}`;
      const summary = [
        `Chalktalk: I circled something ${where}`,
        `Circled: ${top.ariaLabel || top.label || top.text || top.tag || "an area"}${top.role ? ` (${top.role}${top.checked ? `, checked=${top.checked}` : ""})` : ""}`,
        top.context ? `In: ${top.context}` : null,
        `Box: ${JSON.stringify(state.bbox)} in a ${innerWidth}x${innerHeight} viewport`,
        `What's wrong: ${state.note || "(no note)"}`,
      ]
        .filter(Boolean)
        .join("\n");
      const toast = document.createElement("div");
      toast.style.cssText =
        "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:999px;background:#2c2c2a;color:#fff;font:14px system-ui,sans-serif;pointer-events:none";
      layer.append(toast);
      const shown = (text) => {
        toast.textContent = text;
        setTimeout(() => toast.remove(), 4000);
      };
      navigator.clipboard.writeText(summary).catch(() => {});
      const pageText = SCREEN
        ? ((state.screen && state.screen.texts) || []).join("\n")
        : (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 15000);
      fetch("http://127.0.0.1:47321/point", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ summary, ...result(), strokes: undefined, pageText, surface: SCREEN ? "screen" : "page", to: chosen || undefined, tab: window.__sketchTab }),
      })
        .then((r) => r.json())
        .then((s) => {
          if (s.deliveredTo) window.__sketchSession = s.deliveredTo;
          if (s.agent) agent = s.agent;
          shown(
            s.claude === "thinking"
              ? `${who()} is thinking. A quick answer, then the drawing, will show here.`
              : `Saved. No ${who()} session is listening; paste "${LISTEN}" into one and it picks this up.`,
          );
          waitForLesson(Date.now() + 60 * 60 * 1000);
        })
        .catch(() => shown(`Chalktalk is off. Your note is on your clipboard: paste it into ${who()}.`));
    };
    note.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        close();
      } else if (e.key === "Escape") close();
    });
    send.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });
    note.focus();
  }

  function onKey(e) {
    if (state.status !== "drawing") return;
    if (e.key === "Enter") {
      swallow(e);
      finish();
    } else if (e.key === "Escape") {
      swallow(e);
      stop();
      settle("cancelled");
      if (SCREEN) SCREEN.done();
    } else if (e.key === "z" || e.key === "Backspace") {
      swallow(e);
      const last = state.strokes.pop();
      if (last) last.path.remove();
    }
  }
  window.addEventListener("keydown", onKey, true);
  if (window.__chalktalkMode === "ask") {
    window.__chalktalkMode = null;
    state.mode = "ask";
    requestAnimationFrame(() => finish());
  }

  function result() {
    return {
      status: state.status,
      url: SCREEN ? (state.screen && state.screen.url) || null : location.href,
      title: SCREEN ? (state.screen && state.screen.window) || null : document.title,
      screen: state.screen || undefined,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
      note: state.note || null,
      mode: state.mode || "draw",
      bbox: state.bbox,
      strokes: state.strokes.map((s) => s.points.filter((_, i) => i % 3 === 0).map(([x, y]) => [Math.round(x), Math.round(y)])),
      targets: state.targets,
    };
  }

  function wait(ms = 40000) {
    if (state.status === "done" || state.status === "cancelled") return Promise.resolve(result());
    return new Promise((resolve) => {
      waiters.push(resolve);
      setTimeout(() => resolve({ ...result(), status: `still ${state.status}` }), ms);
    });
  }

  function stop() {
    window.removeEventListener("keydown", onKey, true);
    layer.remove();
    window.__sketchPoint.active = false;
    return "drawing layer removed";
  }

  window.__sketchPoint = { active: true, wait, stop, result };
  return "drawing layer on";
})();
