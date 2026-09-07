import { Fragment, type ReactNode } from 'react'
import { classNames } from '../lib/util'

/** 轻量 Markdown 渲染：只支持文档字符串里实际用到的语法 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={classNames('prose-doc', className)}>{renderBlocks(text)}</div>
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    // 代码块
    if (line.trimStart().startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { buf.push(lines[i]); i++ }
      i++
      out.push(<pre key={key++}><code>{buf.join('\n')}</code></pre>)
      continue
    }

    // 分隔线
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      out.push(<hr key={key++} className="my-3 border-t border-line" />)
      i++
      continue
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      out.push(<h3 key={key++}>{inline(h[2])}</h3>)
      i++
      continue
    }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++ }
      out.push(
        <div key={key++} className="overflow-x-auto">
          <table>
            <thead><tr>{head.map((c, n) => <th key={n}>{inline(c)}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n}>{r.map((c, m) => <td key={m}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // 无序列表
    if (/^\s*[-*·]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*·]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*·]\s+/, ''))
        i++
      }
      out.push(<ul key={key++}>{items.map((t, n) => <li key={n}>{inline(t)}</li>)}</ul>)
      continue
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push(<ol key={key++}>{items.map((t, n) => <li key={n}>{inline(t)}</li>)}</ol>)
      continue
    }

    // 段落
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*([-*·]\s|\d+\.\s|#{1,4}\s|\|)/.test(lines[i]) && !lines[i].trimStart().startsWith('```')) {
      buf.push(lines[i])
      i++
    }
    out.push(<p key={key++}>{inline(buf.join(' '))}</p>)
  }
  return out
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim())
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g

function inline(text: string): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push(<Fragment key={key++}>{text.slice(last, idx)}</Fragment>)
    const token = m[0]
    if (token.startsWith('`')) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (link) {
        parts.push(
          <a key={key++} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-brand">
            {link[1]}
          </a>,
        )
      }
    }
    last = idx + token.length
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return parts
}
