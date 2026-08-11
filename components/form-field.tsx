import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type BaseProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function FormField({ id, label, hint, error, ...inputProps }: InputProps) {
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hint || error ? `${id}-help` : undefined} aria-invalid={Boolean(error)} {...inputProps} />
      {(hint || error) && <p id={`${id}-help`} className={error ? 'field-error' : 'field-hint'}>{error || hint}</p>}
    </div>
  );
}

export function TextareaField({ id, label, hint, error, ...textareaProps }: TextareaProps) {
  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-describedby={hint || error ? `${id}-help` : undefined} aria-invalid={Boolean(error)} {...textareaProps} />
      {(hint || error) && <p id={`${id}-help`} className={error ? 'field-error' : 'field-hint'}>{error || hint}</p>}
    </div>
  );
}
