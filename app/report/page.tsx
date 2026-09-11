"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";
import { LocationPickerMap } from "@/components/map/location-picker-map";
import type { IncidentSeverity, IncidentType } from "@/lib/supabase/types";

/** Shape of the persisted incident returned by POST /api/incidents. */
interface CreatedIncident {
  id: string;
  incidentType: IncidentType | null;
  language: string | null;
  summary: string | null;
  priorityScore: number | null;
  severity: IncidentSeverity | null;
  status: string;
  needs: string[];
  createdAt: string;
}

/**
 * Local shape of the emergency-report form. Not yet the final
 * database/domain model — M05+ will map this into the structured
 * incident sent through AI extraction and persistence.
 */
interface ReportFormData {
  reportText: string;
  reporterName: string;
  reporterContact: string;
  imageFile: File | null;
  imageUrl: string | null;
  latitude: string;
  longitude: string;
  peopleAffected: string;
  childrenCount: string;
  elderlyCount: string;
  language: "auto" | "en" | "ur" | "ur-roman";
  immediateDanger: boolean;
  medicalEmergency: boolean;
  mobilityImpairment: boolean;
  foodShortage: boolean;
  waterRisk: boolean;
  needs: string[];
}

const NEEDS_OPTIONS = [
  "Medical assistance",
  "Food",
  "Water",
  "Shelter",
  "Evacuation",
  "Mobility assistance",
  "Rescue",
  "Missing person assistance",
  "Other",
];

const CONDITION_FIELDS: {
  key: keyof Pick<
    ReportFormData,
    | "immediateDanger"
    | "medicalEmergency"
    | "mobilityImpairment"
    | "foodShortage"
    | "waterRisk"
  >;
  label: string;
}[] = [
  { key: "immediateDanger", label: "Immediate danger to life" },
  { key: "medicalEmergency", label: "Medical emergency" },
  { key: "mobilityImpairment", label: "Someone has a mobility impairment" },
  { key: "foodShortage", label: "Food shortage" },
  { key: "waterRisk", label: "Water-related risk (e.g. rising water)" },
];

const INITIAL_FORM_DATA: ReportFormData = {
  reportText: "",
  reporterName: "",
  reporterContact: "",
  imageFile: null,
  imageUrl: null,
  latitude: "",
  longitude: "",
  peopleAffected: "",
  childrenCount: "",
  elderlyCount: "",
  language: "auto",
  immediateDanger: false,
  medicalEmergency: false,
  mobilityImpairment: false,
  foodShortage: false,
  waterRisk: false,
  needs: [],
};

type FormErrors = Partial<
  Record<
    | "reportText"
    | "latitude"
    | "longitude"
    | "peopleAffected"
    | "childrenCount"
    | "elderlyCount",
    string
  >
>;

function isBlank(value: string) {
  return value.trim().length === 0;
}

function validate(data: ReportFormData): FormErrors {
  const errors: FormErrors = {};

  const trimmedReport = data.reportText.trim();
  if (trimmedReport.length === 0) {
    errors.reportText = "Please describe what happened.";
  } else if (trimmedReport.length < 10) {
    errors.reportText = "Please add a bit more detail (at least 10 characters).";
  } else if (trimmedReport.length > 10000) {
    errors.reportText = "Description is too long (maximum 10,000 characters).";
  }

  if (!isBlank(data.latitude)) {
    const lat = Number(data.latitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = "Latitude must be between -90 and 90.";
    }
  }

  if (!isBlank(data.longitude)) {
    const lng = Number(data.longitude);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = "Longitude must be between -180 and 180.";
    }
  }

  if (!isBlank(data.peopleAffected)) {
    const value = Number(data.peopleAffected);
    if (!Number.isInteger(value) || value < 0) {
      errors.peopleAffected = "Enter a whole number, 0 or more.";
    }
  }

  if (!isBlank(data.childrenCount)) {
    const value = Number(data.childrenCount);
    if (!Number.isInteger(value) || value < 0) {
      errors.childrenCount = "Enter a whole number, 0 or more.";
    }
  }

  if (!isBlank(data.elderlyCount)) {
    const value = Number(data.elderlyCount);
    if (!Number.isInteger(value) || value < 0) {
      errors.elderlyCount = "Enter a whole number, 0 or more.";
    }
  }

  return errors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
      <span aria-hidden="true">⚠</span>
      {message}
    </p>
  );
}

