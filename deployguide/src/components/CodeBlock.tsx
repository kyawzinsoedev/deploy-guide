"use client";
import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import type { CodeBlock as Code } from "@/lib/types";
/** A deliberately small, dependency-free lexer. React escapes every text token. */
function highlight(line: string, language: Code["language"]) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#") || trimmed.startsWith("//"))
    return <span className="token-comment">{line}</span>;
  return line
    .split(
      /('[^']*'|"[^"]*"|\$[a-zA-Z_][\w]*|\b(?:sudo|server|location|root|listen|try_files|proxy_pass|fastcgi_pass|const|export|default|true|false|npm|pnpm|php|git|curl|ssh|cd|systemctl)\b)/g,
    )
    .map((token, i) => (
      <span
        key={i}
        className={
          /^['"]/.test(token)
            ? "token-string"
            : token.startsWith("$")
              ? "token-variable"
              : /^(sudo|server|location|root|listen|try_files|proxy_pass|fastcgi_pass|const|export|default|true|false|npm|pnpm|php|git|curl|ssh|cd|systemctl)$/.test(
                    token,
                  )
                ? "token-keyword"
                : undefined
        }
      >
        {token}
      </span>
    ));
}
export function CodeBlock({ block }: { block: Code }) {
  const [feedback, setFeedback] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(block.code);
      setFeedback("Copied!");
    } catch {
      setFeedback("Select and copy the code manually.");
    }
    setTimeout(() => setFeedback(""), 2500);
  }
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>
          <Terminal size={13} />
          {block.title}
        </span>
        <button onClick={copy} aria-label={`Copy ${block.title}`}>
          {feedback === "Copied!" ? <Check size={14} /> : <Copy size={14} />}
          <span>{feedback === "Copied!" ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="code-context">
        <span>{block.location}</span>
        <span className={block.changes ? "state-change" : ""}>
          {block.changes ? "Changes state" : "Read-only / educational"}
        </span>
      </div>
      <pre tabIndex={0} aria-label={block.title}>
        <code>
          {block.code.split("\n").map((line, i) => (
            <span className="code-line" key={i}>
              {highlight(line, block.language)}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <span className="sr-only" role="status">
        {feedback}
      </span>
    </div>
  );
}
