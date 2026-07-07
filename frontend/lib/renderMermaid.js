// Shared Mermaid rendering helper. [teammate-owned]
// Loads mermaid.js dynamically (client-side only) and renders a diagram source string into a
// container element. Used by both DiagramViewer and FileBrowser so the mermaid setup lives in one
// place. Also exposes an SVG->PNG downloader for the "Export PNG" feature.

let mermaidPromise = null;

// Load + initialize mermaid once, reuse the instance afterwards.
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light';
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'neutral',
        securityLevel: 'loose',
        // Render labels as native SVG <text>, NOT HTML-in-<foreignObject>. foreignObject taints
        // the canvas during SVG->PNG export ("Tainted canvases may not be exported") and its
        // content rasterizes blank in SVG-as-image anyway.
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

/**
 * Render Mermaid `source` into `container`. Returns the generated <svg> element (or null).
 */
export async function renderMermaid(container, source) {
  if (!container) return null;
  const mermaid = await getMermaid();
  const id = `d-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { svg } = await mermaid.render(id, source);
  container.innerHTML = svg;
  return container.querySelector('svg');
}

/**
 * Serialize the rendered <svg> to a PNG and trigger a browser download.
 * @param {SVGElement} svg
 * @param {string} filename
 */
export async function downloadSvgAsPng(svg, filename = 'diagram.png') {
  if (!svg) throw new Error('Nothing to export yet — render a diagram first.');

  const box = svg.viewBox?.baseVal;
  const rect = svg.getBoundingClientRect();
  const width = Math.ceil((box && box.width) || rect.width || 800);
  const height = Math.ceil((box && box.height) || rect.height || 600);

  const clone = svg.cloneNode(true);
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  // Belt and braces: any <foreignObject> (e.g. a diagram rendered before htmlLabels was
  // disabled) would taint the canvas and rasterize blank — drop them rather than fail.
  for (const fo of clone.querySelectorAll('foreignObject')) fo.remove();

  const data = new XMLSerializer().serializeToString(clone);
  // data: URL (not a blob URL): unambiguously same-origin, so the canvas stays exportable.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;

  const scale = 2; // render at 2x for a crisp PNG
  const png = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        // Match the theme the diagram was rendered with — dark-theme diagrams have light text,
        // so a white background would make the export unreadable (and vice versa).
        const dark = document.documentElement.dataset.theme !== 'light';
        ctx.fillStyle = dark ? '#0b0b0f' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png');
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Could not rasterize the diagram.'));
    img.src = url;
  });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(png);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default renderMermaid;
