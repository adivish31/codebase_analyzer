'use client';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card with a faint accent spotlight that follows the pointer. The only "effect"
 * cards get — used consistently, never stacked with other backgrounds.
 */
export default function SpotlightCard({ children, className = '' }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: -999, y: -999 });

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const rect = ref.current.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => setPos({ x: -999, y: -999 })}
      className={cn(
        'relative overflow-hidden rounded-[10px] border border-line bg-surface',
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [@media(hover:hover)]:opacity-100"
        style={{
          background: `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, var(--accent-dim), transparent 65%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
