import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-medium text-ink-soft mb-1.5">{children}</label>;
}

const fieldBase =
  "w-full box-border text-[13px] px-3 py-2 rounded-control bg-surface text-ink " +
  "border shadow-[inset_0_1px_1px_rgb(0,0,0,0.03)] " +
  "transition-[box-shadow,border-color] duration-150 " +
  "focus:shadow-[0_0_0_3px_var(--color-focus-ring)] focus:outline-none";

function borderClass(error?: boolean) {
  return error ? "border-danger focus:border-danger" : "border-border focus:border-accent";
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  error?: boolean;
}

export function TextInput({ mono, error, className = "", ...props }: TextInputProps) {
  return (
    <input
      className={`${fieldBase} ${borderClass(error)} ${mono ? "font-mono font-medium" : ""} ${className}`}
      {...props}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
  error?: boolean;
}

export function Select({ error, className = "", children, ...props }: SelectProps) {
  return (
    <select className={`${fieldBase} ${borderClass(error)} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function TextArea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={`${fieldBase} ${borderClass(false)} resize-y ${className}`} {...props} />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-danger text-xs mt-1">{children}</p>;
}
