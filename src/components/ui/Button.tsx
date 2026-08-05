import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost-danger" | "dashed";

const base =
  "font-semibold text-[13px] rounded-control cursor-pointer whitespace-nowrap " +
  "transition-[transform,background-color,box-shadow] duration-150 ease-[var(--ease-out)] " +
  "active:scale-[0.97] disabled:opacity-50 disabled:cursor-default disabled:active:scale-100 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white px-4 py-2 hover:brightness-105",
  secondary: "bg-surface text-ink border border-border px-4 py-2 hover:bg-surface-alt",
  "ghost-danger": "bg-transparent text-danger px-4 py-2 hover:bg-danger-soft rounded-control",
  dashed:
    "bg-transparent text-accent border border-dashed border-border px-3.5 py-2 hover:bg-surface-alt",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
