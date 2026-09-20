import Link from "next/link";

export default function BackLink({
  href = "/",
  label = "Back",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium underline">
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}