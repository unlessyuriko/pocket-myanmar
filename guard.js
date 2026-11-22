// Checks that run before the camera or 3D starts, shared by both pages:
// - social apps (Facebook, Messenger, Instagram, TikTok, Viber, LINE...) open links in their own mini browser,
//   which often blocks the camera and motion sensors. We say so and show how to open the page in the real browser.
// - a phone with no WebGL cannot show the pagoda at all.
const UA = navigator.userAgent || "";
export const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|musical_ly|Bytedance|TikTok|BytedanceWebview|Viber|Line\/|MicroMessenger|Snapchat|Telegram/i.test(UA);

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

function note(card, cls, html) {
  const d = document.createElement("div");
  d.className = `guard ${cls}`;
  d.setAttribute("role", "alert");
  d.innerHTML = html;
  card.prepend(d);
  return d;
}

export function showGuards({ needsWebGL = false } = {}) {
  const card = document.querySelector(".intro-card");
  if (!card) return { blocked: false };
  let blocked = false;
  if (needsWebGL && !hasWebGL()) {
    blocked = true;
    note(card, "bad", "ဒီဖုန်းနဲ့ browser မှာ 3D မပြနိုင်ပါ။ Chrome ဒါမှမဟုတ် Safari နဲ့ ပြန်ဖွင့်ကြည့်ပါ။");
  }
  if (IN_APP) {
    const d = note(card, "warn",
      `<b>Facebook / Messenger ထဲကနေ ဖွင့်ထားတာလား?</b><br>ကင်မရာ မရနိုင်ပါ။ ညာဘက်အပေါ်က <b>⋯</b> ကိုနှိပ်ပြီး <b>"Open in browser"</b> (Chrome / Safari) ကို ရွေးပါ။<br><button type="button" class="linkbtn">လင့်ခ် ကူးယူမယ်</button>`);
    d.querySelector("button").onclick = async (e) => {
      try { await navigator.clipboard.writeText(location.href); e.target.textContent = "ကူးပြီးပါပြီ ✓"; }
      catch { e.target.textContent = location.href; }
    };
  }
  return { blocked };
}
