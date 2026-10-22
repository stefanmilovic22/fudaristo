import { Bar, SkeletonCard, SkeletonPage, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="mx-auto max-w-[1020px]">
        <Bar className="h-4 w-16 mb-3" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonCard>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-4 py-5">
              <Bar className="h-20 !rounded-xl" />
              <Bar className="h-4 w-8 self-center" />
              <Bar className="h-20 !rounded-xl" />
            </div>
            <SkeletonRows count={7} avatar={false} />
          </SkeletonCard>
          <SkeletonCard>
            <SkeletonRows count={8} avatar={false} />
          </SkeletonCard>
        </div>
      </div>
    </SkeletonPage>
  );
}
