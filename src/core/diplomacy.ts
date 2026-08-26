/**
 * Diplomacy. Bots weigh an offer on three things: how much they like you, how
 * much their personality wants a deal at all, and whether you are strong enough
 * to be worth not fighting. There is no random roll in the decision, so the
 * same offer in the same position always gets the same answer.
 */
import {
  DIPLOMATIC_APPETITE,
  MAX_BOT_TREATIES,
  OPINION,
  type Stance,
  type TreatyKind,
} from '../data/diplomacy';
import { STRATEGIES } from '../ai/strategies';
import { isRare } from '../data/resources';
import { logEvent } from './events';
import { playerMilitaryPower } from './combat';
import { playerById } from './gameState';
import { spend, grantMany } from './resources';
import type { MatchPlayer, MatchState, PlayerId } from './types';
import type { ResourceCost } from '../data/troops';

export function initRelations(state: MatchState): void {
  for (const player of state.players) {
    player.relations = {};
    for (const other of state.players) {
      if (other.id === player.id) continue;
      player.relations[other.id] = { stance: 'neutral', opinion: 0 };
    }
  }
}

export function relationOf(
  player: MatchPlayer,
  otherId: PlayerId,
): { stance: Stance; opinion: number } {
  return player.relations[otherId] ?? { stance: 'neutral', opinion: 0 };
}

export function stanceBetween(state: MatchState, a: PlayerId, b: PlayerId): Stance {
  const player = state.players.find((p) => p.id === a);
  return player ? relationOf(player, b).stance : 'neutral';
}

/** True when `a` is bound by a treaty not to attack `b`. */
export function isBoundNotToAttack(state: MatchState, a: PlayerId, b: PlayerId): boolean {
  const stance = stanceBetween(state, a, b);
  return stance === 'nonAggression' || stance === 'alliance';
}

export function adjustOpinion(
  state: MatchState,
  fromId: PlayerId,
  aboutId: PlayerId,
  delta: number,
): void {
  const player = state.players.find((p) => p.id === fromId);
  if (!player || fromId === aboutId) return;
  const relation = relationOf(player, aboutId);
  relation.opinion = Math.max(
    OPINION.min,
    Math.min(OPINION.max, relation.opinion + delta),
  );
  player.relations[aboutId] = relation;
}

function setStance(state: MatchState, a: PlayerId, b: PlayerId, stance: Stance): void {
  const playerA = state.players.find((p) => p.id === a);
  const playerB = state.players.find((p) => p.id === b);
  if (!playerA || !playerB) return;
  playerA.relations[b] = { ...relationOf(playerA, b), stance };
  playerB.relations[a] = { ...relationOf(playerB, a), stance };
}

/** Goodwill a tribute is worth, weighted so rare resources really count. */
export function tributeValue(resources: ResourceCost): number {
  let value = 0;
  for (const [key, amount] of Object.entries(resources)) {
    if (!amount) continue;
    value += isRare(key) ? amount * OPINION.onTributeRare : amount * OPINION.onTribute;
  }
  return value;
}

export interface TreatyVerdict {
  accepted: boolean;
  reason: string;
  /** Opinion the responder holds after the offer is weighed. */
  opinion: number;
}

/**
 * Decides whether `to` accepts a treaty from `from`. Deterministic: the same
 * board state always yields the same answer, which is what lets a player learn
 * how to actually win someone over.
 */
export function evaluateTreaty(
  state: MatchState,
  fromId: PlayerId,
  toId: PlayerId,
  kind: TreatyKind,
): TreatyVerdict {
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  const relation = relationOf(to, fromId);

  const appetite = to.personality ? DIPLOMATIC_APPETITE[to.personality] : 1;
  const required = OPINION.requiredFor[kind];

  // A human's diplomatic centre makes every bot a little more receptive.
  const pressure = from.isHuman ? from.loadout.diplomacyPressure * 60 : 0;

  // Nobody signs with someone they are visibly losing to being aggressive at.
  const theirPower = playerMilitaryPower(state, toId);
  const yourPower = playerMilitaryPower(state, fromId);
  const ratio = theirPower > 0 ? yourPower / theirPower : 2;
  // Being strong helps a non-aggression pact (they fear you) but hurts an
  // alliance (they suspect you do not need them).
  const powerTerm = kind === 'nonAggression' ? Math.min(15, (ratio - 1) * 12) : -Math.min(15, (ratio - 1) * 10);

  const score = (relation.opinion + pressure + powerTerm) * appetite;

  if (relation.stance === 'war' && kind === 'alliance') {
    return { accepted: false, reason: 'No se alia con quien esta en guerra con el', opinion: relation.opinion };
  }
  if (relation.stance === kind) {
    return { accepted: false, reason: 'Ese acuerdo ya esta firmado', opinion: relation.opinion };
  }
  if (score < required) {
    const missing = Math.ceil(required - score);
    return {
      accepted: false,
      reason: `Rechazado: le faltan ${missing} puntos de confianza. Ofrece tributo o deja de presionarle.`,
      opinion: relation.opinion,
    };
  }
  return { accepted: true, reason: 'Aceptado', opinion: relation.opinion };
}

export interface DiplomacyResult {
  ok: boolean;
  reason: string;
}

