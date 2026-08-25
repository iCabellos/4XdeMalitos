import type { MatchEvent, MatchPhase, MatchState, PlayerId } from './types';

/** Keeps the log bounded so a long simulation cannot grow without limit. */
const MAX_EVENTS = 600;

export function logEvent(
  state: MatchState,
  kind: string,
  text: string,
  options: { playerId?: PlayerId | null; hex?: string; phase?: MatchPhase; visibleToHuman?: boolean } = {},
): MatchEvent {
  const event: MatchEvent = {
    day: state.day,
    phase: options.phase ?? state.phase,
    playerId: options.playerId ?? null,
    kind,
    text,
    hex: options.hex,
    visibleToHuman: options.visibleToHuman ?? true,
  };
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  return event;
}

export function eventsForDay(state: MatchState, day: number): MatchEvent[] {
  return state.events.filter((e) => e.day === day);
}

