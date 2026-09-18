import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  totalPages,
  buildHref
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-muted-foreground">
        Page {page} / {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page - 1)}>Précédent</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Précédent</Button>
        )}
        {page < totalPages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page + 1)}>Suivant</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Suivant</Button>
        )}
      </div>
    </div>
  );
}
