"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";
import { RagAnswer } from "@/components/rag/rag-answer";
import { RagSources } from "@/components/rag/rag-sources";
import {
  MAX_QUERY_LENGTH,
  fallbackErrorForStatus,
  isRagSuccessData,
  isValidQuestion,
  type RagSuccessData,
} from "@/lib/rag/client-response";
import type { KnowledgeCategory } from "@/lib/supabase/types";

/**
 * "Ask RescueMesh" (M13) — a thin, honest UI over the existing,
 * already-verified POST /api/rag (M12). This page never talks to
 * Gemini/Supabase directly and never invents an answer, a source, or
 * a confidence signal beyond what that endpoint actually returns.
 *
 * Response shape (from app/api/rag/route.ts, read directly rather
 * than assumed — see lib/rag/client-response.ts):
 *   success: true  -> { data: { answer, sources: {title,slug,category}[],
 *                                knowledgeFound, retrievedChunks } }
 *   success: false -> { error: string }, with status 400/429/500/502/503
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

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as KnowledgeCategory[];

const SUGGESTED_QUESTIONS = [
  "What should I do during an earthquake?",
  "How do I prepare for a flood?",
  "What should be in an emergency kit?",
  "What should I do during a building collapse?",
  "What should I do if there is a fire?",
] as const;

const LOADING_MESSAGES = [
  "Searching RescueMesh knowledge…",
  "Preparing a grounded response…",
] as const;

type Status = "idle" | "loading" | "success" | "error";

export default function AskRescueMeshPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | KnowledgeCategory>("ALL");
  const [status, setStatus] = useState<Status>("idle");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [result, setResult] = useState<RagSuccessData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Belt-and-suspenders double-submit guard, in addition to disabling
  // the submit button while status === "loading" — a ref survives
  // even a rapid double-click before React re-renders the disabled
  // button.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setLoadingMessageIndex(1), 1400);
    return () => clearTimeout(timer);
  }, [status]);

  async function submitQuestion(question: string) {
    if (!isValidQuestion(question)) return;
    const trimmed = question.trim();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setStatus("loading");
    setLoadingMessageIndex(0);
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          category === "ALL" ? { query: trimmed } : { query: trimmed, category }
        ),
      });

      let payload: { success?: boolean; data?: unknown; error?: string };
      try {
        payload = await response.json();
      } catch {
        setErrorMessage(
          "RescueMesh AI sent back a response we couldn't understand. Please try again."
        );
        setStatus("error");
        return;
      }

      if (!response.ok || payload.success !== true) {
        setErrorMessage(payload.error ?? fallbackErrorForStatus(response.status));
        setStatus("error");
        return;
      }

      if (!isRagSuccessData(payload.data)) {
        setErrorMessage(
          "RescueMesh AI sent back a response we couldn't understand. Please try again."
        );
        setStatus("error");
        return;
      }

      setResult(payload.data);
      setStatus("success");
    } catch {
      setErrorMessage(
        "Couldn't reach RescueMesh AI. Check your connection and try again."
      );
      setStatus("error");
    } finally {
      submittingRef.current = false;
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submitQuestion(query);
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitQuestion(query);
    }
  }

  function handleSuggestionClick(question: string) {
    setQuery(question);
    submitQuestion(question);
  }

  const isSubmitDisabled = status === "loading" || !isValidQuestion(query);

  return (
    <main className="flex flex-1">
      <PageShell className="max-w-3xl">
        <SectionHeader
          title="Ask RescueMesh"
          description="Get practical emergency guidance from RescueMesh's verified knowledge base."
        />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="ask-question" className="text-sm font-medium text-foreground">
            Your question
          </label>
          <Textarea
            id="ask-question"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Ask what to do during a flood, earthquake, fire, or other emergency…"
            className="min-h-28"
            maxLength={MAX_QUERY_LENGTH}
            disabled={status === "loading"}
            aria-describedby="ask-question-hint"
          />
          <div
            id="ask-question-hint"
            className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
          >
            <span>Press Ctrl+Enter (or ⌘+Enter) to submit.</span>
            <span>
              {query.length}/{MAX_QUERY_LENGTH}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="ask-category" className="text-sm font-medium text-foreground">
              Category
            </label>
            <Select
              id="ask-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as "ALL" | KnowledgeCategory)}
              disabled={status === "loading"}
              className="sm:w-64"
            >
              <option value="ALL">All categories</option>
              {CATEGORY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <Button type="submit" disabled={isSubmitDisabled} className="w-fit">
            {status === "loading" ? "Asking…" : "Ask RescueMesh"}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Suggested questions</h3>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => handleSuggestionClick(question)}
                disabled={status === "loading"}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-6">
          {status === "loading" && (
            <Card>
              <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground" role="status">
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent"
                  aria-hidden="true"
                />
                {LOADING_MESSAGES[loadingMessageIndex]}
              </CardContent>
            </Card>
          )}

          {status === "error" && errorMessage && (
            <Card>
              <CardContent className="p-5 text-sm text-destructive" role="alert">
                {errorMessage}
              </CardContent>
            </Card>
          )}

          {status === "success" && result && result.knowledgeFound && (
            <>
              <RagAnswer answer={result.answer} knowledgeFound={result.knowledgeFound} />
              <RagSources sources={result.sources} />
            </>
          )}

          {status === "success" && result && !result.knowledgeFound && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
                <Badge variant="warning" className="w-fit">
                  No verified knowledge found
                </Badge>
                <p className="text-sm text-foreground">
                  RescueMesh could not find trusted guidance for this question in its
                  current knowledge base.
                </p>
                <p className="text-sm text-muted-foreground">
                  Try a disaster-related question, pick one of the suggestions above, or
                  head back to the{" "}
                  <a href="/dashboard" className="text-accent underline underline-offset-2">
                    emergency dashboard
                  </a>
                  .
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </PageShell>
    </main>
  );
}
