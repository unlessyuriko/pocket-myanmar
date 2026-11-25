// The eight birth-day posts. Wednesday is split into morning and afternoon (Rahu), as in Myanmar.
export const DAYS = [
  { id: "mon", day: "တနင်္လာ", animal: "ကျား", emoji: "🐯" },
  { id: "tue", day: "အင်္ဂါ", animal: "ခြင်္သေ့", emoji: "🦁" },
  { id: "wed", day: "ဗုဒ္ဓဟူး", animal: "ဆင်", emoji: "🐘" },
  { id: "rahu", day: "ရာဟု", animal: "ဆင် (အစွယ်မဲ့)", emoji: "🐘" },
  { id: "thu", day: "ကြာသပတေး", animal: "ကြွက်", emoji: "🐭" },
  { id: "fri", day: "သောကြာ", animal: "ပူး", emoji: "🐹" },
  { id: "sat", day: "စနေ", animal: "နဂါး", emoji: "🐉" },
  { id: "sun", day: "တနင်္ဂနွေ", animal: "ဂဠုန်", emoji: "🦅" },
];

// Which of the eight posts is today? (JS: 0 = Sunday. Wednesday after noon is Rahu.)
export function todayIndex(d = new Date()) {
  const w = d.getDay();
  return w === 0 ? 7 : w === 3 ? (d.getHours() >= 12 ? 3 : 2) : w <= 2 ? w - 1 : w;
}
