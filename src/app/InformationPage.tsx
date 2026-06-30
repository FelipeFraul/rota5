import type { ReactNode } from "react";
import BrandLogo from "@/app/BrandLogo";

export function InformationPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <main className="information-shell">
      <div className="information-stack">
        <BrandLogo className="information-logo" />
        <section className="information-card">
          {eyebrow ? <p className="information-eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? (
            <p className="information-description">{description}</p>
          ) : null}
          {children ? (
            <div className="information-actions">{children}</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
