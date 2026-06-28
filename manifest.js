/* ==========================================================
   Game registry — the single source of truth for the hub.
   Add a game by appending one object. Nothing else changes.

   Loaded as a plain script (not JSON) so the hub works on file://
   with no server. Swap to fetched JSON later if you ever want pure data.
   ========================================================== */

window.GAMES = [
  {
    id: "bullseye",                                       // also the hash route: #bullseye
    title: "Bullseye",
    blurb: "Aim trainer · timed + tracking",
    url: "https://cjcrump.github.io/bullseye-aim-trainer/", // GitHub Pages URL
    thumb: "assets/thumbs/bullseye.svg",
    tags: ["aim", "fps"],
    fit: "fill",                                          // "fill" | "16:9" | "4:3"
  },
  {
    id: "lightsnake",
    title: "Light Snake",
    blurb: "Neon dragon · eat the orbs",
    url: "https://cjcrump.github.io/snake/",
    thumb: "assets/thumbs/lightsnake.svg",
    tags: ["arcade", "snake"],
    fit: "fill",
  },
];

/* Lookup helpers (kept here so views/bridge don't each rebuild them). */
window.Hub = window.Hub || {};
Hub.games = {
  all: () => window.GAMES,
  byId: (id) => window.GAMES.find((g) => g.id === id) || null,
  index: (id) => window.GAMES.findIndex((g) => g.id === id),
  originOf: (id) => {
    const g = Hub.games.byId(id);
    try { return g ? new URL(g.url).origin : null; } catch { return null; }
  },
};