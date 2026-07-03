'use client';
import { useMemo } from 'react';
import hljs from 'highlight.js';
import CopyButton from './CopyButton';

// A syntax-highlighted code block with a copy button.
// `language` is the backend's language name (javascript, python, markdown, …). We map the few that
// differ from highlight.js and fall back to auto-detection when the language is unknown.
const LANG_ALIASES = {
  shell: 'bash',
  text: 'plaintext',
  vue: 'xml',
  svelte: 'xml',
  protobuf: 'protobuf',
  csharp: 'csharp',
};

export default function CodeBlock({ code = '', language = '', title }) {
  const html = useMemo(() => {
    const lang = LANG_ALIASES[language] || language;
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      // As a last resort, escape and show plain text.
      return code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }
  }, [code, language]);

  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{title || language || 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="hljs">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
