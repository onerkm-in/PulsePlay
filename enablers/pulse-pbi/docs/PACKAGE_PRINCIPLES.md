# Package Principles

## Core Principle

This package must be built and maintained around the following priorities:

- best practices
- fine-tuning for real-world performance
- readable implementation
- clean structure
- modular design
- safety in behavior
- security by design
- explicit authentication boundaries

## Product Principle

The visual is a governed context bridge, not a raw data transport mechanism.

- Power BI provides the effective report context.
- The custom visual translates that context into a compact prompt-ready summary.
- Databricks Genie answers using approved backend objects.
- The visual should not attempt to move unrestricted report datasets into the prompt.

## Engineering Principle

The deployed output is the `.pbiviz` package, but the source should stay modular so changes remain safe and maintainable.

- keep `src/visual.tsx` thin and Power BI-host focused
- keep React UI concerns separated from Power BI host concerns
- keep validation, request construction, and selection helpers in dedicated modules
- keep connection logic in hooks and UI sections in dedicated components
- prefer small, intention-revealing helpers over repeated inline object construction
- when reusing the package pattern elsewhere, assess the target system first and preserve stronger existing architecture instead of forcing unnecessary replacement

## Performance Principle

Client overhead should be as close to negligible as possible.

- avoid artificial delays in the UI path
- keep prompt context compact
- minimize re-renders and derived recomputation
- keep health checks lightweight and cached
- let Databricks and the proxy handle heavy processing

## Safety Principle

- every field sent to Genie should be intentional and explainable
- setup should fail safely when required configuration is missing
- the visual should guide report authors when bindings are incomplete or invalid
- outbound interaction should only use Power BI identities explicitly provided to the visual

## Security Principle

- do not assume Power BI RLS automatically propagates to Databricks
- prefer proxy or gateway patterns over browser-side secret handling
- keep prompt context bounded to approved business fields
- use governed Databricks metric views or views as the answering surface

## Authentication Principle

Preferred deployment order:

1. proxy or gateway with server-side authentication
2. controlled direct PAT usage only for restricted scenarios

The package should make authentication boundaries visible and predictable rather than hiding them.

## Documentation Principle

Any change to package behavior should keep these documents aligned:

- `README.md` — project root
- `docs/DEPLOYMENT_GUIDELINES.md`
- `docs/PROXY_GUIDE.md`
- `docs/AUTH_GUIDE.md`
- `docs/PACKAGE_PRINCIPLES.md`
- `docs/PERFORMANCE_AND_SECURITY_CHECKLIST.md`
- `docs/TECHNICAL_REFERENCE.md`
- `docs/TECHNICAL_UPDATE_FOR_AGENTS.md`
- `docs/HANDOVER.md`
- `docs/CHANGELOG.md`
