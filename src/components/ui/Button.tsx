import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./ui.module.css";

type Variant = "primary" | "secondary" | "ghost" | "dark" | "danger" | "lime";
type Size = "small" | "medium" | "large";

const variantClass: Record<Variant, string> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  ghost: styles.buttonGhost,
  dark: styles.buttonDark,
  danger: styles.buttonDanger,
  lime: styles.buttonLime,
};

const sizeClass: Record<Size, string> = {
  small: styles.buttonSmall,
  medium: "",
  large: styles.buttonLarge,
};

interface CommonButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
}

export function Button({
  children,
  variant = "primary",
  size = "medium",
  icon,
  className,
  ...rest
}: CommonButtonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={[styles.button, variantClass[variant], sizeClass[size], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  children,
  variant = "secondary",
  size = "medium",
  icon,
  className,
}: CommonButtonProps & { to: string }) {
  return (
    <Link
      to={to}
      className={[styles.button, variantClass[variant], sizeClass[size], className]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {children}
    </Link>
  );
}

export function ExternalButtonLink({
  href,
  children,
  variant = "secondary",
  size = "medium",
  icon,
  className,
}: CommonButtonProps & { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={[styles.button, variantClass[variant], sizeClass[size], className]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {children}
    </a>
  );
}

export { styles as ui };
