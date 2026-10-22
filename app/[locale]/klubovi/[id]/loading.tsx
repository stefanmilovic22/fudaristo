import { Bar, SkeletonCard, SkeletonPage, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <Bar className="h-4 w-24 mb-4" />
      <div className="flex items-center gap-4 mb-6">
        <Bar className="w-[72px] h-[72px] !rounded-full" />
        <div>
          <Bar className="h-8 w-56" />
          <Bar className="h-4 w-44 mt-3" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <div className="flex flex-col gap-4">
          <SkeletonCard>
            <SkeletonRows count={4} />
          </SkeletonCard>
          <SkeletonCard>
            <SkeletonRows count={5} />
          </SkeletonCard>
        </div>
        <SkeletonCard>
          <SkeletonRows count={5} avatar={false} />
        </SkeletonCard>
      </div>
    </SkeletonPage>
  );
}
