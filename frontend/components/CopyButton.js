'use client';
import { useState } from 'react';

// Small reusable "copy to clipboard" button. Shows a brief "Copied!" confirmation.
export default function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? '');
    } catch {
      // Fallback for insecure contexts / older browsers
      const ta = document.createElement('textarea');
      ta.value = text ?? '';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button type="button" className={`copy-btn ${className}`} onClick={copy} title="Copy to clipboard">
      {copied ? '✓ Copied' : label}
    </button>
  );
}
