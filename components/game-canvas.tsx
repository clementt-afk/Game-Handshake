"use client";

import { useEffect, useRef, useState } from "react";
import { BUCKET_MS, dangersAt, ERAS, H, itemsFor, pickupRadius, speedFor, W, type Item } from "@/lib/game";
import { drawScene, type AttackEffect } from "./pixel-scene";

export type PlayerView = {
  id: string; name: string; color: string; stage: number; dna: number; wood: number; stone: number;
  challenge: number; x: number; y: number; mutations: string; shield: number;
  stunnedUntil: number; score: number;
  slowedUntil: number; protectedUntil: number; lastAttack: number; lastTrap: number;
  lastGift: number; bossScore: number;
};
export type GameView = {
  now: number; bucket: number; taken: number[]; code: string; meId: string; isHost: boolean;
  status: "lobby" | "playing" | "done"; endsAt: number | null; winnerId: string | null;
  players: PlayerView[];
  enemies: { index: number; hp: number; maxHp: number; respawnUntil: number }[];
  traps: { id: string; x: number; y: number; ownerId: string }[];
  receivedAt?: number;
};

export const PLAYER_GREENS = ["#d4f27a", "#62e6a5", "#93ca62", "#9df1d6", "#c1df80", "#5fcb87", "#b8f0a5", "#78b889"];

function serverTime(view: GameView) { return Date.now() + view.now - (view.receivedAt ?? Date.now()); }

