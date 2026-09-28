"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { GameCanvas, PLAYER_GREENS, type GameView } from "@/components/game-canvas";
import { BUCKET_MS, canEvolve, ERAS, MUTATIONS, type Item } from "@/lib/game";

type LiveView = GameView & { receivedAt: number };
type PendingPickup = Item & { stage: number };

async function post<T = GameView>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Impossible de joindre le salon.");
  return data;
}

export default function Home() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [view, setView] = useState<LiveView | null>(null);
  const [pending, setPending] = useState<PendingPickup[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const ticking = useRef(false);
  const actionBusy = useRef(false);
  const inFlightTick = useRef<Promise<GameView | undefined> | null>(null);
  const accept = useCallback((raw: GameView) => setView((current) => current && current.now > raw.now ? current : { ...raw, receivedAt: Date.now() }), []);

  useEffect(() => {
    const fromUrl = (new URLSearchParams(location.search).get("room") ?? "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
    setName(localStorage.getItem("evo-name") ?? ""); setJoinCode(fromUrl);
    if (!fromUrl) return;
    const saved = sessionStorage.getItem(`evo-room-${fromUrl}`);
    if (!saved) return;
    fetch(`/api/game?code=${fromUrl}&token=${encodeURIComponent(saved)}`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error("session"); return r.json(); })
      .then((raw) => { setCode(fromUrl); setToken(saved); accept(raw as GameView); })
      .catch(() => sessionStorage.removeItem(`evo-room-${fromUrl}`));
  }, [accept]);

  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!code || !token || view?.status === "playing") return;
    const poll = async () => {
      try { const res = await fetch(`/api/game?code=${code}&token=${encodeURIComponent(token)}`, { cache: "no-store" }); if (res.ok) { accept(await res.json()); setError(""); } }
      catch { setError("Connexion interrompue. Nouvelle tentative en cours…"); }
    };
    const id = setInterval(poll, 1250); return () => clearInterval(id);
  }, [code, token, view?.status, accept]);

  const enter = useCallback(async (mode: "create" | "join", inputName: string, inputCode = "") => {
    const cleanName = inputName.trim();
    if (!cleanName) throw new Error("Choisis d'abord un pseudo.");
    const result = await post<{ code: string; token: string; state: GameView }>({ action: mode, name: cleanName, ...(mode === "join" ? { code: inputCode.toUpperCase() } : {}) });
    localStorage.setItem("evo-name", cleanName); sessionStorage.setItem(`evo-room-${result.code}`, result.token);
    history.replaceState({}, "", `/?room=${result.code}`);
    setCode(result.code); setJoinCode(result.code); setToken(result.token); accept(result.state); setError("");
    return { roomCode: result.code, status: result.state.status };
  }, [accept]);

  const submit = async (mode: "create" | "join") => {
    setBusy(true); setError("");
    try { await enter(mode, name, joinCode); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de rejoindre le salon."); }
    finally { setBusy(false); }
  };
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!code || !token) return;
    setBusy(true); setError("");
    try { accept(await post({ action, code, token, ...extra })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Réessaie dans un instant."); }
    finally { setBusy(false); }
  };
  const collect = useCallback((item: Item, stage: number) => {
    setPending((before) => before.some((p) => p.bucket === item.bucket && p.stage === stage && p.index === item.index)
      ? before : [...before, { ...item, stage }]);
  }, []);
  const tick = useCallback(async (x: number, y: number, pickups: number[], contacts: { index: number; x: number; y: number }[], bucket: number, stage: number) => {
    if (ticking.current || actionBusy.current || !code || !token) return;
    ticking.current = true;
    const request = post<GameView>({ action: "tick", code, token, x, y, pickups, contacts, bucket });
    inFlightTick.current = request;
    try {
      const raw = await request;
      accept(raw);
      const currentStage = raw.players.find((player) => player.id === raw.meId)?.stage;
      setPending((before) => before.filter((p) => p.bucket >= raw.bucket && p.stage === currentStage
        && !(p.bucket === bucket && p.stage === stage && pickups.includes(p.index) && raw.bucket === bucket && raw.taken.includes(p.index))));
      setError("");
      return raw;
    }
    catch { setError("Connexion interrompue. Reconnexion en cours…"); }
    finally { ticking.current = false; inFlightTick.current = null; }
  }, [code, token, accept]);
  const combat = useCallback(async (action: "attack" | "trap" | "gift", extra: Record<string, unknown> = {}) => {
    if (actionBusy.current || !code || !token) return;
    actionBusy.current = true;
    try {
      await inFlightTick.current?.catch(() => {});
      accept(await post({ action, code, token, ...extra }));
      setError("");
    } catch { setError("Action indisponible. Réessaie."); }
    finally { actionBusy.current = false; }
  }, [code, token, accept]);

  useEffect(() => {
    type Context = { registerTool: (tool: unknown, options: { signal: AbortSignal }) => Promise<void> | void };
    const context = (document as Document & { modelContext?: Context }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: "create_evolution_game_room", title: "Créer un salon",
        description: "Crée un salon de jeu avec le pseudo donné et affiche son code.",
        inputSchema: { type: "object", properties: { playerName: { type: "string", minLength: 1, maxLength: 18 } }, required: ["playerName"], additionalProperties: false },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          const playerName = (input as { playerName?: unknown })?.playerName;
          if (typeof playerName !== "string" || !playerName.trim()) throw new Error("Un pseudo est requis.");
          return enter("create", playerName);
        },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: "join_evolution_game_room", title: "Rejoindre un salon",
        description: "Rejoint un salon de jeu avec son code à six caractères et un pseudo.",
        inputSchema: { type: "object", properties: { roomCode: { type: "string", minLength: 6, maxLength: 6 }, playerName: { type: "string", minLength: 1, maxLength: 18 } }, required: ["roomCode", "playerName"], additionalProperties: false },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          const { roomCode, playerName } = (input ?? {}) as { roomCode?: unknown; playerName?: unknown };
          if (typeof roomCode !== "string" || !/^[A-Z2-9]{6}$/i.test(roomCode) || typeof playerName !== "string" || !playerName.trim()) throw new Error("Un code et un pseudo valides sont requis.");
          return enter("join", playerName, roomCode);
        },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => {});
    return () => lifecycle.abort();
  }, [enter]);

  const me = view?.players.find((p) => p.id === view.meId);
  const ranking = useMemo(() => [...(view?.players ?? [])].sort((a, b) => b.score - a.score), [view]);
  const ready = !!(view?.status === "playing" && me && canEvolve(me));
  const remaining = view?.endsAt ? Math.max(0, Math.min(720, Math.ceil((view.endsAt - (clock + view.now - view.receivedAt)) / 1000))) : 0;
  const timer = `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;
  const target = me?.stage === 4 ? 5 : me ? ERAS[me.stage].target : 0;
  const activeBucket = view ? Math.floor((clock + view.now - view.receivedAt) / BUCKET_MS) : -1;
  const unconfirmed = pending.filter((p) => p.stage === me?.stage && p.bucket === activeBucket && !(view?.bucket === p.bucket && view.taken.includes(p.index)));
  const dna = Math.min(ERAS[me?.stage ?? 0].target, (me?.dna ?? 0) + unconfirmed.filter((p) => p.kind === "dna").length);
  const wood = Math.min(3, (me?.wood ?? 0) + unconfirmed.filter((p) => p.kind === "wood").length);
  const stone = Math.min(2, (me?.stone ?? 0) + unconfirmed.filter((p) => p.kind === "stone").length);
  const amount = me?.stage === 4 ? wood + stone : dna;
  const projectedScore = (me?.score ?? 0) + (me?.stage === 4 ? wood - (me?.wood ?? 0) + stone - (me?.stone ?? 0) : dna - (me?.dna ?? 0));
  const colorOf = (id: string) => PLAYER_GREENS[Math.max(0, view?.players.findIndex((player) => player.id === id) ?? 0) % PLAYER_GREENS.length];
  const paths = [
    { id: "speed", name: "Mobilité", bonus: "Élan : +12 % de vitesse" },
    { id: "combat", name: "Combat", bonus: "Attaques plus fortes et rapides" },
    { id: "coop", name: "Entraide", bonus: "Tes dons protègent un allié" },
  ];
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/?room=${code}`); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Copie indisponible : partage simplement le code du salon."); }
  };

  return <main className={`app-shell screen-${!view ? "menu" : view.status} era-${me?.stage ?? 0}`}>
    <header className="app-header"><div className="brand"><span className="brand-mark"><span /></span><span>DE LA CELLULE <em>AU FEU</em></span></div>
      <div className="header-right">
        {!view ? <div className="header-tip"><b>ASTUCE 01</b><span>Les points verts font grandir ta cellule.</span></div> : <div className="header-room"><span>SALON</span><strong>{code}</strong></div>}
        <Button type="button" variant="outline" className="rules-trigger" onClick={() => setRulesOpen(true)}>Règles</Button>
      </div>
    </header>

    {!view ? <section className="entry-grid" aria-labelledby="entry-title">
      <div className="entry-story"><div className="eyebrow">UN MONDE · CINQ ÈRES</div>
        <h1 id="entry-title">DE LA CELLULE<br /><i>AU FEU</i></h1>
        <p>Une course à l’évolution. De 2 à 8 joueurs, chacun sur son écran.</p>
        <div className="era-preview" aria-label="Les cinq ères">{ERAS.map((era, i) =>
          <div className="era-preview-item" key={era.name}><span className={`pixel-icon pixel-era-${i}`} aria-hidden="true" /><b>{String(i + 1).padStart(2, "0")}</b><span>{era.name}</span></div>
        )}</div>
      </div>
      <div className="entry-panel"><label htmlFor="player-name">TON PSEUDO</label><Input id="player-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 18))} placeholder="Entre ton pseudo" maxLength={18} autoComplete="nickname" />
        <Button className="action-primary play-button" disabled={busy} onClick={() => void submit("create")}><span className="play-triangle">▶</span> JOUER</Button>
        <div className="entry-divider"><span>REJOINDRE UN SALON</span></div>
        <div className="join-row"><Input id="room-code" aria-label="Code du salon" className="code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} placeholder="ABC234" maxLength={6} autoCapitalize="characters" />
          <Button className="action-secondary" disabled={busy || joinCode.length !== 6} onClick={() => void submit("join")}>Rejoindre &gt;</Button></div>
        <p className="entry-foot">Aucun compte · 12 minutes maximum</p>
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
    </section> : view.status === "lobby" ? <section className="lobby-layout">
      <div className="lobby-main"><div className="eyebrow">SALON OUVERT</div><h1>Rassemble<br /><i>ton espèce.</i></h1>
        <p>Partage ce code. Dès que tout le monde est là, lance la course.</p>
        <div className="invite-box"><div><span>CODE DU SALON</span><strong>{code}</strong></div><Button onClick={() => void copy()} variant="outline">{copied ? "Copié" : "Copier le lien"}</Button></div>
        <div className="lobby-actions">{view.isHost ? <Button className="action-primary play-button" disabled={busy || view.players.length < 2} onClick={() => void act("start")}><span className="play-triangle">▶</span> LANCER</Button> : <span className="waiting"><span className="pulse-dot" /> L'hôte va lancer la partie…</span>}
          {view.isHost && view.players.length < 2 && <span className="muted-note">Encore 1 joueur nécessaire.</span>}</div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
      <aside className="lobby-side"><div className="side-heading">JOUEURS <span>{view.players.length}/8</span></div>
        <div className="lobby-players">{view.players.map((p) => <div className="lobby-player" key={p.id}><span className="player-orb" style={{ background: colorOf(p.id) }} />{p.name}{p.id === view.meId && <small>TOI</small>}</div>)}</div>
      </aside>
    </section> : view.status === "playing" && me ? <section className="play-layout">
      <div className="play-grid"><div className="stage-surface"><GameCanvas state={view} onTick={tick} onCollect={collect} onAction={(action, extra) => void combat(action, extra)} paused={ready} /></div>
        <div className="play-topline"><div className="era-title"><span className="era-emblem"><span className={`pixel-icon pixel-era-${me.stage}`} aria-hidden="true" /></span><div><span className="eyebrow">ÈRE {me.stage + 1} / 5 <span className="era-room">· SALON {code}</span></span><h1>{ERAS[me.stage].name}</h1></div></div><div className="time-box"><span>TEMPS <span className="time-restant">RESTANT</span></span><strong>{timer}</strong></div><Button type="button" variant="outline" className="rules-trigger" aria-label="Règles" onClick={() => setRulesOpen(true)}>Règles</Button></div>
        <aside className="play-sidebar"><div className="objective-card"><div className="side-heading">OBJECTIF</div><h2>{ERAS[me.stage].goal}</h2>
          <div className="progress-line"><span>{me.stage === 4 ? "Matériaux" : "Biomasse"}</span><b>{amount}/{target}</b></div><Progress value={target ? Math.min(100, amount / target * 100) : 0} className="game-progress" />
          {me.stage === 3 && <div className="resource-note">Pierres : {stone}/2</div>}
          {me.stage === 4 && <div className="resource-note">Branches {wood}/3 · Pierres {stone}/2</div>}
          {me.stage > 0 && me.stage < 4 && me.dna >= target && (me.stage !== 3 || me.stone >= 2) && !me.challenge && <div className="goal-hint">Va vers le cercle lumineux sur la carte.</div>}
          {me.shield > 0 && <div className="shield-note">Protection disponible</div>}
          {me.protectedUntil > (view.now + clock - view.receivedAt) && <div className="shield-note">Protégé après le combat</div>}
          <details className="build-tree"><summary>TON ÉVOLUTION</summary>
            {paths.map((path) => {
              const count = me.mutations.split(",").filter((m) => m === path.id).length;
              return <div className="build-path" key={path.id}><span>{path.name}</span><b>{"●".repeat(count)}{"○".repeat(4 - count)}</b>{count >= 2 && <small>{path.bonus}</small>}</div>;
            })}
          </details>
        </div><div className={`score-card ${scoreOpen ? "expanded" : ""}`}><button type="button" className="score-toggle" aria-expanded={scoreOpen} onClick={() => setScoreOpen((open) => !open)}>CLASSEMENT <span>{view.players.length} JOUEURS</span></button>
          <div className="score-rows">{ranking.map((p, i) => <div className={`score-row ${p.id === me.id ? "mine" : ""}`} key={p.id}><b>{String(i + 1).padStart(2, "0")}</b><span className="player-orb" style={{ background: colorOf(p.id) }} /><span className="score-name">{p.name}<small>{ERAS[p.stage].name}</small></span><strong>{p.id === me.id ? projectedScore : p.score}</strong></div>)}</div>
        </div></aside></div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <Dialog open={ready} onOpenChange={() => {}}><DialogContent showCloseButton={false} className={`mutation-dialog era-${me.stage}`} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader><div className="eyebrow">ÉVOLUTION DISPONIBLE</div><DialogTitle>Choisis ta prochaine mutation</DialogTitle><DialogDescription>Tu vas devenir {ERAS[Math.min(me.stage + 1, 4)].name.toLowerCase()}. Mélange les trois voies ou prends deux fois la même pour débloquer sa spécialisation.</DialogDescription></DialogHeader>
        <div className="mutation-options">{MUTATIONS[me.stage]?.map((m) => <Button key={m.name} variant="outline" disabled={busy} onClick={() => void act("evolve", { mutation: m.id })}><span><strong>{m.name}</strong><small>{m.detail}</small></span><b aria-hidden="true">&gt;</b></Button>)}</div>
      </DialogContent></Dialog>
    </section> : <section className="result-layout"><div className="result-card"><div className="eyebrow">LA COURSE EST TERMINÉE</div>
      <h1>{view.winnerId === view.meId ? "Le feu est à toi." : "Le feu a été allumé."}</h1><p>{view.winnerId ? `${view.players.find((p) => p.id === view.winnerId)?.name ?? "Un joueur"} remporte la partie.` : "Voici le classement final."}</p>
      <div className="result-ranking">{ranking.map((p, i) => <div key={p.id} className={`result-row ${p.id === view.winnerId ? "champion" : ""}`}><b>{i + 1}</b><span className="player-orb" style={{ background: colorOf(p.id) }} /><strong>{p.name}</strong><span>{ERAS[p.stage].name}</span><em>{p.score} pts</em></div>)}</div>
      {view.isHost ? <Button className="action-primary" disabled={busy} onClick={() => void act("rematch")}>Rejouer dans ce salon &gt;</Button> : <p className="waiting"><span className="pulse-dot" /> L'hôte peut relancer une partie.</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </div></section>}
    <Dialog open={rulesOpen} onOpenChange={setRulesOpen}><DialogContent className={`rules-dialog era-${me?.stage ?? 0}`}><DialogHeader><div className="eyebrow">MODE D’EMPLOI</div><DialogTitle>Les règles du jeu</DialogTitle><DialogDescription>Une course à l’évolution pour 2 à 8 joueurs.</DialogDescription></DialogHeader>
      <div className="rules-content"><div><strong>01 / GRANDIR</strong><p>Ramasse la biomasse verte. Atteins l’objectif de chaque ère, rejoins son repère et choisis une mutation : mobilité, combat ou entraide.</p></div>
        <div><strong>02 / SURVIVRE ENSEMBLE</strong><p>Quatre ennemis parcourent chaque ère. Attaque-les pour réduire leur vie. Les joueurs ayant participé à leur défaite gagnent des ressources, 10 secondes de protection et 10 points, dans la limite de 30 par ère.</p></div>
        <div><strong>03 / GAGNER</strong><p>Attaque un rival pour lui faire perdre une ressource, pose un piège pour le ralentir ou donne une ressource à un allié. Le premier humain à allumer le feu gagne. Après 12 minutes, le score départage les joueurs.</p></div>
        <div><strong>COMMANDES</strong><p>Flèches ou ZQSD pour bouger · E pour attaquer · R pour poser un piège · F pour donner. Sur téléphone : joystick et boutons.</p></div></div>
    </DialogContent></Dialog>
  </main>;
}
