import type { TextareaHTMLAttributes } from 'react';

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

export function TextArea({ label, error, id, rows = 6, ...props }: TextAreaProps) {
  const areaId = id ?? props.name;

  return (
    <label className="block" htmlFor={areaId}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        id={areaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && areaId ? `${areaId}-error` : undefined}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-400"
        {...props}
      />
      {error ? (
        <p id={areaId ? `${areaId}-error` : undefined} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </label>
  );
}
