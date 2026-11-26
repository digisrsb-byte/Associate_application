import type { ChangeEvent, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { FIELD_LABEL_CLASS } from './formStyles.ts';

type CommonProps = {
  id: string;
  label: ReactNode;
  value: string;
  wrapperClassName?: string;
  labelClassName?: string;
  inputClassName: string;
};

type InputProps = CommonProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'className' | 'onChange'> & {
    as?: 'input';
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  };

type TextareaProps = CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'className' | 'onChange'> & {
    as: 'textarea';
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  };

export type LabeledFieldProps = InputProps | TextareaProps;

/**
 * Shared label + control chrome. Callers pass exact inputClassName so drawer vs
 * modal styling stays bit-identical to the previous inline markup.
 */
export function LabeledField(props: LabeledFieldProps) {
  const {
    id,
    label,
    value,
    wrapperClassName,
    labelClassName = FIELD_LABEL_CLASS,
    inputClassName,
    as = 'input',
    onChange,
    ...rest
  } = props;

  return (
    <div className={wrapperClassName}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {as === 'textarea' ? (
        <textarea
          id={id}
          value={value}
          onChange={onChange as (e: ChangeEvent<HTMLTextAreaElement>) => void}
          className={inputClassName}
          {...(rest as Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'className' | 'onChange'>)}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={onChange as (e: ChangeEvent<HTMLInputElement>) => void}
          className={inputClassName}
          {...(rest as Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'className' | 'onChange'>)}
        />
      )}
    </div>
  );
}
