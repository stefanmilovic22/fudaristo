import { Bar, SkeletonPage, SkeletonTitle } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTitle />
      <div className="max-w-3xl">
        <Bar className="h-12 w-full !rounded-xl bg-navy-800" />
        <div className="flex gap-1.5 mt-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} className="h-8 w-20 !rounded-lg bg-navy-800" />
          ))}
        </div>
        <div className="flex flex-col gap-2 mt-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 bg-navy-800 border border-navy-700 rounded-xl px-4 py-3">
              <Bar className="w-8 h-8 !rounded-full" />
              <Bar className="h-5 w-40" />
              <Bar className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
