"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";

const FAQS = [
  {
    q: "How does RescueMesh AI prioritize emergency reports?",
    a: "RescueMesh uses a 100% deterministic priority scoring algorithm. It evaluates risk factors extracted by AI (+25 for Immediate Danger, +20 for Medical Emergency, +20 for Children, +15 for Mobility Impairment). AI proposes facts, but application logic strictly determines priority scores.",
  },
  {
    q: "Can RescueMesh understand Urdu and Roman Urdu?",
    a: "Yes! RescueMesh AI natively understands unstructured emergency reports submitted in English, Urdu (اردو), and Roman Urdu (e.g. 'Pani ghar mein aa gaya hai'), converting them into structured incident records.",
  },
  {
    q: "How does Retrieval-Augmented Generation (RAG) help rescue teams?",
    a: "RescueMesh embeds verified disaster response guidelines into Supabase pgvector. When coordinators view an incident, the system retrieves relevant authoritative protocols (UN OCHA, NDMA, WHO) and generates source-cited recommendations.",
  },
  {
    q: "How are duplicate reports handled during large disasters?",
    a: "RescueMesh generates 768-dimensional vector embeddings for incoming reports. It uses pgvector cosine similarity to automatically detect duplicate reports (≥ 75% similarity) and alerts emergency coordinators.",
  },
];

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero Section with Cinematic Background */}
      <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-surface-elevated/90 via-surface/80 to-background py-20 lg:py-32 transition-colors">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-background to-background pointer-events-none" />
        
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <div className="flex justify-center">
            <Badge variant="info" className="px-3.5 py-1 text-xs font-semibold tracking-wider uppercase bg-cyan-500/10 text-cyan-500 border border-cyan-500/30">
              Disaster Response & Emergency Coordination Platform
            </Badge>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl max-w-4xl mx-auto leading-tight">
            Turn Chaotic Multilingual Reports into <span className="text-cyan-500">Prioritized Rescue Intelligence</span>
          </h1>

          <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            When disaster strikes, information becomes chaotic. RescueMesh AI converts raw emergency messages into structured incidents, deterministic priority scores, and grounded rescue recommendations.
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <Link href="/report">
              <Button size="lg" className="bg-cyan-500 hover:bg-cyan-600 text-black font-bold px-8 shadow-lg shadow-cyan-500/20 transition-all">
                Report Emergency Now
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="border-border/80 px-8 backdrop-blur-md">
                Command Center
              </Button>
            </Link>
            <Link href="/ask">
              <Button variant="ghost" size="lg" className="text-muted-foreground hover:text-foreground">
                Query Knowledge Base &rarr;
              </Button>
            </Link>
          </div>

          {/* Hero Imagery Banner */}
          <div className="mt-12 overflow-hidden rounded-2xl border border-border/80 bg-surface-elevated/60 shadow-2xl">
            <img
              src="https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=1200&q=80"
              alt="Flood Disaster Response Awareness"
              className="w-full h-[320px] sm:h-[420px] object-cover opacity-85 hover:opacity-100 transition-opacity"
            />
          </div>
        </div>
      </section>

      <PageShell>
        {/* Real-time System Performance Banner */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="border-border/60 bg-surface/50 text-center p-5">
            <span className="text-3xl font-black text-cyan-500">100%</span>
            <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">Deterministic Priority</p>
          </Card>
          <Card className="border-border/60 bg-surface/50 text-center p-5">
            <span className="text-3xl font-black text-amber-500">768-Dim</span>
            <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">pgvector Embeddings</p>
          </Card>
          <Card className="border-border/60 bg-surface/50 text-center p-5">
            <span className="text-3xl font-black text-emerald-500">3 Languages</span>
            <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">EN, UR, Roman Urdu</p>
          </Card>
          <Card className="border-border/60 bg-surface/50 text-center p-5">
            <span className="text-3xl font-black text-purple-500">&lt; 2s</span>
            <p className="text-xs text-muted-foreground font-semibold uppercase mt-1">AI Extraction Latency</p>
          </Card>
        </div>

        {/* Affected Communities Awareness Section */}
        <section className="space-y-6 pt-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Rapid Emergency Intelligence for Affected Communities
            </h2>
            <p className="text-sm text-muted-foreground">
              Every second matters during floods, earthquakes, and structural collapses. RescueMesh bridges the gap between chaotic reports and life-saving coordination.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <Card className="overflow-hidden border-border/60 bg-surface/40">
              <img
                src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80"
                alt="Flood Victims Relief"
                className="w-full h-48 object-cover"
              />
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground">Flood Evacuation & Rescue</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground leading-relaxed">
                Identifies trapped families, rising water levels, and mobility-impaired individuals automatically from natural language reports.
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/60 bg-surface/40">
              <img
                src="https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?auto=format&fit=crop&w=600&q=80"
                alt="Medical Trauma Emergency"
                className="w-full h-48 object-cover"
              />
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground">Medical & Trauma Emergency</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground leading-relaxed">
                Scores trauma situations and medical emergencies deterministically to ensure critical patients receive immediate coordinator attention.
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/60 bg-surface/40">
              <img
                src="https://images.unsplash.com/photo-1578357078586-491adf1aa5ba?auto=format&fit=crop&w=600&q=80"
                alt="Disaster Relief Supplies"
                className="w-full h-48 object-cover"
              />
              <CardHeader>
                <CardTitle className="text-base font-bold text-foreground">Relief & Supply Shortages</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground leading-relaxed">
                Tracks food, clean water, and infant formula shortages across disaster zones for efficient resource deployment.
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Verified Humanitarian Organizations Information */}
        <section className="rounded-2xl border border-border/80 bg-surface-elevated/40 p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-foreground">Authoritative Guidance Sources</h3>
              <p className="text-xs text-muted-foreground">RescueMesh AI grounds recommendations in verified international & national guidelines.</p>
            </div>
            <Badge variant="info" className="border-cyan-500/40 text-cyan-500">
              UN OCHA & NDMA Standardized
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border border-border/60 p-4 bg-background/50 space-y-1.5">
              <h4 className="font-semibold text-foreground">UN OCHA Standards</h4>
              <p className="text-muted-foreground">International emergency response classification and search-and-rescue coordination frameworks.</p>
            </div>
            <div className="rounded-lg border border-border/60 p-4 bg-background/50 space-y-1.5">
              <h4 className="font-semibold text-foreground">NDMA Guidelines</h4>
              <p className="text-muted-foreground">National Disaster Management Authority protocols for flood, monsoon, and earthquake response.</p>
            </div>
            <div className="rounded-lg border border-border/60 p-4 bg-background/50 space-y-1.5">
              <h4 className="font-semibold text-foreground">WHO Emergency Care</h4>
              <p className="text-muted-foreground">World Health Organization first-aid and field trauma medical guidance.</p>
            </div>
          </div>
        </section>

        {/* Frequently Asked Questions (FAQ) Section */}
        <section className="space-y-6 pt-6">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-foreground">Frequently Asked Questions</h2>
            <p className="text-sm text-muted-foreground">Learn more about RescueMesh AI's architecture, priority scoring, and RAG capabilities.</p>
          </div>

          <div className="space-y-3 max-w-3xl mx-auto">
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.q}
                  className="rounded-xl border border-border/60 bg-surface/50 overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="flex w-full items-center justify-between p-4 text-left font-semibold text-sm text-foreground hover:bg-surface-elevated/40"
                  >
                    <span>{faq.q}</span>
                    <span className="text-cyan-500 ml-4 font-bold">{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/30 bg-surface-elevated/20">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </PageShell>
    </main>
  );
}
