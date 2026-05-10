# Demo Configurations

Loadable BIPanel + AISidebar example configurations for the CPG-FMCG pack. Each config is a self-contained JSON file that the playground (in a future cycle) will be able to import to produce a one-click demo.

## Schema

Each demo config conforms to:

```jsonc
{
  "name": "<demo-name>",
  "displayName": "<Human-readable name>",
  "pack": "cpg-fmcg",
  "subVertical": "<sub-vertical-name>",       // matches a sub-vertical folder

  "biPanel": {
    "vendor": "<vendor>",                      // matches a bi-adapters/<vendor>/ folder
    "config": { ... }                          // adapter-specific config
  },

  "aiSidebar": {
    "connector": "<connector-profile-name>",   // matches a proxy connector profile
    "promptContext": "<inline string OR pack-relative path>",
    "suggestedQuestions": [ ... ]              // pulled from sub-vertical sample-questions
  },

  "metadata": {
    "scenario": "<one-paragraph what this demo proves>",
    "audiences": [ "exec", "ops", "ic" ],
    "estimatedSetupMinutes": 10,
    "dependencies": [ ... ]                    // datasets / connector profiles that must exist
  }
}
```

The runtime that consumes this schema does not exist yet. The configs here are the content seed that the runtime will be designed against.

## Configurations in this pack

### 1. Service-Margin Recovery — narrow vertical slice

[`service-margin-recovery.json`](service-margin-recovery.json)

The canonical "narrow but deep vertical slice" recommendation from the original CPG enterprise blueprint: service-level and margin recovery for one region, one category, one customer cluster. Crosses supply chain, commercial, finance, and retail without boiling the ocean.

### 2. Sustainability Cross-Cutting — overlay pattern

[`sustainability-cross-cutting.json`](sustainability-cross-cutting.json)

The canonical demonstration of the sustainability overlay pattern: a Scope 3 supplier-emissions question that the agent answers by composing data from procurement, vendor management, supply chain, and manufacturing — with framework citations throughout.

## Authoring a new demo config

1. Pick a sub-vertical and a real decision question from its `sample-questions.md`.
2. Choose a BI vendor (Y-axis) appropriate to where that decision typically lives in CPG estates (see the sub-vertical's `bi-ai-fit.md`).
3. Choose a connector profile (X-axis) appropriate to the question's AI shape requirement.
4. Compose prompt context inline or as a path reference into the sub-vertical's `prompt-context.md`.
5. Select 3-5 suggested questions from the sub-vertical's `sample-questions.md` to seed the sidebar.
6. Write a `scenario` field that names the decision the demo supports and the audiences it lands with.
