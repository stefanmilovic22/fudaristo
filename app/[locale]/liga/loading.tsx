import { Bar, SkeletonCard, SkeletonPage, SkeletonRows, SkeletonTitle } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle />
      <div className="flex gap-2 mb-4">
        <Bar className="h-9 w-28 !rounded-lg bg-navy-800" />
        <Bar className="h-9 w-28 !rounded-lg bg-navy-800" />
      </div>
      <Bar className="h-10 w-full sm:w-64 !rounded-lg bg-navy-800 mb-4" />
      <SkeletonCard>
        <SkeletonRows count={10} />
      </SkeletonCard>
    </SkeletonPage>
  );
}
