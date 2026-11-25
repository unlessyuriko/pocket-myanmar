// Landing screen: the eight-day wheel. Pick your birth day; the choice is remembered and the pagoda page opens on it too.
import { DAYS, todayIndex } from "./days.js";
import { iconSvg } from "./icons.js";

const $ = (s) => document.querySelector(s);
const MM = "၀၁၂၃၄၅၆၇၈၉";
const mm = (n) => String(n).replace(/\d/g, (d) => MM[d]);
const wheel = $("#wheel");
if (wheel) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("mv.day")); } catch { /* ignore */ }
  const today = todayIndex();
  let sel = DAYS[saved] ? saved : today;
  const dots = DAYS.map((d, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "wd"; b.setAttribute("role", "radio");
    const a = (i / DAYS.length) * Math.PI * 2 - Math.PI / 2;
    b.style.setProperty("--x", Math.cos(a).toFixed(4));
    b.style.setProperty("--y", Math.sin(a).toFixed(4));
    b.setAttribute("aria-label", `${d.day}၊ ${d.animal}${i === today ? " (ဒီနေ့)" : ""}`);
    b.innerHTML = `${iconSvg(d.id)}${i === today ? '<i class="wd-today" aria-hidden="true"></i>' : ""}`;
    b.onclick = () => pick(i, true);
    wheel.append(b);
    return b;
  });

  function pick(i, save) {
    sel = i;
    const d = DAYS[i];
    dots.forEach((b, k) => b.setAttribute("aria-checked", String(k === i)));
    $("#hubEm").innerHTML = iconSvg(d.id);
    $("#hubAn").textContent = d.animal;
    $("#hubDay").textContent = `${d.day}နံ`;
    $("#pickHint").textContent = i === today ? "ဒီနေ့ သင့်နေ့နံ ဖြစ်ပါတယ်" : "သင့်နေ့နံ ရွေးပါ";
    if (save) { try { localStorage.setItem("mv.day", JSON.stringify(i)); } catch { /* private mode */ } }
  }
  pick(sel, false);

  // arrow keys move around the wheel
  wheel.addEventListener("keydown", (e) => {
    const k = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!k) return;
    e.preventDefault();
    const n = (sel + k + DAYS.length) % DAYS.length;
    pick(n, true); dots[n].focus();
  });

  // merit kept by the pagoda page, on this phone only
  try {
    const m = JSON.parse(localStorage.getItem("mv.merit"));
    if (m && m.total > 0) { const el = $("#merit"); el.textContent = `ကုသိုလ် ${mm(m.total)} · ဘုရားဖူးသည့်ရက် ${mm((m.days || []).length)}`; el.hidden = false; }
  } catch { /* ignore */ }
}
