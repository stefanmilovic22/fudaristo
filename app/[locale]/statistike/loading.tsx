import { Bar, SkeletonCard, SkeletonPage, SkeletonRows, SkeletonTitle } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle />
      <div className="flex gap-1 bg-navy-800 p-1 rounded-lg mb-5 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bar key={i} className="h-9 w-24 shrink-0 !rounded-md" />
        ))}
      </div>
      <SkeletonCard className="max-w-xl">
        <SkeletonRows count={6} avatar={false} />
      </SkeletonCard>
    </SkeletonPage>
  );
}
