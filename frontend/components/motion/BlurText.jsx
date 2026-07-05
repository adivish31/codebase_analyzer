'use client';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Word-by-word blur reveal for the hero headline. Runs ONCE on mount — no loops.
 * With prefers-reduced-motion the text renders instantly.
 */
export default function BlurText({ text, className = '', delay = 0 }) {
  const reduce = useReducedMotion();
  const words = text.split(' ');

  if (reduce) return <span className={className}>{text}</span>;

  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="inline-block"
          initial={{ filter: 'blur(8px)', opacity: 0, y: 8 }}
          animate={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: delay + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  );
}
