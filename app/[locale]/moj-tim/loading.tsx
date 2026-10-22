import { Bar, SkeletonCard, SkeletonPage, SkeletonPitch } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <Bar className="w-9 h-9 !rounded-full" />
          <Bar className="h-6 w-40" />
        </div>
        <Bar className="h-9 w-32 !rounded-lg" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 sm:gap-5 mt-3">
        <div>
          <Bar className="h-14 w-full !rounded-xl bg-navy-800 mb-3" />
          <SkeletonPitch />
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonCard>
            <div className="p-4 flex flex-col gap-3">
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-4/5" />
              <Bar className="h-9 w-full !rounded-lg" />
            </div>
          </SkeletonCard>
        </div>
      </div>
    </SkeletonPage>
  );
}
