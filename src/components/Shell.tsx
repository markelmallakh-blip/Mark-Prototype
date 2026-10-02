import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-spaceGrey">
      <header className="flex h-12 flex-none items-center gap-2.5 px-4 text-white">
        <BrandMark className="size-7 text-[13px]" />
        <span className="select-none text-[15px] font-extrabold tracking-[-0.03em]">
          Prototype<span className="text-brand">.</span>
        </span>
      </header>
      <main className="mx-2 mb-2 min-h-0 flex-1 overflow-auto rounded-xl bg-background">{children}</main>
    </div>
  );
}
