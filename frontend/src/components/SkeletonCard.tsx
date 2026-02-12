const SkeletonCard = () => (
  <div className="rounded-lg border bg-card p-4 animate-pulse space-y-3">
    <div className="h-4 bg-muted rounded w-2/3" />
    <div className="h-3 bg-muted rounded w-full" />
    <div className="h-3 bg-muted rounded w-1/2" />
  </div>
);

export default SkeletonCard;
