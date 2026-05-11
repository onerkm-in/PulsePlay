// playground/src/pulse/_packs/index.ts
//
// Aggregator for PulsePlay vertical packs. Today only CPG/FMCG is present;
// future packs (e.g. healthcare, telco, banking) drop in alongside and
// register the same way.
//
// The `insightsPresetLibrary.ts` module imports `PACK_CUSTOM_SECTION_PRESETS`
// from here and appends it to the upstream-Pulse `CUSTOM_SECTION_PRESETS`
// array — additive merge, no replacement of any heritage Pulse preset.

import type { CustomSectionPreset } from "../insightsPresetLibrary";
import { CPG_FMCG_CUSTOM_SECTION_PRESETS } from "./cpgFmcgPresets";

export const PACK_CUSTOM_SECTION_PRESETS: CustomSectionPreset[] = [
    ...CPG_FMCG_CUSTOM_SECTION_PRESETS,
];

export { CPG_FMCG_CUSTOM_SECTION_PRESETS };
