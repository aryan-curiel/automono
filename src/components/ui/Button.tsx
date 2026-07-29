import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost-danger" | "dashed";

const base = "font-semibold text-sm rounded-lg cursor-pointer whitespace-nowrap transition-colors";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white px-5 py-2.5",
  secondary: "bg-surface text-ink border border-border px-5 py-2.5",
  "ghost-danger": "bg-transparent text-danger px-1 py-2.5",
  dashed: "bg-transparent text-accent border border-dashed border-border px-3.5 py-2.5",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
