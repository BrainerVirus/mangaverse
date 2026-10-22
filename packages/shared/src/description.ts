/**
 * Provider descriptions arrive as raw Markdown (MangaDex descriptions carry `**`, `___`, links
 * and bullets). The detail page shows plain text, so the syntax is reduced here rather than
 * rendered or leaked to the reader.
 */
export function toReadableDescription(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
    .replace(/!\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, '$1')
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^ {0,3}>[ \t]?/gm, '')
    .replace(/^ {0,3}[-*+][ \t]+/gm, '• ')
    .replace(/(\*\*\*|___)([^\n]+?)\1/g, '$2')
    .replace(/(\*\*|__)([^\n]+?)\1/g, '$2')
    .replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s).,!?:;]|$)/gm, '$1$2')
    .replace(/(^|[\s(])_(\S[^_\n]*?)_(?=[\s).,!?:;]|$)/gm, '$1$2')
    .replace(/~~([^\n]+?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
