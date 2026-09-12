import type { ReactNode } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info" | "default";

export type ToastAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost" | "danger";
  /** optional heroicon element; if omitted, no icon */
  icon?: ReactNode;
};

export type ToastInput = {
  id?: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** custom icon; false hides icon */
  icon?: ReactNode | false;
  /** ms until auto-dismiss; false disables auto-dismiss */
  duration?: number | false;
  dismissible?: boolean;
  /** show progress bar when duration is set */
  showProgress?: boolean;
  actions?: ToastAction[];
  onClick?: () => void;
  onDismiss?: () => void;
  /** optional debug payload for dev */
  debug?: string;
};

export type Toast = Required<Pick<ToastInput, "title">> & {
  id: string;
  description?: string;
  variant: ToastVariant;
  icon: ReactNode | false;
  duration: number | false;
  dismissible: boolean;
  showProgress: boolean;
  actions: ToastAction[];
  onClick?: () => void;
  onDismiss?: () => void;
  debug?: string;
  createdAt: number;
};
