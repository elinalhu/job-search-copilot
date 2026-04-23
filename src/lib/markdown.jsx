/**
 * Simple markdown-to-JSX renderer.
 * Handles: **bold**, *italic*, `code`, bullet lists (- / •), headings (### / ##)
 */
export function renderMarkdown(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    // Headings
    if (line.startsWith('### ')) {
      return <p key={i} style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: 8, marginBottom: 4 }}>{inlineFormat(line.slice(4))}</p>;
    }
    if (line.startsWith('## ')) {
      return <p key={i} style={{ fontWeight: 600, fontSize: '1.05rem', marginTop: 12, marginBottom: 4 }}>{inlineFormat(line.slice(3))}</p>;
    }
    // Bullets
    if (/^[\s]*[-•*]\s/.test(line)) {
      const indent = line.match(/^(\s*)/)[1].length;
      return (
        <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: indent * 8, marginBottom: 3 }}>
          <span style={{ flexShrink: 0, lineHeight: 'inherit' }}>•</span>
          <span>{inlineFormat(line.replace(/^[\s]*[-•*]\s*/, ''))}</span>
        </div>
      );
    }
    // Numbered lists
    if (/^\s*\d+[.)]\s/.test(line)) {
      const num = line.match(/^\s*(\d+[.)]\s)/)[1];
      return <p key={i} style={{ paddingLeft: 16, marginBottom: 3 }}>{num}{inlineFormat(line.replace(/^\s*\d+[.)]\s*/, ''))}</p>;
    }
    // Empty line
    if (line.trim() === '') return <br key={i} />;
    // Normal paragraph
    return <p key={i} style={{ marginBottom: 4 }}>{inlineFormat(line)}</p>;
  });
}

function inlineFormat(text) {
  // Split on markdown inline patterns and rebuild as JSX
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(<code key={key++} style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 3, fontSize: '0.85em' }}>{codeMatch[2]}</code>);
      remaining = codeMatch[3];
      continue;
    }

    // No more patterns
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : parts;
}
