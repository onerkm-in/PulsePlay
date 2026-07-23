// Industry rule 6: icons are Lucide at strokeWidth 1.5 — no emoji-as-UI and no
// ad-hoc inline SVGs on PulsePlay-native surfaces. This module bakes the stroke
// weight in so call sites can't drift; pass `size` (px) as needed.
//
// Scope note: pulse/* (the Pulse-ported compat surface) must stay dependency-
// free for the pbiviz sibling sync, so it does NOT import from here — it keeps
// self-contained inline SVGs instead.

import type { LucideIcon, LucideProps } from "lucide-react";
import {
    AlertTriangle,
    BarChart3,
    Compass,
    LayoutDashboard,
    Search,
    Server,
    Settings,
    Sparkles,
    SlidersHorizontal,
    Target,
    Wrench,
} from "lucide-react";

function styled(Icon: LucideIcon) {
    function StyledIcon(props: LucideProps) {
        return <Icon strokeWidth={1.5} size={16} aria-hidden="true" {...props} />;
    }
    StyledIcon.displayName = `Industry(${Icon.displayName || Icon.name || "Icon"})`;
    return StyledIcon;
}

export const GearIcon = styled(Settings);
export const WarnIcon = styled(AlertTriangle);
export const SparklesIcon = styled(Sparkles);
export const SearchIcon = styled(Search);
export const BarChartIcon = styled(BarChart3);
export const TargetIcon = styled(Target);
export const WrenchIcon = styled(Wrench);
export const CompassIcon = styled(Compass);
export const DashboardIcon = styled(LayoutDashboard);
export const SlidersIcon = styled(SlidersHorizontal);
export const ServerIcon = styled(Server);
