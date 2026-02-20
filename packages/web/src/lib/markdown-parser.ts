import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, createHighlighter, type BundledLanguage } from "shiki"

let highlighterPromise: ReturnType<typeof createHighlighter> | undefined

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark"],
      langs: [],
    })
  }

  return highlighterPromise
}

const parser = marked.use(
  {
    renderer: {
      link({ href, title, text }) {
        const titleAttr = title ? ` title="${title}"` : ""
        return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
      },
    },
  },
  markedKatex({
    throwOnError: false,
    nonStandard: true,
  }),
  markedShiki({
    async highlight(code, lang) {
      const highlighter = await getHighlighter()
      let safeLanguage = lang || "text"
      if (!(safeLanguage in bundledLanguages)) {
        safeLanguage = "text"
      }
      if (!highlighter.getLoadedLanguages().includes(safeLanguage)) {
        await highlighter.loadLanguage(safeLanguage as BundledLanguage)
      }
      return highlighter.codeToHtml(code, {
        lang: safeLanguage,
        theme: "github-dark",
      })
    },
  }),
)

export async function parseMarkdownToHtml(markdown: string) {
  return parser.parse(markdown)
}
