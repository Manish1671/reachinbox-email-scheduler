import type { SelectHTMLAttributes } from 'react';

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
};

export function SelectField({ label, error, options, id, className = '', ...props }: SelectFieldProps) {
  const selectId = id ?? props.name;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className={`mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value || '__empty'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