export function GameCanvas({ state, onTick, onCollect, onAction, paused }: {
  state: GameView;
  onTick: (x: number, y: number, pickups: number[], contacts: { index: number; x: number; y: number }[], bucket: number, stage: number) => Promise<GameView | undefined>;
  onCollect: (item: Item, stage: number) => void;
  onAction: (action: "attack" | "trap" | "gift", extra?: Record<string, unknown>) => void;
  paused: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state); stateRef.current = state;
  const tickRef = useRef(onTick); tickRef.current = onTick;
  const collectRef = useRef(onCollect); collectRef.current = onCollect;
  const actionRef = useRef(onAction); actionRef.current = onAction;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const initial = state.players.find((player) => player.id === state.meId);
  const pos = useRef({ x: initial?.x ?? 0, y: initial?.y ?? 0, stage: initial?.stage ?? -1 });
  const camera = useRef({ x: W / 2, stage: -1 });
  const remote = useRef(new Map<string, { x: number; y: number; stage: number }>());
  const collected = useRef({ bucket: -1, stage: -1, indices: new Set<number>(), contacts: new Map<number, { index: number; x: number; y: number }>() });
  const keys = useRef(new Set<string>());
  const joy = useRef({ x: 0, y: 0 });
  const attackFx = useRef<AttackEffect | null>(null);
  const attackSent = useRef(0);
  const pad = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const triggerAction = (action: "attack" | "trap" | "gift") => {
    if (pausedRef.current) return;
    const view = stateRef.current;
    const self = view.players.find((p) => p.id === view.meId);
    if (!self) return;
    const position = { x: pos.current.x, y: pos.current.y };
    if (action !== "attack") { actionRef.current(action, position); return; }
    const now = serverTime(view);
    const cooldown = self.mutations.split(",").filter((m) => m === "combat").length >= 2 ? 1200 : 1700;
    if (now < self.lastAttack + cooldown || performance.now() < attackSent.current) return;
    const candidates = [
      ...dangersAt(self.stage, now).filter((d) => (view.enemies.find((e) => e.index === d.index)?.hp ?? 1) > 0)
        .map((d) => ({ type: "enemy", id: String(d.index), x: d.x, y: d.y, range: d.r + 76, distance: Math.hypot(d.x - pos.current.x, d.y - pos.current.y) })),
      ...view.players.filter((p) => p.id !== self.id && p.stage === self.stage)
        .map((p) => ({ type: "player", id: p.id, x: p.x, y: p.y, range: 95, distance: Math.hypot(p.x - pos.current.x, p.y - pos.current.y) })),
    ].filter((candidate) => candidate.distance <= candidate.range)
      .sort((a, b) => Number(a.type === "player") - Number(b.type === "player") || a.distance - b.distance);
    if (candidates[0]) {
      attackSent.current = performance.now() + 300;
      attackFx.current = { fromX: position.x, fromY: position.y, x: candidates[0].x, y: candidates[0].y, started: performance.now() };
      actionRef.current("attack", { ...position, targetType: candidates[0].type, targetId: candidates[0].id });
    }
  };
  const actionTriggerRef = useRef(triggerAction); actionTriggerRef.current = triggerAction;

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "z", "q", "s", "d", "w", "a", "e", "r", "f"].includes(event.key.toLowerCase())) event.preventDefault();
      if (event.key.toLowerCase() === "e") actionTriggerRef.current("attack");
      if (!event.repeat && event.key.toLowerCase() === "r") actionTriggerRef.current("trap");
      if (!event.repeat && event.key.toLowerCase() === "f") actionTriggerRef.current("gift");
      keys.current.add(event.key.toLowerCase());
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clear); };
  }, []);

  useEffect(() => {
    let frame = 0, last = performance.now();
    const render = (now: number) => {
      const view = stateRef.current;
      const self = view.players.find((p) => p.id === view.meId);
      if (self && canvas.current) {
        if (pos.current.stage !== self.stage) pos.current = { x: self.x, y: self.y, stage: self.stage };
        const dt = Math.min((now - last) / 1000, 0.1);
        let dx = joy.current.x, dy = joy.current.y;
        if (keys.current.has("arrowleft") || keys.current.has("a") || keys.current.has("q")) dx -= 1;
        if (keys.current.has("arrowright") || keys.current.has("d")) dx += 1;
        if (keys.current.has("arrowup") || keys.current.has("w") || keys.current.has("z")) dy -= 1;
        if (keys.current.has("arrowdown") || keys.current.has("s")) dy += 1;
        const magnitude = Math.hypot(dx, dy);
        if (magnitude && !pausedRef.current && self.stunnedUntil <= serverTime(view)) {
          const speed = speedFor(self.mutations) * (self.slowedUntil > serverTime(view) ? 0.55 : 1);
          pos.current.x = Math.max(24, Math.min(W - 24, pos.current.x + dx / Math.max(1, magnitude) * speed * dt));
          pos.current.y = Math.max(24, Math.min(H - 24, pos.current.y + dy / Math.max(1, magnitude) * speed * dt));
        }
        const time = serverTime(view);
        for (const other of view.players) if (other.id !== self.id) {
          const point = remote.current.get(other.id);
          const blend = point?.stage === other.stage ? Math.min(1, dt * 9) : 1;
          remote.current.set(other.id, { x: point ? point.x + (other.x - point.x) * blend : other.x,
            y: point ? point.y + (other.y - point.y) * blend : other.y, stage: other.stage });
        }
        const bucket = Math.floor(time / BUCKET_MS);
        if (collected.current.bucket !== bucket || collected.current.stage !== self.stage)
          collected.current = { bucket, stage: self.stage, indices: new Set<number>(), contacts: new Map() };
        if (!pausedRef.current && self.stunnedUntil <= time) {
          const taken = bucket === view.bucket ? new Set(view.taken) : new Set<number>();
          const items = itemsFor(view.code, self.stage, bucket);
          const held = { dna: self.dna, wood: self.wood, stone: self.stone };
          for (const item of items) if (collected.current.indices.has(item.index) && !taken.has(item.index)) held[item.kind]++;
          for (const item of items) {
            if (!taken.has(item.index) && !collected.current.indices.has(item.index)
              && held[item.kind] < (item.kind === "dna" ? ERAS[self.stage].target : item.kind === "wood" ? 3 : 2)
              && Math.hypot(item.x - pos.current.x, item.y - pos.current.y) < pickupRadius(self.mutations)) {
              collected.current.indices.add(item.index);
              collected.current.contacts.set(item.index, { index: item.index, x: pos.current.x, y: pos.current.y });
              held[item.kind]++;
              collectRef.current(item, self.stage);
            }
          }
        }
        const context = canvas.current.getContext("2d");
        if (context) drawScene(context, canvas.current, view, pos.current, time, collected.current.indices, camera.current, remote.current, dt, attackFx.current, now);
      }
      last = now; frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const view = stateRef.current;
      const me = view.players.find((p) => p.id === view.meId);
      if (!me || pausedRef.current || pos.current.stage !== me.stage) return;
      const bucket = Math.floor(serverTime(view) / BUCKET_MS);
      const taken = bucket === view.bucket ? new Set(view.taken) : new Set<number>();
      const pickups = collected.current.bucket === bucket && collected.current.stage === me.stage
        ? [...collected.current.indices].filter((index) => !taken.has(index)).slice(0, 8) : [];
      const contacts = pickups.flatMap((index) => {
        const contact = collected.current.contacts.get(index);
        return contact ? [contact] : [];
      });
      void tickRef.current(pos.current.x, pos.current.y, pickups, contacts, bucket, me.stage).then((reply) => {
        if (!reply || collected.current.bucket !== bucket || collected.current.stage !== me.stage) return;
        if (reply.bucket !== bucket) collected.current = { bucket: -1, stage: -1, indices: new Set(), contacts: new Map() };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pad.current) return;
    const rect = pad.current.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.32);
    const y = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.32);
    const length = Math.max(1, Math.hypot(x, y));
    joy.current = { x: x / length, y: y / length }; setStick(joy.current);
  };
  const stop = () => { joy.current = { x: 0, y: 0 }; setStick({ x: 0, y: 0 }); };
  const me = state.players.find((p) => p.id === state.meId);
  const time = serverTime(state);
  const attackWait = me ? Math.max(0, me.lastAttack + (me.mutations.split(",").filter((m) => m === "combat").length >= 2 ? 1200 : 1700) - time) : 0;
  const trapWait = me ? Math.max(0, me.lastTrap + 15000 - time) : 0;
  const giftWait = me ? Math.max(0, me.lastGift + 2000 - time) : 0;
  const targetNear = !!me && (state.players.some((p) => p.id !== me.id && p.stage === me.stage && Math.hypot(p.x - pos.current.x, p.y - pos.current.y) < 95)
    || dangersAt(me.stage, time).some((d) => (state.enemies.find((e) => e.index === d.index)?.hp ?? 1) > 0
      && Math.hypot(d.x - pos.current.x, d.y - pos.current.y) < d.r + 76));
  const friendNear = !!me && state.players.some((p) => p.id !== me.id && p.stage === me.stage
    && Math.hypot(p.x - pos.current.x, p.y - pos.current.y) < 74 + me.mutations.split(",").filter((m) => m === "coop").length * 24);

  return <div className="game-board">
    <canvas ref={canvas} aria-label="Terrain de jeu : déplace-toi pour récolter des ressources et éviter les dangers" />
    <div ref={pad} className="joystick" role="group" aria-label="Contrôle tactile du déplacement"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointerMove(event); }}
      onPointerMove={(event) => { if (event.buttons) pointerMove(event); }}
      onPointerUp={stop} onPointerCancel={stop}>
      <span style={{ transform: `translate(${stick.x * 27}px, ${stick.y * 27}px)` }} />
    </div>
    {(paused || (me && me.stunnedUntil > serverTime(state) - 1800)) && <div className="board-tip">{paused ? "Jeu en pause" : "Prédateur : jusqu'à 3 ressources perdues"}</div>}
    <div className="combat-controls">
      <button type="button" disabled={paused || !targetNear || attackWait > 0} title={targetNear ? "Attaque l'ennemi ou le joueur le plus proche" : "Approche-toi d'une cible"} onClick={() => triggerAction("attack")}>Attaquer {attackWait > 0 ? `${Math.ceil(attackWait / 1000)}s` : <kbd>E</kbd>}</button>
      <button type="button" disabled={paused || trapWait > 0} title="Piège visible : ralentit le prochain rival" onClick={() => triggerAction("trap")}>Piège {trapWait > 0 ? `${Math.ceil(trapWait / 1000)}s` : <kbd>R</kbd>}</button>
      <button type="button" disabled={paused || !friendNear || giftWait > 0} title={friendNear ? "Donne une ressource au joueur le plus proche" : "Approche-toi d'un joueur"} onClick={() => triggerAction("gift")}>Donner {giftWait > 0 ? `${Math.ceil(giftWait / 1000)}s` : <kbd>F</kbd>}</button>
    </div>
  </div>;
}
