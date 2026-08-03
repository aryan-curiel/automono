import { CaretUpDown } from "@phosphor-icons/react";
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
    <div className="relative">
      <select
        className={`${fieldBase} ${borderClass(error)} appearance-none pr-8 cursor-default
                    disabled:opacity-50 disabled:cursor-default ${className}`}
        {...props}
      >
        {children}
      </select>
      <CaretUpDown
        size={12}
        weight="bold"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
      />
    </div>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function TextArea({ error, className = "", ...props }: TextAreaProps) {
  return (
    <textarea className={`${fieldBase} ${borderClass(error)} resize-y ${className}`} {...props} />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-danger text-xs mt-1">{children}</p>;
}
