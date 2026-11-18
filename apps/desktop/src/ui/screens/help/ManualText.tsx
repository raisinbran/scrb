import type { ReactNode } from 'react';

interface Props {
  content: string;
  onNavigate(id: string): void;
}

function inline(text: string, onNavigate: Props['onNavigate']): ReactNode[] {
  const pieces: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\x60[^\x60]+\x60|\[[^\]]+\]\([^)]+\))/g;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? position;
    if (start > position) pieces.push(text.slice(position, start));
    const token = match[0] ?? '';
    const key = start;
    if (token.startsWith('**')) {
      pieces.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('\x60')) {
      pieces.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const id =
        link?.[2] === 'known-issues.md'
          ? 'known-issues'
          : link?.[2] === 'README.md'
            ? 'overview'
            : null;
      pieces.push(
        id ? (
          <a
            key={key}
            href={'#manual-' + id}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(id);
            }}
          >
            {link?.[1]}
          </a>
        ) : (
          (link?.[1] ?? token)
        ),
      );
    }
    position = start + token.length;
  }
  if (position < text.length) pieces.push(text.slice(position));
  return pieces;
}

function cells(row: string): string[] {
  return row
    .split('|')
    .slice(1, -1)
    .map((part) => part.trim());
}

/** Render only the Markdown constructs used by the two bundled, trusted manual documents. */
export function ManualText({ content, onNavigate }: Props) {
  const blocks = content.trim().split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.trim().split(/\r?\n/);
        const first = lines[0] ?? '';
        if (first.startsWith('## ')) {
          return <h4 key={index}>{first.slice(3)}</h4>;
        }
        if (first.startsWith('### ')) {
          return <h5 key={index}>{first.slice(4)}</h5>;
        }
        if (first.startsWith('|') && lines.length >= 3) {
          const [head = '', , ...rows] = lines;
          return (
            <table key={index}>
              <thead>
                <tr>
                  {cells(head).map((cell, column) => (
                    <th key={column} scope="col">
                      {inline(cell, onNavigate)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {cells(row).map((cell, column) => (
                      <td key={column}>{inline(cell, onNavigate)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (first.startsWith('- ') || /^\d+\. /.test(first)) {
          const ordered = !first.startsWith('- ');
          const items = lines.map((line) => line.replace(ordered ? /^\d+\. / : /^- /, ''));
          const children = items.map((item, position) => (
            <li key={position}>{inline(item, onNavigate)}</li>
          ));
          return ordered ? <ol key={index}>{children}</ol> : <ul key={index}>{children}</ul>;
        }
        return <p key={index}>{inline(lines.join(' '), onNavigate)}</p>;
      })}
    </>
  );
}
