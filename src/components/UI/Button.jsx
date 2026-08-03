import './Button.css';

/**
 * Renders as a <button> when `onClick` is given without `href`,
 * or as an <a> when `href` is given — mirrors how the original
 * markup mixed <button> and <a class="btn"> interchangeably.
 */
export default function Button({
  as,
  href,
  variant = 'primary', // 'primary' | 'outline'
  size, // 'sm' | undefined
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'btn',
    variant === 'outline' ? 'btn-outline' : 'btn-primary',
    size === 'sm' ? 'btn-sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const Tag = as || (href ? 'a' : 'button');
  const tagProps = { className: classes, ...rest };
  if (href) tagProps.href = href;
  if (disabled) tagProps.disabled = disabled;

  return <Tag {...tagProps}>{children}</Tag>;
}
