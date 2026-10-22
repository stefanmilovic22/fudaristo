import { Bar, SkeletonCard, SkeletonPage, SkeletonRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="max-w-3xl mx-auto">
        <Bar className="h-4 w-24 mb-3" />
        <div className="bg-navy-800 border border-gold-400/30 rounded-xl p-5 flex items-center gap-4">
          <Bar className="w-16 h-16 !rounded-full" />
          <div className="flex-1">
            <Bar className="h-7 w-56 max-w-full" />
            <Bar className="h-4 w-40 mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-20 !rounded-xl bg-navy-800" />
          ))}
        </div>
        <SkeletonCard className="mt-3">
          <Bar className="h-28 m-4" />
        </SkeletonCard>
        <SkeletonCard className="mt-3">
          <SkeletonRows count={5} avatar={false} />
        </SkeletonCard>
      </div>
    </SkeletonPage>
  );
}