/**
 * Purely cosmetic, frontend-only staging for the analysis wait time
 * described in the PRD (section 11.3): REPORT RECEIVED -> UNDERSTANDING
 * INCIDENT -> ASSESSING RISK -> SEARCHING KNOWLEDGE -> GENERATING RESPONSE.
 * This never blocks or delays the real request — the actual POST
 * /api/incidents call runs concurrently. If the real call finishes before
 * the animation does, the animation is short-circuited immediately so the
 * result never waits on a fake timer. If it takes longer, the sequence
 * simply holds on its final stage until the real response arrives.
 */
const PROCESSING_STAGES = [
  "Report received",
  "Understanding incident",
  "Assessing risk",
  "Searching knowledge",
  "Generating response",
] as const;

const STAGE_INTERVAL_MS = 900;

function AIProcessingSequence({ active }: { active: boolean }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => setStageIndex(0));
      return;
    }
    const timer = window.setInterval(() => {
      setStageIndex((prev) => Math.min(prev + 1, PROCESSING_STAGES.length - 1));
    }, STAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface px-4 py-3"
    >
      {PROCESSING_STAGES.map((stage, index) => {
        const state =
          index < stageIndex ? "done" : index === stageIndex ? "active" : "pending";
        return (
          <div key={stage} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={
                state === "done"
                  ? "text-cyan-500"
                  : state === "active"
                    ? "animate-pulse text-cyan-500"
                    : "text-muted-foreground"
              }
            >
              {state === "done" ? "✓" : state === "active" ? "●" : "○"}
            </span>
            <span
              className={
                state === "pending"
                  ? "text-muted-foreground"
                  : "font-medium text-foreground"
              }
            >
              {stage}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ReportPage() {
  const [formData, setFormData] = useState<ReportFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [incidentResult, setIncidentResult] = useState<CreatedIncident | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateField<K extends keyof ReportFormData>(
    key: K,
    value: ReportFormData[K]
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleNeed(need: string) {
    setFormData((prev) => ({
      ...prev,
      needs: prev.needs.includes(need)
        ? prev.needs.filter((n) => n !== need)
        : [...prev.needs, need],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    setIncidentResult(null);
    setSubmitError(null);

    const validationErrors = validate(formData);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    let uploadedImageUrl = formData.imageUrl;

    if (formData.imageFile) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const fileExt = formData.imageFile.name.split(".").pop() || "jpg";
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const { data: storageData, error: storageError } = await supabase.storage
          .from("incident-evidence")
          .upload(fileName, formData.imageFile);

        if (storageData && !storageError) {
          const { data: publicUrlData } = supabase.storage
            .from("incident-evidence")
            .getPublicUrl(fileName);
          uploadedImageUrl = publicUrlData.publicUrl;
        }
      } catch (err) {
        console.warn("Storage upload fallback:", err);
      }
    }

    const structuredReport = {
      reportText: formData.reportText.trim(),
      reporterName: formData.reporterName.trim() || null,
      reporterContact: formData.reporterContact.trim() || null,
      imageUrl: uploadedImageUrl || null,
      latitude: isBlank(formData.latitude) ? null : Number(formData.latitude),
      longitude: isBlank(formData.longitude) ? null : Number(formData.longitude),
      peopleAffected: isBlank(formData.peopleAffected)
        ? null
        : Number(formData.peopleAffected),
      childrenCount: isBlank(formData.childrenCount)
        ? null
        : Number(formData.childrenCount),
      elderlyCount: isBlank(formData.elderlyCount)
        ? null
        : Number(formData.elderlyCount),
      language: formData.language,
      immediateDanger: formData.immediateDanger,
      medicalEmergency: formData.medicalEmergency,
      mobilityImpairment: formData.mobilityImpairment,
      foodShortage: formData.foodShortage,
      waterRisk: formData.waterRisk,
      needs: formData.needs,
    };

    setSubmitted(true);
    setAnalyzing(true);

    try {
      const response = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(structuredReport),
      });

      const payload: { success: boolean; data?: CreatedIncident; error?: string } =
        await response.json();

      if (!response.ok || !payload.success || !payload.data) {
        setSubmitError(
          payload.error ?? "The report could not be submitted. Please try again."
        );
      } else {
        setIncidentResult(payload.data);
      }
    } catch {
      setSubmitError("The report could not be submitted. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <main className="flex flex-1">
      <PageShell className="max-w-2xl">
        <SectionHeader
          title="Report an Emergency"
          description="Describe what's happening in your own words. Your report will be analyzed to help coordinators understand and prioritize the situation."
        />

        <p className="rounded-md border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
          RescueMesh is a decision-support prototype. For immediate danger,
          contact local emergency services.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-foreground">
                What happened?
              </h3>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="reportText" className="text-sm font-medium text-foreground">
                  Emergency description <span aria-hidden="true">*</span>
                  <span className="sr-only"> (required)</span>
                </label>
                <Textarea
                  id="reportText"
                  required
                  rows={6}
                  placeholder="What happened? Where? How many people are affected? Any immediate dangers or urgent needs?"
                  value={formData.reportText}
                  onChange={(e) => updateField("reportText", e.target.value)}
                  invalid={Boolean(errors.reportText)}
                  aria-describedby="reportText-error"
                />
                <div id="reportText-error">
                  <FieldError message={errors.reportText} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="reporterName" className="text-sm font-medium text-foreground">
                    Your Name / Identifier (optional)
                  </label>
                  <Input
                    id="reporterName"
                    type="text"
                    placeholder="e.g. Tauseef / Resident"
                    value={formData.reporterName}
                    onChange={(e) => updateField("reporterName", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="reporterContact" className="text-sm font-medium text-foreground">
                    Phone / WhatsApp Number (optional for rescue team)
                  </label>
                  <Input
                    id="reporterContact"
                    type="tel"
                    placeholder="e.g. +92 300 1234567"
                    value={formData.reporterContact}
                    onChange={(e) => updateField("reporterContact", e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="evidenceImage" className="text-sm font-medium text-foreground">
                  Upload Visual Evidence / Disaster Image (optional)
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <Input
                    id="evidenceImage"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file) {
                        const localPreview = URL.createObjectURL(file);
                        setFormData((prev) => ({
                          ...prev,
                          imageFile: file,
                          imageUrl: localPreview,
                        }));
                      }
                    }}
                    className="text-xs file:bg-primary file:text-primary-foreground file:font-semibold file:border-0 file:rounded file:px-2 file:py-1 hover:file:bg-primary-strong"
                  />
                  {formData.imageUrl && (
                    <div className="relative h-14 w-20 rounded border border-border overflow-hidden bg-black shrink-0">
                      <img
                        src={formData.imageUrl}
                        alt="Evidence preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  Location Selection (Click on Map or enter coordinates below)
                </label>
                <LocationPickerMap
                  latitude={formData.latitude !== "" ? Number(formData.latitude) : null}
                  longitude={formData.longitude !== "" ? Number(formData.longitude) : null}
                  onSelectLocation={(lat, lng) => {
                    updateField("latitude", String(lat));
                    updateField("longitude", String(lng));
                  }}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="latitude" className="text-sm font-medium text-foreground">
                    Latitude (optional)
                  </label>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    placeholder="e.g. 24.8607"
                    value={formData.latitude}
                    onChange={(e) => updateField("latitude", e.target.value)}
                    invalid={Boolean(errors.latitude)}
                    aria-describedby="latitude-error"
                  />
                  <div id="latitude-error">
                    <FieldError message={errors.latitude} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="longitude" className="text-sm font-medium text-foreground">
                    Longitude (optional)
                  </label>
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    placeholder="e.g. 67.0011"
                    value={formData.longitude}
                    onChange={(e) => updateField("longitude", e.target.value)}
                    invalid={Boolean(errors.longitude)}
                    aria-describedby="longitude-error"
                  />
                  <div id="longitude-error">
                    <FieldError message={errors.longitude} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label htmlFor="peopleAffected" className="text-sm font-medium text-foreground">
                    People affected
                  </label>
                  <Input
                    id="peopleAffected"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={formData.peopleAffected}
                    onChange={(e) => updateField("peopleAffected", e.target.value)}
                    invalid={Boolean(errors.peopleAffected)}
                    aria-describedby="peopleAffected-error"
                  />
                  <div id="peopleAffected-error">
                    <FieldError message={errors.peopleAffected} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="childrenCount" className="text-sm font-medium text-foreground">
                    Children (optional)
                  </label>
                  <Input
                    id="childrenCount"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={formData.childrenCount}
                    onChange={(e) => updateField("childrenCount", e.target.value)}
                    invalid={Boolean(errors.childrenCount)}
                    aria-describedby="childrenCount-error"
                  />
                  <div id="childrenCount-error">
                    <FieldError message={errors.childrenCount} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="elderlyCount" className="text-sm font-medium text-foreground">
                    Elderly (optional)
                  </label>
                  <Input
                    id="elderlyCount"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={formData.elderlyCount}
                    onChange={(e) => updateField("elderlyCount", e.target.value)}
                    invalid={Boolean(errors.elderlyCount)}
                    aria-describedby="elderlyCount-error"
                  />
                  <div id="elderlyCount-error">
                    <FieldError message={errors.elderlyCount} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="language" className="text-sm font-medium text-foreground">
                  Report language
                </label>
                <Select
                  id="language"
                  value={formData.language}
                  onChange={(e) =>
                    updateField(
                      "language",
                      e.target.value as ReportFormData["language"]
                    )
                  }
                >
                  <option value="auto">Auto Detect</option>
                  <option value="en">English</option>
                  <option value="ur">Urdu</option>
                  <option value="ur-roman">Roman Urdu</option>
                </Select>
              </div>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium text-foreground">
                  Immediate conditions
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CONDITION_FIELDS.map(({ key, label }) => (
                    <label
                      key={key}
                      htmlFor={key}
                      className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                    >
                      <input
                        id={key}
                        type="checkbox"
                        checked={formData[key]}
                        onChange={(e) => updateField(key, e.target.checked)}
                        className="h-4 w-4 rounded border-border accent-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium text-foreground">
                  Immediate needs (optional)
                </legend>
                <div className="flex flex-wrap gap-2">
                  {NEEDS_OPTIONS.map((need) => {
                    const selected = formData.needs.includes(need);
                    return (
                      <button
                        key={need}
                        type="button"
                        onClick={() => toggleNeed(need)}
                        aria-pressed={selected}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full"
                      >
                        <Badge
                          variant={selected ? "info" : "default"}
                          className="cursor-pointer select-none"
                        >
                          {selected ? "✓ " : ""}
                          {need}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </CardContent>

            <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              {!submitted && (
                <span className="text-xs text-muted-foreground">
                  * Required field
                </span>
              )}
              <Button type="submit" className="sm:w-auto" disabled={analyzing}>
                {analyzing ? "Analyzing…" : "Submit report"}
              </Button>
            </CardFooter>
          </Card>
        </form>

        <AIProcessingSequence active={analyzing} />

        {!analyzing && submitError && (
          <p role="alert" className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-destructive">
            {submitError}
          </p>
        )}

        {!analyzing && incidentResult && (
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-foreground">
                Incident created
              </h3>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-foreground">
              <p role="status">
                Report captured, analyzed, and saved. A coordinator will be
                able to review it.
              </p>
              <div className="flex flex-wrap gap-2">
                {incidentResult.incidentType && (
                  <Badge variant="info">
                    Incident type: {incidentResult.incidentType}
                  </Badge>
                )}
                {incidentResult.language && (
                  <Badge>Language: {incidentResult.language}</Badge>
                )}
                {incidentResult.severity && incidentResult.priorityScore !== null && (
                  <Badge
                    variant={
                      incidentResult.severity === "CRITICAL"
                        ? "critical"
                        : incidentResult.severity === "HIGH"
                          ? "high"
                          : incidentResult.severity === "MODERATE"
                            ? "moderate"
                            : "low"
                    }
                  >
                    Priority: {incidentResult.priorityScore}/100 ·{" "}
                    {incidentResult.severity}
                  </Badge>
                )}
              </div>
              {incidentResult.summary && (
                <p>
                  <span className="font-medium">Summary:</span>{" "}
                  {incidentResult.summary}
                </p>
              )}
              {incidentResult.needs.length > 0 && (
                <p>
                  <span className="font-medium">Needs:</span>{" "}
                  {incidentResult.needs.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </PageShell>
    </main>
  );
}
