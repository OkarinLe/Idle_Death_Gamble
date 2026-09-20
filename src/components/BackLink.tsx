import Link from "next/link";

export default function BackLink({
  href = "/",
  label = "Back",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium underline transition-transform duration-150 hover:-translate-x-0.5"
    >
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}