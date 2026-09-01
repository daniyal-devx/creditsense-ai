import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2 className="text-6xl font-bold text-slate-700 mb-4">404</h2>
      <h3 className="text-xl font-semibold text-white mb-2">Page not found</h3>
      <p className="text-slate-400 text-sm max-w-md mb-6">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
