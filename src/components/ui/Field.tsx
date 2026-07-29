import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-semibold text-ink-soft mb-1.5">{children}</label>;
}

const fieldBase = "w-full box-border text-sm px-3 py-2.5 border rounded-lg bg-surface text-ink";

function borderClass(error?: boolean) {
  return error ? "border-danger" : "border-border";
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
