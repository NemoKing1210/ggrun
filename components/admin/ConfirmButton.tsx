"use client";

import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { useConfirm } from "@/components/ui/useConfirm";

/**
 * Submit button with an in-app HUD confirmation dialog. The button is
 * `type="button"` — it never submits the form directly. On confirmation the
 * surrounding form is submitted programmatically via `requestSubmit()`, so
 * `<form action={serverAction}>` keeps working unchanged.
 */
export function ConfirmButton({
  message,
  className,
  children,
  disabled,
  danger = true,
  ...rest
}: {
  message: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { confirm, dialog } = useConfirm();
  const ref = useRef<HTMLButtonElement | null>(null);

  const onClick = async () => {
    if (await confirm({ message, danger })) {
      ref.current?.form?.requestSubmit();
    }
  };

  return (
    <>
      {dialog}
      <button
        type="button"
        ref={ref}
        className={className}
        disabled={disabled}
        onClick={onClick}
        {...rest}
      >
        {children}
      </button>
    </>
  );
}
