import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderMarkdown } from '../markdown';

function MarkdownWrapper({ text }) {
  return <div data-testid="md">{renderMarkdown(text)}</div>;
}

describe('renderMarkdown', () => {
  it('returns null for falsy input', () => {
    expect(renderMarkdown(null)).toBeNull();
    expect(renderMarkdown('')).toBeNull();
    expect(renderMarkdown(undefined)).toBeNull();
  });

  it('renders plain text as a paragraph', () => {
    render(<MarkdownWrapper text="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders ### headings', () => {
    render(<MarkdownWrapper text="### My Heading" />);
    const heading = screen.getByText('My Heading');
    expect(heading).toBeInTheDocument();
    expect(heading.closest('p').style.fontWeight).toBe('600');
  });

  it('renders ## headings', () => {
    render(<MarkdownWrapper text="## Big Heading" />);
    const heading = screen.getByText('Big Heading');
    expect(heading).toBeInTheDocument();
    expect(heading.closest('p').style.fontSize).toBe('1.05rem');
  });

  it('renders bullet lists with - prefix', () => {
    render(<MarkdownWrapper text="- Item one" />);
    expect(screen.getByText('Item one')).toBeInTheDocument();
  });

  it('renders numbered lists', () => {
    render(<MarkdownWrapper text="1. First item" />);
    expect(screen.getByText('First item')).toBeInTheDocument();
  });

  it('renders bold text with **', () => {
    render(<MarkdownWrapper text="This is **bold** text" />);
    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders italic text with *', () => {
    render(<MarkdownWrapper text="This is *italic* text" />);
    const italic = screen.getByText('italic');
    expect(italic.tagName).toBe('EM');
  });

  it('renders inline code with backticks', () => {
    render(<MarkdownWrapper text="Use `console.log` for debugging" />);
    const code = screen.getByText('console.log');
    expect(code.tagName).toBe('CODE');
  });

  it('renders empty lines as line breaks', () => {
    const { container } = render(<MarkdownWrapper text={"Line 1\n\nLine 2"} />);
    const brs = container.querySelectorAll('br');
    expect(brs.length).toBeGreaterThanOrEqual(1);
  });

  it('handles multiline content with mixed formatting', () => {
    const text = '## Title\n\n- **Bold** item\n- *Italic* item\n\nPlain text';
    render(<MarkdownWrapper text={text} />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Bold')).toBeInTheDocument();
    expect(screen.getByText('Italic')).toBeInTheDocument();
    expect(screen.getByText('Plain text')).toBeInTheDocument();
  });
});
