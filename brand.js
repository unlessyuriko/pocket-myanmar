// MY Technomad branding, shared by both pages: the "Made by" footer on the start screen, the same line on the
// photo sheet, and the logo stamped on shared photos and videos.
// Fill in CONTACT_URL (mailto:, WhatsApp, Telegram, Facebook page...) and SITE_URL; the "Work with us" button
// and the logo link only appear once they are set.
export const BRAND = {
  name: "MY Technomad",
  SITE_URL: "",
  CONTACT_URL: "",
  // Where feedback is sent (a POST with JSON): FormSubmit emails it to the address in the URL and to FEEDBACK_CC.
  // The very first message makes FormSubmit email that address once to activate the form; click the link in it.
  // If this is empty the feedback button only shows on localhost, so nobody writes to nowhere.
  FEEDBACK_URL: "https://formsubmit.co/ajax/yepyaekyaw@outlook.com",
  FEEDBACK_CC: "maythuhan96@gmail.com",           // second inbox (FormSubmit "_cc")
};

const LOGO = "brand/mytechnomad-wide-dark.svg";
const SHOT = { sx: 0.07, sy: 0.2, sw: 0.86, sh: 0.6 };           // the logo file has clear space around it; this is the part with ink
export const LOGO_ASPECT = (SHOT.sw * 1630) / (SHOT.sh * 623);        // about 3.75

let logoImg = null;
export const SHARE_URL = () => `${location.origin}/`;
export function loadLogo() {
  if (!logoImg) {
    logoImg = new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);                                  // no logo, no stamp: never block the photo
      i.src = LOGO;
    });
  }
  return logoImg;
}

