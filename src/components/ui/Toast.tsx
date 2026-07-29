import { useEffect } from "react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-5 right-5 max-w-sm bg-danger-soft text-danger border border-danger rounded-lg px-4 py-3 text-sm font-medium shadow-lg">
      {message}
    </div>
  );
}
