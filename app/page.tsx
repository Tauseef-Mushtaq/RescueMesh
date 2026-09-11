"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  FileText,
  LayoutDashboard,
  Brain,
  Shield,
  Zap,
  Activity,
  MapPin,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionReveal } from "@/components/layout/section-reveal";
import dynamic from "next/dynamic";

const IncidentMap = dynamic(
  () => import("@/components/map/incident-map").then((m) => ({ default: m.IncidentMap })),
  {
    ssr: false,
    loading: () => <div className="h-[450px] w-full bg-surface-elevated animate-pulse rounded-xl" />,
  }
);

interface IncidentData {
  id: string;
  incidentType: any;
  summary: string | null;
  latitude: number | null;
  longitude: number | null;
  priorityScore: number | null;
  severity: any;
  status: string;
}

export default function Home() {
  const [incidents, setIncidents] = useState<IncidentData[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/incidents", { cache: "no-store" });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setIncidents(json.data);
        }
      } catch (err) {
        console.error("Failed loading incidents for homepage map", err);
      }
    }
    loadData();
  }, []);

  const criticalCount = incidents.filter((i) => i.severity === "CRITICAL").length;
  const totalAffected = incidents.reduce((acc, curr: any) => acc + (curr.peopleAffected || 0), 0);

  return (
    <main className="flex flex-col min-h-screen">
      {/* SECTION 1: HERO */}
      <section className="relative min-h-[90vh] flex flex-col justify-center items-center text-center px-4 sm:px-6 lg:px-8 pt-20 pb-16 overflow-hidden">
        {/* SVG Geographic Grid Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <svg
            className="w-full h-full opacity-20"
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
          >
            <defs>
              <pattern id="geo-grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="var(--primary)" strokeWidth="0.5" opacity="0.4" />
                <circle cx="60" cy="60" r="1.5" fill="var(--primary)" opacity="0.6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#geo-grid)" />
            <circle cx="50%" cy="40%" r="300" fill="none" stroke="var(--primary)" strokeWidth="1" strokeDasharray="4 8" className="opacity-30" />
            <circle cx="50%" cy="40%" r="500" fill="none" stroke="var(--primary)" strokeWidth="0.5" opacity="0.15" />
          </svg>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_20%,_var(--background)_80%)]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto space-y-6 animate-[hero-fade-up_0.8s_ease-out]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary-soft text-primary text-xs font-semibold tracking-wide">
            <Zap size={14} className="animate-pulse" />
            Disaster Intelligence & Emergency Coordination Platform
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]">
            When every second matters. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-strong to-secondary">
              Prioritized Rescue Intelligence.
            </span>
          </h1>

          <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            RescueMesh AI converts raw emergency reports in English, Urdu, and Roman Urdu into structured incident data, deterministic priority scores, and grounded rescue recommendations.
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <Link href="/report">
              <Button size="lg" className="bg-primary hover:bg-primary-strong text-primary-foreground font-bold px-8 shadow-lg shadow-primary/20">
                <FileText size={18} className="mr-2" />
                Report Emergency Now
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="border-border bg-surface-elevated/50 px-8 backdrop-blur">
                <LayoutDashboard size={18} className="mr-2" />
                Command Center
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-xs text-muted-foreground opacity-60">
          <span>Scroll to explore</span>
          <ChevronDown size={16} className="animate-bounce" />
        </div>
      </section>

      {/* SECTION 2: SYSTEM METRICS STRIP */}
      <section className="border-y border-border bg-surface py-8">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="space-y-1">
            <p className="text-3xl font-black text-primary">100%</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deterministic Priority</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-black text-secondary">768-D</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">pgvector Embeddings</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-black text-warning">3</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Languages (EN, UR, Roman)</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-black text-success">&lt; 2s</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Extraction Latency</p>
          </div>
        </div>
      </section>

      {/* SECTION 3: PROBLEM STATEMENT */}
      <section className="py-20 px-4 max-w-6xl mx-auto">
        <SectionReveal>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-4">
              <Badge variant="warning" className="w-fit">The Operational Challenge</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                Disasters move faster than information.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                In severe emergency events, thousands of unstructured messages flood social networks and helplines. Essential signals get lost in the noise, leaving coordinators unable to pinpoint critical life-threatening situations immediately.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { title: "Unstructured Multilingual Reports", desc: "Mixed English, Urdu, and Roman Urdu reports cannot be easily filtered by legacy systems.", color: "border-border text-muted-foreground" },
                { title: "Fragmented Situational Awareness", desc: "No central real-time view of incident locations, severity, or immediate needs.", color: "border-border text-muted-foreground" },
                { title: "Delayed Emergency Response", desc: "Manual triage leads to critical delays when time is the most vital factor.", color: "border-danger/40 text-danger bg-danger/5" }
              ].map((item, idx) => (
                <div key={idx} className={`p-4 rounded-xl border ${item.color} transition-all`}>
                  <h4 className="font-semibold text-sm text-foreground">{item.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>
      </section>

      {/* SECTION 4: RESCUEMESH ANSWER (Pipeline) */}
      <section className="py-20 bg-surface/50 border-y border-border px-4">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <Badge variant="info">The Workflow</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">From Chaos to Rescue Intelligence</h2>
            <p className="text-sm text-muted-foreground">Every incoming report travels through an automated 5-stage processing pipeline.</p>
          </div>

          <div className="grid sm:grid-cols-5 gap-4">
            {[
              { step: "01", title: "Report", desc: "Multi-lingual input in English, Urdu, or Roman Urdu" },
              { step: "02", title: "Structure", desc: "AI extracts facts, needs, and headcount" },
              { step: "03", title: "Embed", desc: "768-D vector generation for similarity search" },
              { step: "04", title: "Prioritize", desc: "100% deterministic priority score (0-100)" },
              { step: "05", title: "Respond", desc: "RAG guidance grounded in UN OCHA & NDMA" },
            ].map((st, i) => (
              <SectionReveal key={st.step} delay={(i % 4 + 1) as any}>
                <div className="p-4 rounded-xl border border-border bg-surface flex flex-col h-full justify-between hover:border-primary/40 transition-colors">
                  <div>
                    <span className="text-xs font-mono font-bold text-primary">{st.step}</span>
                    <h3 className="font-bold text-sm text-foreground mt-1">{st.title}</h3>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{st.desc}</p>
                  </div>
                </div>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5: PLATFORM CAPABILITIES */}
      <section className="py-20 px-4 max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground">An Integrated Disaster Intelligence Platform</h2>
          <p className="text-sm text-muted-foreground">Designed for coordinators, first responders, and emergency managers.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: FileText, title: "Emergency Reporting", desc: "User-friendly, multi-lingual intake interface with interactive MapLibre location picker." },
            { icon: LayoutDashboard, title: "Command Center", desc: "Live incident feed with severity distribution charts and status control lifecycle." },
            { icon: MapPin, title: "Geospatial Live Map", desc: "Real-time incident map showing high-risk clusters, critical status pulses, and location popups." },
            { icon: Brain, title: "RAG Knowledge Base", desc: "23 authoritative emergency protocols (UN OCHA, NDMA, WHO) stored in pgvector." },
            { icon: Zap, title: "Advisory Intelligence", desc: "On-demand AI briefings providing recommended actions, warnings, and missing information gaps." },
            { icon: Shield, title: "Duplicate Detection", desc: "Cosine vector similarity search automatically flags duplicate reports across zones." },
          ].map((cap, i) => (
            <SectionReveal key={cap.title} delay={(i % 3 + 1) as any}>
              <Card className="h-full hover:border-primary/40 transition-all">
                <CardContent className="p-6 space-y-3">
                  <div className="p-2.5 w-fit rounded-lg bg-primary-soft text-primary">
                    <cap.icon size={20} />
                  </div>
                  <h3 className="font-bold text-base text-foreground">{cap.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{cap.desc}</p>
                </CardContent>
              </Card>
            </SectionReveal>
          ))}
        </div>
      </section>

      {/* SECTION 6: LIVE MAP SHOWCASE */}
      <section className="py-16 bg-surface border-y border-border px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <Badge variant="critical" className="w-fit mb-2">Live Map Overview</Badge>
              <h2 className="text-2xl font-bold text-foreground">Active Incident Map</h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
              <span>Total Logged: <strong className="text-foreground">{incidents.length}</strong></span>
              <span>Critical: <strong className="text-critical">{criticalCount}</strong></span>
              <span>Affected: <strong className="text-foreground">{totalAffected}</strong></span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border shadow-2xl">
            <IncidentMap incidents={incidents} />
          </div>
        </div>
      </section>

      {/* SECTION 7: DEMO DATA TRANSFORMATION */}
      <section className="py-20 px-4 max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="info">Intelligence Pipeline Example</Badge>
          <h2 className="text-3xl font-bold text-foreground">From Raw Text to Actionable Insight</h2>
          <p className="text-xs text-muted-foreground">Illustrative demonstration of the extraction and advisory pipeline.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-border/80 bg-surface">
            <CardContent className="p-5 space-y-3">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">01 · Raw Input Report</span>
              <div className="p-3 rounded-lg bg-surface-elevated font-mono text-xs text-foreground/80 leading-relaxed border border-border/40">
                &quot;Pani ghar mein ghus raha hai, 4 log phanse hain, 2 bache hain. Medical help chahiye urgent!&quot;
              </div>
              <p className="text-[11px] text-muted-foreground">Roman Urdu report received via intake portal.</p>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary-soft/20">
            <CardContent className="p-5 space-y-3">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">02 · Extracted Fact Structure</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-semibold text-foreground">Flood</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">Severity:</span>
                  <Badge variant="critical">CRITICAL (75/100)</Badge>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-1">
                  <span className="text-muted-foreground">People Affected:</span>
                  <span className="font-semibold text-foreground">4 (2 Children)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Indicators:</span>
                  <span className="font-semibold text-danger">Immediate Danger, Medical</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-surface">
            <CardContent className="p-5 space-y-3">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-success">03 · Advisory Intelligence</span>
              <div className="space-y-2 text-xs text-foreground">
                <p className="font-semibold text-primary">Recommended Actions:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                  <li>Deploy water rescue unit immediately</li>
                  <li>Prepare pediatric medical kit</li>
                  <li>Check nearby shelter capacity</li>
                </ul>
                <div className="pt-2 text-[10px] text-muted-foreground border-t border-border/40">
                  Source: NDMA Flood Guidelines 2024
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECTION 8: TRUST PRINCIPLES */}
      <section className="py-16 bg-surface border-t border-border px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground">Responsible AI Architecture</h2>
            <p className="text-xs text-muted-foreground">AI proposes options; deterministic application code decides priority.</p>
          </div>

          <div className="grid sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-border bg-background space-y-1.5">
              <Shield size={18} className="text-primary" />
              <h4 className="font-semibold text-foreground">100% Deterministic Rules</h4>
              <p className="text-muted-foreground">Priority scores are calculated via strict math logic, never raw LLM numbers.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-background space-y-1.5">
              <Brain size={18} className="text-secondary" />
              <h4 className="font-semibold text-foreground">Verified Grounding</h4>
              <p className="text-muted-foreground">Advisories are retrieved from verified UN & NDMA manuals stored in pgvector.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-background space-y-1.5">
              <Lock size={18} className="text-warning" />
              <h4 className="font-semibold text-foreground">Privacy Protection</h4>
              <p className="text-muted-foreground">No unnecessary PII requested. All secrets remain strictly server-side.</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-background space-y-1.5">
              <CheckCircle2 size={18} className="text-success" />
              <h4 className="font-semibold text-foreground">Human Decision-Support</h4>
              <p className="text-muted-foreground">Humans retain final authority over rescue and resource dispatch decisions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 9: FINAL CTA */}
      <section className="py-20 px-4 bg-primary-soft/30 border-t border-primary/20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground">
            Better Information. Better Decisions. Faster Response.
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Explore the RescueMesh Command Center or submit an emergency report to test the intelligence engine.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <Link href="/report">
              <Button size="lg" className="bg-primary hover:bg-primary-strong text-primary-foreground font-bold px-8 shadow-md">
                Report Emergency Now
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="border-border bg-surface px-8">
                Command Center
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
