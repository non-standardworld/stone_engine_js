import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

export interface SampleProps {
  title: string;
  description?: string;
  code: string;
  wide?: boolean;
  vertical?: boolean;
  children: ReactNode;
}

/** ライブサンプルとそのコードを並べたカード。 */
export function Sample({ title, description, code, wide, vertical, children }: SampleProps) {
  return (
    <article className={wide ? "sample sample--wide" : "sample"}>
      <div className="sample__head">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="sample__stage" data-vertical={vertical ? "" : undefined}>
        {children}
      </div>
      <details>
        <summary>コードを見る</summary>
        <CodeBlock code={code} />
      </details>
    </article>
  );
}
