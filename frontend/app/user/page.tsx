import Link from "next/link";
import PayFiDemo from "@/components/payfi-demo";

export default function UserPage() {
  return (
    <div>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <Link href="/" className="payfi-link">
          ← 首页
        </Link>
        <Link href="/merchant" className="payfi-link">
          商家端
        </Link>
      </div>
      <PayFiDemo />
    </div>
  );
}
