import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { KnowledgeCategory } from "@/lib/supabase/types";
import type { RagSource } from "@/lib/rag/client-response";

export interface RagSourcesProps {
  sources: RagSource[];
}

/**
 * Category labels, matching the wording convention already used for
 * incident types on the dashboard (app/dashboard/page.tsx). Only the
 * fields POST /api/rag actually returns (title/slug/category) are
 * ever rendered here — no similarity score, no URL, no source type,
 * because the API doesn't return those. See app/api/rag/route.ts.
 */
const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  flood: "Flood",
  earthquake: "Earthquake",
  fire: "Fire",
  building_collapse: "Building Collapse",
  medical_emergency: "Medical Emergency",
  missing_person: "Missing Person",
  road_blockage: "Road Blockage",
  food_shortage: "Food Shortage",
  shelter_need: "Shelter Need",
  general: "General",
};

export function RagSources({ sources }: RagSourcesProps) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">
        Sources
        <span className="ml-2 font-normal text-muted-foreground">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((source, index) => (
          <Card key={source.slug ?? `${source.title ?? "source"}-${index}`}>
            <CardContent className="flex flex-col gap-2 p-4">
              <p className="text-sm font-medium text-foreground">
                {source.title ?? "Untitled source"}
              </p>
              {source.category && (
                <Badge variant="default" className="w-fit">
                  {CATEGORY_LABELS[source.category]}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
