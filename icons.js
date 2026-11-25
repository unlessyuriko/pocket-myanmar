// Illustrated gold emblems for the eight birth-day animals, the thanakha log and the pagoda (icons/*.webp, 192px, transparent).
const FILE = { mon: "tiger", tue: "lion", wed: "wed", rahu: "rahu", thu: "rat", fri: "gp", sat: "naga", sun: "garuda", log: "log", pagoda: "pagoda" };
export const iconUrl = (id) => `icons/${FILE[id] || id}.webp`;
export const iconSvg = (id, cls = "") =>
  `<img class="ico ${cls}" src="${iconUrl(id)}" alt="" width="96" height="96" decoding="async" draggable="false" />`;
