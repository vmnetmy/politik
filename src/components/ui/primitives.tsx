import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return <button type={type} className={`ui-button ui-button-${variant} ${className}`.trim()} {...props}/>;
}

export function Badge({ children, className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return <span className={`ui-badge ${className}`.trim()} {...props}>{children}</span>;
}

export function Panel({ children, className = "", ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section className={`panel ${className}`.trim()} {...props}>{children}</section>;
}

export function IconButton({
  icon,
  label,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
}) {
  return <button type={type} className={`ui-icon-button ${className}`.trim()} aria-label={label} {...props}><Icon name={icon}/></button>;
}

export function Notice({
  tone = "info",
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return <div className={`ui-notice ui-notice-${tone} ${className}`.trim()} role={tone === "danger" ? "alert" : "status"} {...props}>{children}</div>;
}
