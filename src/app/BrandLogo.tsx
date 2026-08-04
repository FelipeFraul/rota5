"use client";

type BrandLogoProps = {
  className?: string;
};

export default function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <img
      className={["brand-logo", className].filter(Boolean).join(" ")}
      src="/logo_rota5.avif"
      alt="Rota5"
    />
  );
}
