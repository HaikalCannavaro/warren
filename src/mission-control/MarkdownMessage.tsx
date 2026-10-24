import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import css from "highlight.js/lib/languages/css";
import { CopyButton } from "./ToolCard";
for (const [name, language] of Object.entries({
  typescript,
  json,
  bash,
  python,
  css,
}))
  hljs.registerLanguage(name, language);
hljs.registerAliases(["ts", "tsx", "js", "jsx", "javascript"], {
  languageName: "typescript",
});
hljs.registerAliases(["sh", "shell"], { languageName: "bash" });
function textContent(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textContent(child.props.children)
          : "",
    )
    .join("");
}
export function CodeBlock({
  code,
  language = "text",
}: {
  code: string;
  language?: string;
}) {
  const known = hljs.getLanguage(language);
  return (
    <div className="mc-message-code">
      <div>
        <span>{language}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      <pre>
        {known ? (
          <code
            className="hljs"
            dangerouslySetInnerHTML={{
              __html: hljs.highlight(code, { language }).value,
            }}
          />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}
export function MarkdownMessage({ children }: { children: string }) {
  return (
    <div className="mc-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span className="text-cockpit-muted">
              External image{alt ? `: ${alt}` : ""}
            </span>
          ),
          pre: ({ children }) => {
            const code = Children.toArray(children).find(isValidElement);
            const language = isValidElement<{ className?: string }>(code)
              ? code.props.className?.replace("language-", "")
              : undefined;
            return (
              <CodeBlock
                code={textContent(children).replace(/\n$/, "")}
                language={language}
              />
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
