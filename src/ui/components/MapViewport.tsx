import { useEffect, useRef } from 'react';
import { MapRenderer, type MapViewSelection } from '../../rendering/mapRenderer';
import type { HexId } from '../../map/hex';
import type { MatchState, PlayerId } from '../../core/types';

interface Props {
  state: MatchState;
  viewerId: PlayerId;
  selection: MapViewSelection;
  onPickHex: (hex: HexId | null) => void;
  /** Bumped by the store on every mutation to force a redraw. */
  tick: number;
  /** Hex the camera should centre on; changing it re-centres once. */
  focusHex?: HexId | null;
}

/**
 * Bridges React and the imperative Three.js renderer. The renderer owns its own
 * animation loop, so React only pushes state into it and never re-renders it.
 */
export function MapViewport({ state, viewerId, selection, onPickHex, tick, focusHex }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const pickRef = useRef(onPickHex);
  const lastFocus = useRef<HexId | null>(null);
  pickRef.current = onPickHex;

  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new MapRenderer(containerRef.current, (hex) => pickRef.current(hex));
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.update(state, viewerId, selection);
  }, [state, viewerId, selection, tick]);

  useEffect(() => {
    if (!focusHex || focusHex === lastFocus.current) return;
    lastFocus.current = focusHex;
    rendererRef.current?.focus(state, focusHex);
  }, [focusHex, state]);

  return <div className="scene" ref={containerRef} />;
}
