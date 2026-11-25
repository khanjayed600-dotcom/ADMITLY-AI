import React, { useEffect, useRef } from 'react';
import katex from 'katex';

interface MathSegment {
  type: 'text' | 'inline' | 'display';
  content: string;
}

function parseMathSegments(input: string): MathSegment[] {
  if (!input) return [];

  // Match $$...$$, \[...\], \(...\), or $...$ (avoiding escaped \$)
  const tokenRegex =
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)([^$\n]*?\S|\S)\$)/g;

  const segments: MathSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: input.slice(lastIndex, match.index),
      });
    }

    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({
        type: 'display',
        content: token.slice(2, -2).trim(),
      });
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      segments.push({
        type: 'display',
        content: token.slice(2, -2).trim(),
      });
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      segments.push({
        type: 'inline',
        content: token.slice(2, -2).trim(),
      });
    } else if (token.startsWith('$') && token.endsWith('$')) {
      segments.push({
        type: 'inline',
        content: token.slice(1, -1).trim(),
      });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < input.length) {
    segments.push({
      type: 'text',
      content: input.slice(lastIndex),
    });
  }

  return segments;
}

function KatexFormula({
  expr,
  displayMode,
}: {
  expr: string;
  displayMode: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      katex.render(expr, el, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      el.textContent = expr;
    }
  }, [expr, displayMode]);

  return (
    <span
      ref={ref}
      className={
        displayMode
          ? 'block my-2 overflow-x-auto py-1 text-center'
          : 'inline-block align-baseline mx-0.5'
      }
    />
  );
}

/**
 * Safely renders mixed Bengali + English + KaTeX LaTeX ($...$, $$...$$, \(...\), \[...\]).
 * Plain text renders via standard React text nodes; math renders directly via katex.render.
 */
export function MathText({
  text,
  className = '',
}: {
  text?: string | null;
  className?: string;
}) {
  if (!text) return null;
  const segments = parseMathSegments(text);

  if (segments.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <React.Fragment key={idx}>{seg.content}</React.Fragment>;
        }
        return (
          <KatexFormula
            key={idx}
            expr={seg.content}
            displayMode={seg.type === 'display'}
          />
        );
      })}
    </span>
  );
}
