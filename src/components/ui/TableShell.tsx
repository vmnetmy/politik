import type { HTMLAttributes, ReactNode } from "react";

export function TableShell({
  label,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`ui-table-scroll ${className}`.trim()}
      role="region"
      aria-label={label}
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  );
}
