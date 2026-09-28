export const W = 960;
export const H = 600;
export const BUCKET_MS = 9000;
export const GAME_MS = 12 * 60 * 1000;

export const ERAS = [
  { name: "Cellule", short: "La soupe primitive", target: 10, goal: "Absorbe 10 nutriments", marker: null, palette: ["#071c2f", "#174b61"] },
  { name: "Créature marine", short: "Les premières nageoires", target: 12, goal: "12 biomasses · rejoins la rive", marker: { x: 860, y: 300, label: "RIVE" }, palette: ["#082639", "#17627b"] },
  { name: "Animal terrestre", short: "Le grand air", target: 15, goal: "15 biomasses · trouve l'abri", marker: { x: 140, y: 480, label: "ABRI" }, palette: ["#193429", "#517348"] },
  { name: "Primate", short: "Des mains et des idées", target: 18, goal: "18 biomasses · 2 pierres · rejoins l'atelier", marker: { x: 745, y: 130, label: "ATELIER" }, palette: ["#223128", "#647447"] },
  { name: "Humain", short: "La nuit tombe", target: 0, goal: "3 branches · 2 pierres · allume le feu", marker: { x: 500, y: 310, label: "FOYER" }, palette: ["#20232e", "#634653"] },
] as const;

export const MUTATIONS = [
  [{ id: "speed", name: "Flagelle vif", detail: "Mobilité · +15 % de vitesse" }, { id: "combat", name: "Membrane vorace", detail: "Combat · +1 dégât aux ennemis" }, { id: "coop", name: "Signal chimique", detail: "Entraide · portée de don accrue" }],
  [{ id: "speed", name: "Nageoires souples", detail: "Mobilité · +15 % de vitesse" }, { id: "combat", name: "Mâchoire vive", detail: "Combat · +1 dégât aux ennemis" }, { id: "coop", name: "Banc solidaire", detail: "Entraide · partage renforcé" }],
  [{ id: "speed", name: "Pattes agiles", detail: "Mobilité · +15 % de vitesse" }, { id: "combat", name: "Griffes", detail: "Combat · +1 dégât aux ennemis" }, { id: "coop", name: "Instinct de meute", detail: "Entraide · portée de don accrue" }],
  [{ id: "speed", name: "Foulée longue", detail: "Mobilité · +15 % de vitesse" }, { id: "combat", name: "Outils de chasse", detail: "Combat · +1 dégât aux ennemis" }, { id: "coop", name: "Main tendue", detail: "Entraide · partage renforcé" }],
] as const;

export type ItemKind = "dna" | "wood" | "stone";
export type Item = { index: number; x: number; y: number; kind: ItemKind; bucket: number };

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function itemsFor(code: string, stage: number, bucket: number): Item[] {
  const count = stage === 4 ? 20 : 21;
  return Array.from({ length: count }, (_, index) => {
    const h = hash(`${code}:${stage}:${bucket}:${index}`);
    const v = hash(`${index}:${bucket}:${stage}:${code}:y`);
    let kind: ItemKind = "dna";
    if (stage === 3 && index >= 17) kind = "stone";
    if (stage === 4) kind = index % 5 < 3 ? "wood" : "stone";
    return { index, x: 66 + (h % 829), y: 61 + (v % 478), kind, bucket };
  });
}

export type Danger = { index: number; x: number; y: number; r: number };
export function dangersAt(stage: number, time: number): Danger[] {
  const t = time / 1000;
  return [
    { index: 0, x: 235 + Math.cos(t * 0.46 + stage) * 120, y: 205 + Math.sin(t * 0.72) * 100, r: 29 + stage * 2 },
    { index: 1, x: 720 + Math.sin(t * 0.43 + stage) * 115, y: 390 + Math.cos(t * 0.64) * 110, r: 29 + stage * 2 },
    { index: 2, x: 470 + Math.cos(t * 0.38 + 2) * 185, y: 100 + Math.sin(t * 0.51) * 38, r: 27 + stage * 2 },
    { index: 3, x: 490 + Math.sin(t * 0.44 + 3) * 185, y: 510 + Math.cos(t * 0.55) * 40, r: 32 + stage * 2 },
  ];
}

export function enemyMaxHp(stage: number) { return 16 + stage * 6; }
export function enemyPhase(time: number, index: number) { return (time + index * 650) % 2800; }

export function scoreFor(p: { stage: number; dna: number; wood: number; stone: number; challenge: number; boss_score?: number }) {
  return p.stage * 100 + (p.stage === 4 ? p.wood + p.stone : p.dna) + (p.challenge ? 20 : 0) + (p.boss_score ?? 0);
}

export function canEvolve(p: { stage: number; dna: number; stone: number; challenge: number }) {
  if (p.stage >= 4) return false;
  return p.dna >= ERAS[p.stage].target && (p.stage === 0 || !!p.challenge) && (p.stage !== 3 || p.stone >= 2);
}

export function speedFor(mutations: string) {
  const count = mutations.split(",").filter((m) => m === "speed").length;
  return 152 * Math.pow(1.15, count) * (count >= 2 ? 1.12 : 1);
}

export function pickupRadius(mutations: string) {
  return 30 + mutations.split(",").filter((m) => m === "reach").length * 16;
}
