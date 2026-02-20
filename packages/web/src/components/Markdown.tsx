import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { parseMarkdownToHtml } from "../lib/markdown-parser";
import "./markdown.css";

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    if (node.target !== "_blank") return;

    const rel = node.getAttribute("rel") ?? "";
    const set = new Set(rel.split(/\s+/).filter(Boolean));
    set.add("noopener");
    set.add("noreferrer");
    node.setAttribute("rel", Array.from(set).join(" "));
  });
}

const sanitizeConfig = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
};

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return "";
  return DOMPurify.sanitize(html, sanitizeConfig);
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let disposed = false;

    (async () => {
      const rendered = await parseMarkdownToHtml(text);
      if (disposed) return;
      setHtml(sanitize(rendered));
    })().catch(() => {
      if (disposed) return;
      setHtml(sanitize(text));
    });

    return () => {
      disposed = true;
    };
  }, [text]);

  return (
    <div
      data-component="markdown"
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
