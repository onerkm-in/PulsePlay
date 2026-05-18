# Unified Ask Pulse Workbench

**Goal**: Build one Unified Ask Pulse Workbench, orchestrating 3 modes inside the same chat screen:
1. Native Embed
2. PulsePlay Verified
3. Hybrid

**Accuracy**: No ungrounded artifacts (No chart/table/number without SQL/citation). Status tags: Verified, Grounded draft, Suggestion, Blocked.

**Sequence**:
- [ ] 1. Add UnifiedAssistantSurface architecture and connector capability model.
- [x] 2. Move Genie iframe from i-adapters or elsewhere into assistant connector mode as 
ativeChatEmbed.
- [x] 3. Create artifact card shell with Answer | Chart | Table | SQL | Evidence | Reasoning.
- [x] 4. Add verified artifact model and validation gates.
- [x] 5. Add ECharts renderer + chart registry.
- [x] 6. Refactor current Pulse chat assets out of huge isual.tsx.
- [x] 7. Apply the cleaner workbench theme.
