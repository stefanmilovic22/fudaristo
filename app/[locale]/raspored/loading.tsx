import { Bar, SkeletonCard, SkeletonPage, SkeletonRows, SkeletonTitle } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle />
      <Bar className="h-12 w-full max-w-xl !rounded-xl bg-navy-800 mb-4" />
      <SkeletonCard className="max-w-3xl">
        <SkeletonRows count={7} />
      </SkeletonCard>
    </SkeletonPage>
  );
}
