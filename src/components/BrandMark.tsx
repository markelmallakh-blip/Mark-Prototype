export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={`grid flex-none place-items-center rounded-md bg-brand font-black text-brand-foreground ${className ?? ''}`} aria-hidden>
      P
    </span>
  );
}
