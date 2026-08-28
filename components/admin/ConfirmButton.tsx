"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";

/** Submit button with confirmation; canceling the dialog does not submit the form. */
export function ConfirmButton({
  message,
  className,
  children,
  disabled,
  ...rest
}: {
  message: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
