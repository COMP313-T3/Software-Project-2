import type { ReactNode } from "react";

interface LegalSectionProps {
  title: string;
  children: ReactNode;
}

/**
 * One titled section of a legal page, styled the same in the pop-up and on the page.
 */
export default function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="space-y-2 [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h2 className="text-[15.5px] font-semibold text-[#efe6d8]">{title}</h2>
      {children}
    </section>
  );
}
