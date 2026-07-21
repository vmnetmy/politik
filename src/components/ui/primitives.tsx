import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return <button className={`ui-button ui-button-${variant} ${className}`.trim()} {...props}/>;
}

export function Badge({ children, className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return <span className={`ui-badge ${className}`.trim()} {...props}>{children}</span>;
}

export function Panel({ children, className = "", ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section className={`panel ${className}`.trim()} {...props}>{children}</section>;
}