// Draw the logo (without its clear space) with its left edge at x and its vertical centre at cy, h pixels tall.
export function drawLogo(ctx, img, x, cy, h) {
  if (!img) return 0;
  const w = h * LOGO_ASPECT;
  ctx.drawImage(img, SHOT.sx * img.naturalWidth, SHOT.sy * img.naturalHeight, SHOT.sw * img.naturalWidth, SHOT.sh * img.naturalHeight, x, cy - h / 2, w, h);
  return w;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// "Made by [logo]" with an optional "Work with us" button; put into any container.
export function brandFooter() {
  const box = el("div", "made-by");
  const logo = `<img src="${LOGO}" alt="${BRAND.name}" class="mt-logo" width="120" height="32" />`;
  const link = BRAND.SITE_URL ? `<a href="${BRAND.SITE_URL}" target="_blank" rel="noopener" aria-label="${BRAND.name}">${logo}</a>` : logo;
  box.innerHTML = `<span class="mb-label">Crafted with <span class="heart" aria-label="love">❤️</span> by</span>${link}`;
  if (BRAND.CONTACT_URL) {
    const a = el("a", "btn ghost mb-cta", "Work with us");
    a.href = BRAND.CONTACT_URL; a.target = "_blank"; a.rel = "noopener";
    box.append(a);
  }
  return box;
}

// ---------- feedback ----------
const feedbackOn = () => !!BRAND.FEEDBACK_URL || /^(localhost|127.0.0.1)$/.test(location.hostname);
let feedbackSheet = null;
function openFeedback() {
  if (!feedbackSheet) {
    feedbackSheet = el("div", "sheet fb-sheet");
    feedbackSheet.setAttribute("role", "dialog"); feedbackSheet.setAttribute("aria-modal", "true"); feedbackSheet.setAttribute("aria-label", "အကြံပြုချက်");
    feedbackSheet.innerHTML = `
      <form class="sheet-card fb-card" novalidate>
        <h2 class="fb-title">သင့်အကြံပြုချက်</h2>
        <p class="fb-sub">ဘယ်လောက် နှစ်သက်ပါသလဲ?</p>
        <div class="fb-rate" role="radiogroup" aria-label="အဆင့်သတ်မှတ်ရန်">
          ${["😞","😕","🙂","😀","🤩"].map((e, i) => `<button type="button" role="radio" aria-checked="false" data-v="${i + 1}" aria-label="${i + 1} / 5">${e}</button>`).join("")}
        </div>
        <textarea name="message" rows="4" maxlength="1000" placeholder="ဘာတွေ ကောင်းပါသလဲ၊ ဘာတွေ ပြင်သင့်ပါသလဲ" aria-label="အကြံပြုချက်"></textarea>
        <input name="contact" type="text" maxlength="120" placeholder="ဆက်သွယ်ရန် (ဖုန်း / အီးမေးလ် · မဖြည့်လည်းရ)" aria-label="ဆက်သွယ်ရန်" autocomplete="off" />
        <input name="website" type="text" tabindex="-1" autocomplete="off" class="fb-hp" aria-hidden="true" />
        <p class="fb-note" role="status" aria-live="polite"></p>
        <div class="sheet-actions fb-actions">
          <button type="submit" class="btn primary">ပို့မယ်</button>
          <button type="button" class="btn ghost fb-close">ပိတ်မယ်</button>
        </div>
        <small class="fb-fine">ပို့မှသာ သင့်စာကို လက်ခံရရှိပါမယ်။ ကင်မရာပုံ မပါပါဘူး။</small>
      </form>`;
    document.body.append(feedbackSheet);
    const form = feedbackSheet.querySelector("form"), note = form.querySelector(".fb-note");
    let rating = 0;
    const close = () => { feedbackSheet.hidden = true; };
    form.querySelectorAll(".fb-rate button").forEach((btn) => btn.onclick = () => {
      rating = +btn.dataset.v;
      form.querySelectorAll(".fb-rate button").forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
    });
    form.querySelector(".fb-close").onclick = close;
    feedbackSheet.addEventListener("click", (e) => { if (e.target === feedbackSheet) close(); });
    feedbackSheet.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const message = form.message.value.trim();
      if (!rating && !message) { note.textContent = "အဆင့်ရွေးပါ ဒါမှမဟုတ် စာရေးပါ"; return; }
      if (form.website.value) { close(); return; }                       // a bot filled the hidden field
      if (!BRAND.FEEDBACK_URL) { note.textContent = "(စမ်းသပ်ချိန်: ပို့ရန်နေရာ မသတ်မှတ်ရသေးပါ)"; return; }
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true; note.textContent = "ပို့နေပါတယ်…";
      try {
        const r = await fetch(BRAND.FEEDBACK_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ _subject: "Myanmar Vibe feedback", _template: "table", _captcha: "false", ...(BRAND.FEEDBACK_CC ? { _cc: BRAND.FEEDBACK_CC } : {}), rating, message, contact: form.contact.value.trim(), page: location.pathname, screen: `${innerWidth}x${innerHeight}`, ua: navigator.userAgent.slice(0, 160), time: new Date().toISOString() }) });
        if (!r.ok) throw new Error(r.status);
        note.textContent = "ကျေးဇူးတင်ပါတယ်! 🙏"; form.reset(); rating = 0;
        form.querySelectorAll(".fb-rate button").forEach((x) => x.setAttribute("aria-checked", "false"));
        setTimeout(close, 1600);
      } catch { note.textContent = "မပို့နိုင်ပါ၊ နောက်မှ ပြန်ကြိုးစားပါ"; }
      btn.disabled = false;
    };
  }
  feedbackSheet.hidden = false;
  feedbackSheet.querySelector("textarea").focus();
}

export function mountBrand() {
  const card = document.querySelector(".intro-card");
  const intro = document.querySelector(".intro");
  if (intro) intro.append(brandFooter());                            // pinned to the bottom of the start screen
  const sheet = document.querySelector("#result .sheet-card");
  if (sheet) {
    const next = el("div", "sheet-next");
    const onPagoda = /pagoda/.test(location.pathname);
    const go = el("a", "btn ghost", onPagoda ? "သနပ်ခါး လိမ်းကြည့်မယ်" : "ဘုရားဖူးကြည့်မယ် 🙏");
    go.href = onPagoda ? "index.html" : "pagoda.html";
    next.append(go);
    sheet.append(next);
  }
  if (card && feedbackOn() && !/pagoda/.test(location.pathname)) {      // feedback lives on the main landing screen only
    const fb = el("button", "fb-open", "💬 အကြံပြုချက် ပေးမယ်");
    fb.type = "button"; fb.onclick = openFeedback;
    card.append(fb);
  }
}
