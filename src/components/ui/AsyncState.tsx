import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type AsyncStateKind = "loading" | "empty" | "error" | "info";

export function AsyncState({
  kind = "info",
  title,
  description,
  action,
  className = "",
}: {
  kind?: AsyncStateKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-state ui-state-${kind} ${className}`.trim()} aria-live={kind === "loading" ? "polite" : undefined}>
      {kind === "loading" ? <span className="ui-state-spinner" aria-hidden="true"/> : <Icon name={kind === "empty" ? "search" : "info"} size={28}/>}
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {action && <div className="ui-state-action">{action}</div>}
      </div>
    </section>
  );
}
