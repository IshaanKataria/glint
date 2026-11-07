// Markdown -> sanitized HTML for answers, live summaries and notes.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(src: string): string {
  const html = marked.parse(src ?? '', { async: false });
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'img'],
    FORBID_ATTR: ['style'],
  });
}

/** Render into an element. Links never navigate the Glint window (there is no openExternal channel). */
export function setMarkdown(el: HTMLElement, src: string): void {
  el.innerHTML = renderMarkdown(src);
  el.querySelectorAll('a').forEach((a) => {
    a.setAttribute('title', a.getAttribute('href') ?? '');
    a.addEventListener('click', (e) => e.preventDefault());
  });
}
