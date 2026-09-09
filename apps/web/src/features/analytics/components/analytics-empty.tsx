import Link from "next/link";
import { ChartColumnIncreasing } from "lucide-react";

import { Button } from "@momentum/ui/components/button";
import { EmptyState } from "@momentum/ui/components/empty-state";
import { PageContainer } from "@momentum/ui/components/page-container";
import { PageHeader } from "@momentum/ui/components/page-header";

import { ANALYTICS_COPY } from "@/features/analytics/copy";

/**
 * What a new account sees, rather than six charts of flat zero: a 0% habit
 * rate on day one would be the product's first statement about the user.
 */
export function AnalyticsEmpty() {
  return (
    <PageContainer>
      <PageHeader title={ANALYTICS_COPY.title} description={ANALYTICS_COPY.description} />
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={ChartColumnIncreasing}
          title={ANALYTICS_COPY.empty.title}
          description={ANALYTICS_COPY.empty.description}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/today">{ANALYTICS_COPY.empty.action}</Link>
            </Button>
          }
        />
      </div>
    </PageContainer>
  );
}
