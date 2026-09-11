# HANDOFF_UI_UX_REDESIGN.md — RescueMesh AI Redesign Summary

## 1. Design System & Tokens
- **Brand Palette**:
  - Dark Mode (`:root` default): `--background: #07141C`, `--surface: #0C1E28`, `--surface-elevated: #112A36`, `--border: #203B47`, `--primary: #4AA7CB`, `--secondary: #2AA69A`, `--danger: #F06C6C`
  - Light Mode (`html.light`): `--background: #F4F8FA`, `--surface: #FFFFFF`, `--surface-elevated: #F9FCFD`, `--border: #D7E2E8`, `--primary: #0B5D7A`, `--secondary: #0F766E`, `--danger: #C53030`
- **Typography & Radius**: Standardized 8px rhythm, `--radius-sm` (0.5rem), `--radius-md` (0.75rem), `--radius-lg` (1rem).
- **Animation System**: Pure CSS `@keyframes` (`hero-fade-up`, `grid-pulse`, `shimmer`) + `SectionReveal` custom `IntersectionObserver` hook. Respects `prefers-reduced-motion`.

## 2. Navigation Architecture
- **Public Header (`/`)**: Transparent fixed header (`nav-bar.tsx`) with glassmorphism on scroll.
- **Application Sidebar (`/dashboard`, `/incidents`, `/map`, `/report`, `/ask`)**: Collapsible desktop sidebar (`sidebar.tsx`) + `AppLayout` shell + `MobileNav` bottom bar on screens `< lg`.
- **Layout Router**: `layout-router.tsx` dynamically routes page layouts based on path.

## 3. Key Pages & Features
- **Homepage (`/`)**: 9 narrative scroll sections featuring an SVG geographic grid, live incident statistics, platform capabilities, interactive live map showcase, data transformation demo, and trust principles.
- **Command Dashboard (`/dashboard`)**: KPI StatCards, `recharts` IncidentTrendChart (Area), SeverityDonutChart (Pie), TypeBarChart (Horizontal Bar), Needs Attention panel, IncidentMap centerpiece, and incident feed.
- **Incident List (`/incidents`)**: Operations center view with search and multi-select filtering by severity, type, and status.
- **Live Map Page (`/map`)**: Full-viewport map interface with floating controls and severity popups.
- **Incident Detail (`/incidents/[id]`)**: Case-file layout with indicator badges, needs breakdown, location specs, similar incidents detection, and M14 advisory intelligence briefings.

## 4. Engineering & Safety Compliance
- **Zero Fake Data**: All dashboard KPIs, charts, map markers, and feeds consume real data from `/api/incidents`.
- **Backend & Safety Untouched**: All `/api/` endpoints, Gemini integration, RAG vector retrieval, Supabase schema, priority scoring algorithm, and security keys remain 100% intact.
- **Build Verification**: `npx tsc --noEmit` passed with exit code 0. Production build (`npm run build`) succeeded across 17 static and dynamic routes.

## 5. Dependencies Added
- `recharts`: Interactive charting engine (AreaChart, PieChart, BarChart).
- `lucide-react`: Modern SVG icon set.