export function proposeTreaty(
  state: MatchState,
  fromId: PlayerId,
  toId: PlayerId,
  kind: TreatyKind,
): DiplomacyResult {
  if (fromId === toId) return { ok: false, reason: 'No puedes pactar contigo mismo' };
  const verdict = evaluateTreaty(state, fromId, toId, kind);
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  if (!verdict.accepted) {
    logEvent(state, 'diplomacy', `${to.name} rechaza el acuerdo de ${from.name}.`, {
      playerId: fromId,
      visibleToHuman: from.isHuman || to.isHuman,
    });
    return { ok: false, reason: verdict.reason };
  }

  setStance(state, fromId, toId, kind);
  adjustOpinion(state, toId, fromId, OPINION.onTreatySigned);
  adjustOpinion(state, fromId, toId, OPINION.onTreatySigned);
  logEvent(
    state,
    'diplomacy',
    `${from.name} y ${to.name} firman ${kind === 'alliance' ? 'una alianza' : 'un pacto de no agresion'}.`,
    { playerId: fromId, visibleToHuman: from.isHuman || to.isHuman },
  );
  return { ok: true, reason: 'Acuerdo firmado' };
}

/** Hands resources over to improve standing. The goods really do change hands. */
export function sendTribute(
  state: MatchState,
  fromId: PlayerId,
  toId: PlayerId,
  resources: ResourceCost,
): DiplomacyResult {
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  const value = tributeValue(resources);
  if (value <= 0) return { ok: false, reason: 'Selecciona algo que ofrecer' };
  if (!spend(from.stock, resources)) return { ok: false, reason: 'No tienes esos recursos' };

  grantMany(to, resources as Record<string, number>);
  adjustOpinion(state, toId, fromId, value);
  logEvent(state, 'diplomacy', `${from.name} envia un tributo a ${to.name}.`, {
    playerId: fromId,
    visibleToHuman: from.isHuman || to.isHuman,
  });
  return { ok: true, reason: `Confianza +${Math.round(value)}` };
}

export function declareWar(state: MatchState, fromId: PlayerId, toId: PlayerId): DiplomacyResult {
  const from = playerById(state, fromId);
  const to = playerById(state, toId);
  const hadTreaty = isBoundNotToAttack(state, fromId, toId);
  setStance(state, fromId, toId, 'war');
  adjustOpinion(state, toId, fromId, hadTreaty ? OPINION.onPactBroken : OPINION.onWarDeclared);
  if (hadTreaty) witnessOathBreaking(state, fromId, toId);
  logEvent(state, 'diplomacy', `${from.name} declara la guerra a ${to.name}.`, {
    playerId: fromId,
    visibleToHuman: from.isHuman || to.isHuman,
  });
  return { ok: true, reason: 'Guerra declarada' };
}

/** Breaking a signed pact costs standing with every onlooker, not just the victim. */
export function witnessOathBreaking(state: MatchState, breakerId: PlayerId, victimId: PlayerId): void {
  for (const observer of state.players) {
    if (observer.id === breakerId || observer.id === victimId) continue;
    adjustOpinion(state, observer.id, breakerId, OPINION.onPactBrokenWitness);
  }
}

/** Called when an attack lands, so combat feeds back into standing. */
export function registerAggression(state: MatchState, attackerId: PlayerId, defenderId: PlayerId): void {
  const hadTreaty = isBoundNotToAttack(state, attackerId, defenderId);
  if (hadTreaty) {
    setStance(state, attackerId, defenderId, 'war');
    adjustOpinion(state, defenderId, attackerId, OPINION.onPactBroken);
    witnessOathBreaking(state, attackerId, defenderId);
    const attacker = playerById(state, attackerId);
    const defender = playerById(state, defenderId);
    logEvent(state, 'pactBroken', `${attacker.name} rompe su pacto con ${defender.name}.`, {
      playerId: attackerId,
      visibleToHuman: attacker.isHuman || defender.isHuman,
    });
  } else {
    adjustOpinion(state, defenderId, attackerId, OPINION.onAttacked);
    if (stanceBetween(state, attackerId, defenderId) !== 'war') {
      setStance(state, attackerId, defenderId, 'war');
    }
  }
}

/** Grudges fade a little each day, so a match is never permanently poisoned. */
export function driftRelations(state: MatchState): void {
  for (const player of state.players) {
    for (const [otherId, relation] of Object.entries(player.relations)) {
      if (relation.opinion === 0) continue;
      const step = Math.sign(relation.opinion) * -OPINION.dailyDrift;
      const next = relation.opinion + step;
      // Do not overshoot through zero.
      relation.opinion = Math.sign(next) === Math.sign(relation.opinion) ? next : 0;
      player.relations[otherId] = relation;
    }
  }
}

/**
 * Bots take their own diplomatic turn: they seek treaties with players they
 * like and who are not currently their best target.
 */
export function runBotDiplomacy(state: MatchState, botId: PlayerId): void {
  const bot = playerById(state, botId);
  if (!bot.personality) return;
  const weights = STRATEGIES[bot.personality];
  // Only genuinely diplomatic profiles open negotiations at all.
  if (weights.diplomacy < 1) return;

  const held = Object.values(bot.relations).filter(
    (r) => r.stance === 'nonAggression' || r.stance === 'alliance',
  ).length;
  if (held >= MAX_BOT_TREATIES) return;

  // One approach per day, to whoever they already like best: a bot papering
  // the table with pacts empties the match of conflict.
  const candidates = state.players
    .filter((other) => other.id !== botId && !other.eliminated)
    .filter((other) => relationOf(bot, other.id).stance === 'neutral')
    .sort((a, b) => relationOf(bot, b.id).opinion - relationOf(bot, a.id).opinion);

  const target = candidates[0];
  if (!target) return;
  if (evaluateTreaty(state, botId, target.id, 'nonAggression').accepted) {
    proposeTreaty(state, botId, target.id, 'nonAggression');
  }
}
