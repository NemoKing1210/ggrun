"use client";

import type { MouseEvent, ReactNode } from "react";

/** Submit button with confirmation; canceling the dialog does not submit the form. */
export function ConfirmButton({
  message,
  className,
  children,
  disabled,
}: {
  message: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
