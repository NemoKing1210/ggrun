"use client";

import type { MouseEvent, ReactNode } from "react";

/** Кнопка submit с подтверждением; отмена диалога не отправляет форму. */
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
