"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SimilarIncidentResult } from "@/lib/incidents/similarity";

interface SimilarIncidentsProps {
  incidentId: string;
  reportText: string | null;
  summary: string | null;
}

export function SimilarIncidentsSection({ incidentId, reportText, summary }: SimilarIncidentsProps) {
  const [matches, setMatches] = useState<SimilarIncidentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // Coordinator's per-match decision, kept client-side only — no schema
  // field exists for "dismissed"/"confirmed duplicate" suggestions, so
  // this never claims to persist a merge relationship. "Mark as Duplicate"
  // performs the one real, persisted action available today: resolving
  // the matched incident's status via the existing PATCH endpoint, with
  // an explicit coordinator confirmation step first.
  const [decisions, setDecisions] = useState<Record<string, "merged" | "kept_separate">>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchSimilar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId,
          queryText: summary || reportText || undefined,
          threshold: 0.45,
          limit: 5,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Unable to retrieve similar incidents.");
      } else {
        setMatches(data.matches || []);
      }
    } catch {
      setError("Network error while searching for similar incidents.");
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [incidentId, reportText, summary]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchSimilar();
    });
  }, [fetchSimilar]);

  function keepSeparate(matchId: string) {
    setDecisions((prev) => ({ ...prev, [matchId]: "kept_separate" }));
  }

  async function markAsDuplicate(matchId: string) {
    const confirmed = window.confirm(
      "Mark this incident as a duplicate? It will be set to RESOLVED status. This does not delete any data — both reports remain in the system and can be reviewed independently."
    );
    if (!confirmed) return;

    setActingId(matchId);
    setActionError(null);
    try {
      const res = await fetch(`/api/incidents/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Unable to update the duplicate incident.");
        return;
      }
      setDecisions((prev) => ({ ...prev, [matchId]: "merged" }));
    } catch {
      setActionError("Network error while updating the duplicate incident.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold tracking-tight">
          Semantic Similarity & Duplicate Suggestions
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSimilar}
          disabled={loading}
        >
          {loading ? "Searching..." : "Refresh Similarity"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !searched && (
          <p className="text-sm text-muted-foreground animate-pulse" role="status">
            Comparing incident embedding against database...
          </p>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {searched && !loading && matches.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            No duplicate or highly similar incidents detected (above similarity threshold).
          </p>
        )}

        {actionError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive" role="alert">
            {actionError}
          </div>
        )}

        {matches.length > 0 && (
          <div className="space-y-3">
            {matches.map((match) => {
              const isProbableDuplicate = match.similarityPercentage >= 75;
              const severityVariant: Record<string, BadgeVariant> = {
                CRITICAL: "critical",
                HIGH: "high",
                MODERATE: "moderate",
                LOW: "low",
              };
              const decision = decisions[match.id];

              return (
                <div
                  key={match.id}
                  className={`rounded-lg border p-3.5 transition-colors ${
                    isProbableDuplicate
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border/40 bg-muted/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {match.similarityPercentage}% Match
                      </span>
                      {isProbableDuplicate && (
                        <Badge variant="high">Probable Duplicate</Badge>
                      )}
                      {match.severity && (
                        <Badge variant={severityVariant[match.severity] || "default"}>
                          {match.severity}
                        </Badge>
                      )}
                      {decision === "merged" && (
                        <Badge variant="success">Marked duplicate · resolved</Badge>
                      )}
                      {decision === "kept_separate" && (
                        <Badge variant="default">Kept separate</Badge>
                      )}
                    </div>
                    <Link
                      href={`/incidents/${match.id}`}
                      className="text-xs font-medium text-cyan-400 hover:underline"
                    >
                      View Incident &rarr;
                    </Link>
                  </div>
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {match.summary || "No summary provided"}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {match.reportText}
                  </p>

                  {!decision && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actingId === match.id}
                        onClick={() => markAsDuplicate(match.id)}
                      >
                        {actingId === match.id ? "Updating..." : "Mark as Duplicate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingId === match.id}
                        onClick={() => keepSeparate(match.id)}
                      >
                        Keep Separate
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
