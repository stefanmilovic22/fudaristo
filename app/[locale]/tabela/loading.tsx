import { SkeletonCard, SkeletonPage, SkeletonRows, SkeletonTitle } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle />
      <SkeletonCard className="max-w-[960px]">
        <SkeletonRows count={10} />
      </SkeletonCard>
    </SkeletonPage>
  );
}
