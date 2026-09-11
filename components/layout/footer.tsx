"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/80 bg-surface/80 backdrop-blur-md text-sm py-12 mt-16 transition-colors">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-4">
          <div className="space-y-3 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg text-foreground">
              <span className="text-cyan-500">RescueMesh</span> AI
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Intelligent Disaster Coordination & Emergency Intelligence Platform. Turning multi-lingual emergency reports into prioritized rescue intelligence.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">Navigation</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><Link href="/" className="hover:text-foreground transition-colors">Home</Link></li>
              <li><Link href="/report" className="hover:text-foreground transition-colors">Report Emergency</Link></li>
              <li><Link href="/dashboard" className="hover:text-foreground transition-colors">Command Center</Link></li>
              <li><Link href="/ask" className="hover:text-foreground transition-colors">Query RAG Knowledge</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">Attribution & Data</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>UN OCHA Emergency Protocols</li>
              <li>NDMA Disaster Guidelines</li>
              <li>WHO First Aid Guidelines</li>
              <li>OpenStreetMap / MapLibre</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">Emergency Hotlines</h4>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Rescue 1122:</strong> 1122</p>
              <p><strong className="text-foreground">NDMA Helpline:</strong> 1078</p>
              <p><strong className="text-foreground">Edhi Ambulance:</strong> 115</p>
              <p><strong className="text-foreground">Chhipa Welfare:</strong> 1020</p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/40 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2026 RescueMesh AI. Decision Support System — Humans remain responsible for emergency decisions.</p>
          <div className="flex gap-4">
            <span className="hover:text-foreground cursor-pointer">Privacy Protocol</span>
            <span className="hover:text-foreground cursor-pointer">Responsible AI</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
