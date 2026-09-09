import Link from "next/link";
import { CircleDashedIcon } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <EmptyState
        icon={CircleDashedIcon}
        titleAs="h1"
        title="That page does not exist"
        description="The link may be out of date, or the item it pointed at has been removed."
        action={
          <Button size="sm" asChild>
            <Link href="/today">Go to Today</Link>
          </Button>
        }
      />
    </main>
  );
}
