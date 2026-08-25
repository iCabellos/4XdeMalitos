import { useEffect, useRef } from 'react';
import { CityRenderer } from '../../rendering/cityRenderer';
import type { CityState } from '../../entities/city';

interface Props {
  city: CityState;
  selectedId: string | null;
  onPickBuilding: (id: string | null) => void;
  tick: number;
}

export function CityViewport({ city, selectedId, onPickBuilding, tick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const pickRef = useRef(onPickBuilding);
  pickRef.current = onPickBuilding;

  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new CityRenderer(containerRef.current, (id) => pickRef.current(id));
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.update(city, selectedId);
  }, [city, selectedId, tick]);

  return <div className="scene" ref={containerRef} />;
}
