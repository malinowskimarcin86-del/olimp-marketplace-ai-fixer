type DashboardShellProps = {
  children: React.ReactNode;
};

/** Layout wrapper for marketplace ops screens (dense, neutral B2B chrome). */
export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
