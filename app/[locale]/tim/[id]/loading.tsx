import { Bar, SkeletonPage, SkeletonPitch } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="mx-auto max-w-[680px]">
        <div className="flex items-center gap-3 mb-3">
          <Bar className="w-12 h-12 !rounded-full" />
          <div>
            <Bar className="h-6 w-44" />
            <Bar className="h-4 w-32 mt-2" />
          </div>
        </div>
        <Bar className="h-24 w-full !rounded-xl bg-navy-800 mb-3" />
        <SkeletonPitch />
      </div>
    </SkeletonPage>
  );
}
