import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'subtle';
type Size = 'small' | 'medium';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  'data-testid'?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-jade-500 font-semibold text-ink-950 hover:bg-jade-400 disabled:bg-ink-700 disabled:text-gray-500',
  ghost: 'border border-ink-700 text-gray-200 hover:border-jade-400 hover:text-white',
  subtle: 'bg-ink-800 text-gray-100 hover:bg-ink-700',
};

const SIZES: Record<Size, string> = {
  small: 'px-3 py-1.5 text-xs',
  medium: 'px-4 py-2 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'medium',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        'inline-flex items-center justify-center rounded-lg transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}