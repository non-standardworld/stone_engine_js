import { useState } from "react";

/** コピー機能付きのコード表示。 */
export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };
  return (
    <div className={className ? `codeblock ${className}` : "codeblock"}>
      <button type="button" className="codeblock__copy" onClick={copy}>
        {copied ? "コピーしました" : "コピー"}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
