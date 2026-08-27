"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-dim hover:text-amber">
      <ArrowLeftIcon className="h-3 w-3" aria-hidden />
      {label}
    </Link>
  );
}
