/**
 * Single source of truth for page content width on the public site.
 *
 * Pages never write their own `mx-auto max-w-*` wrapper: the public shell
 * (`app/(public)/layout.tsx`) already centers a fixed-width container for the
 * breadcrumbs row, and this component renders inside it so content always
 * spans exactly the same width as the crumbs above it.
 */
export function PageContainer({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={className || undefined}>{children}</div>;
}