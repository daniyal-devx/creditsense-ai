import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-10 w-64 bg-navy-800" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 bg-navy-800" />
        ))}
      </div>
      <Skeleton className="h-64 bg-navy-800" />
    </div>
  );
}
