export {};

const [dir] = Bun.argv.slice(2);
if (!dir) {
  process.stderr.write("usage: bun bookmarklet.ts <output-dir>\n");
  process.exit(1);
}

const loader = `void fetch("http://127.0.0.1:47321/point.js").then((r) => { if (!r.ok) throw r.status; return r.text(); }).then((code) => (0, eval)(code)).catch((e) => {
  const blocked = e === 403;
  const cmd = blocked ? "/chalktalkunblock " + location.origin : "/chalktalklisten";
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#2c2c2a;color:#fff;font:14px/1.5 system-ui,sans-serif;padding:14px 18px;border-radius:14px;max-width:min(92vw,540px);box-shadow:0 8px 24px #0004";
  d.innerHTML = "<div></div><code style='display:block;margin:8px 0;padding:6px 10px;background:#fff2;border-radius:8px'></code><button style='font:inherit;padding:3px 12px;border-radius:999px;border:1px solid #fff6;background:transparent;color:#fff;cursor:pointer'>Copy</button> <button style='font:inherit;padding:3px 12px;border-radius:999px;border:1px solid #fff6;background:transparent;color:#fff;cursor:pointer'>Close</button>";
  d.children[0].textContent = blocked ? "Chalktalk is blocked on this site. To unblock it, paste this into a Claude Code session:" : "Chalktalk isn't running, or Chrome blocked it here. Paste this into a Claude Code session, then click Chalktalk again; if Chalktalk is running, allow this site to reach apps on this device:";
  d.children[1].textContent = cmd;
  d.children[2].onclick = () => navigator.clipboard.writeText(cmd).then(() => (d.children[2].textContent = "Copied"));
  d.children[3].onclick = () => d.remove();
  document.body.append(d);
})`;
const attr = `javascript:${encodeURIComponent(loader)}`.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Install the Chalktalk bookmark</title>
    <style>
      body { margin: 0; font: 17px/1.6 system-ui, sans-serif; background: #fbfaf6; color: #2c2c2a; }
      main { max-width: 640px; margin: 64px auto; padding: 0 16px; }
      a.mark { display: inline-block; margin: 16px 0 24px; padding: 10px 20px; border-radius: 999px; background: #E24B4A; color: #fff; text-decoration: none; font-weight: 500; }
      ol { padding-left: 20px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Chalktalk bookmark</h1>
      <p>Drag this button onto your bookmarks bar. Replace any older Chalktalk bookmark; this one never needs updating.</p>
      <a class="mark" href="${attr}">Chalktalk</a>
      <ol>
        <li>Show the bookmarks bar with Cmd+Shift+B if it is hidden.</li>
        <li>When Claude says it is listening, click Chalktalk on any page.</li>
        <li>Circle what you mean, press Enter, talk or type in the box, then press Cmd+Enter. Claude gets it right away.</li>
        <li>If Chrome asks to let the page reach apps on this device, allow it once.</li>
      </ol>
    </main>
  </body>
</html>
`;

await Bun.write(`${dir}/install-chalktalk-bookmark.html`, page);
process.stdout.write(`${dir}/install-chalktalk-bookmark.html\n`);
