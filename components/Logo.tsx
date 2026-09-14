import Link from "next/link";

interface LogoProps {
  variant?: "header" | "footer" | "drawer";
  className?: string;
  onClick?: () => void;
}

export default function Logo({ variant = "header", className = "", onClick }: LogoProps) {
  if (variant === "footer") {
    return (
      <Link href="/#hero" className={`official-logo footer-official-logo ${className}`.trim()} aria-label="Halima Trading L.L.C. Return to homepage">
        <img
          src="/halima-logo-with-text-footer.png"
          alt="Halima Trading L.L.C. — Your Trusted Electronics Partner"
          className="footer-logo-img"
        />
      </Link>
    );
  }

  if (variant === "drawer") {
    return (
      <Link href="/#hero" className={`official-logo menu-official-logo ${className}`.trim()} onClick={onClick} aria-label="Halima Trading L.L.C. Return to homepage">
        <img
          src="/halima-textlogo-bgremoved.png"
          alt="Halima Trading L.L.C."
          className="drawer-logo-img"
        />
      </Link>
    );
  }

  return (
    <Link href="/#hero" className={`official-logo header-logo-wrap ${className}`.trim()} onClick={onClick} aria-label="Halima Trading L.L.C. Return to homepage">
      <img
        src="/halima-trading-logo-bg.png"
        alt="Halima Trading L.L.C."
        className="logo-desktop"
      />
      <img
        src="/halimalogo.jpeg"
        alt="Halima Trading L.L.C."
        className="logo-mobile"
      />
    </Link>
  );
}
