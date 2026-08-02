export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-control bg-surface-alt border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-[12.5px] font-medium rounded-control transition-colors cursor-pointer
            ${
              value === opt.value
                ? "bg-surface text-ink"
                : "text-ink-soft hover:text-ink"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
