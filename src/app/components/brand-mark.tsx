export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={`inline-block shrink-0 ${className ?? ""}`} aria-hidden="true">
      <img src="/logo-light.png" alt="" className="h-full w-full object-contain dark:hidden" />
      <img src="/logo-dark.png" alt="" className="hidden h-full w-full object-contain dark:block" />
    </span>
  );
}
