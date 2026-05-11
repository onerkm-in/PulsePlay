// playground/src/pulse/_adapter/powerbi-visuals-utils-formattingmodel.ts
//
// Minimal stub of `powerbi-visuals-utils-formattingmodel`. Pulse uses it
// to declare format-pane fields and to populate a settings model from a
// DataView (which is how the PBI format pane reads/writes settings).
//
// PulsePlay has no format pane — the Setup UI carries its own React
// state. Cycle E will replace the FormattingSettingsService call with a
// React-state-backed adapter; for Cycle D we just need this stub so
// `tsc --noEmit` is happy and the ported settings.ts compiles unchanged.
//
// Field surface covered (everything `playground/src/pulse/settings.ts`
// imports):
//   formattingSettings.Model            (base class)
//   formattingSettings.CompositeCard
//   formattingSettings.Group
//   formattingSettings.ItemDropdown
//   formattingSettings.TextInput
//   formattingSettings.ToggleSwitch
//   formattingSettings.TextArea
//   FormattingSettingsService           (class with one used method)
//
// Each settings-control class accepts an options bag and exposes the
// `value` property the Pulse code reads/writes. Other PBI metadata
// (displayName, items, placeholder) is preserved on the instance so
// Pulse code that introspects it doesn't crash, but PulsePlay's UI
// uses different rendering.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Shared base for every formattingSettings control class. Holds the
 *  options bag and the editable `value`. */
class FormattingControlBase<TOptions extends { value?: unknown }, TValue> {
    public name: string;
    public displayName?: string;
    public description?: string;
    public placeholder?: string;
    public value: TValue;
    public items?: unknown[];
    public visible?: boolean;
    public readonly options: TOptions;

    constructor(options: TOptions) {
        const o = options as any;
        this.name = o?.name ?? "";
        this.displayName = o?.displayName;
        this.description = o?.description;
        this.placeholder = o?.placeholder;
        this.items = o?.items;
        this.visible = o?.visible;
        this.value = (o?.value ?? null) as TValue;
        this.options = options;
    }
}

// Suppress the unused-import lint warning in environments where the
// stub's local-only state isn't read elsewhere.
void FormattingControlBase;

class StubModel {
    public name: string;
    public displayName?: string;
    public cards: unknown[] = [];

    constructor(args: { name?: string; displayName?: string; cards?: unknown[] } = {}) {
        this.name = args.name ?? "";
        this.displayName = args.displayName;
        if (Array.isArray(args.cards)) this.cards = args.cards;
    }
}

class StubCompositeCard {
    public name: string;
    public displayName?: string;
    public groups: unknown[] = [];
    public visible?: boolean;

    constructor(args: { name?: string; displayName?: string; groups?: unknown[]; visible?: boolean } = {}) {
        this.name = args.name ?? "";
        this.displayName = args.displayName;
        if (Array.isArray(args.groups)) this.groups = args.groups;
        this.visible = args.visible;
    }
}

class StubGroup {
    public name: string;
    public displayName?: string;
    public slices: unknown[] = [];
    public visible?: boolean;

    constructor(args: { name?: string; displayName?: string; slices?: unknown[]; visible?: boolean } = {}) {
        this.name = args.name ?? "";
        this.displayName = args.displayName;
        if (Array.isArray(args.slices)) this.slices = args.slices;
        this.visible = args.visible;
    }
}

/** Shared option-bag fields every formattingSettings control accepts. */
interface BaseControlOptions {
    name?: string;
    displayName?: string;
    description?: string;
    visible?: boolean;
}

/** Public namespace mirror of `formattingSettings` from the PBI utils package. */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace formattingSettings {
    export class Model extends StubModel {}
    export class CompositeCard extends StubCompositeCard {}
    export class Group extends StubGroup {}

    /** Dropdown item type used by ItemDropdown.items. */
    export interface IItemDropdownItem {
        value: string;
        displayName?: string;
    }

    export class ItemDropdown extends FormattingControlBase<
        BaseControlOptions & {
            items?: IItemDropdownItem[];
            value?: IItemDropdownItem;
        },
        // Pulse code reads `.value.value` on a dropdown — the inner
        // IItemDropdownItem is the canonical PBI shape. Type as the
        // item so accessors compile; runtime preserves whatever was set.
        IItemDropdownItem
    > {}

    export class TextInput extends FormattingControlBase<
        BaseControlOptions & { placeholder?: string; value?: string },
        string
    > {}

    export class ToggleSwitch extends FormattingControlBase<
        BaseControlOptions & { value?: boolean },
        boolean
    > {}

    export class TextArea extends FormattingControlBase<
        BaseControlOptions & { placeholder?: string; value?: string },
        string
    > {}

    export class NumUpDown extends FormattingControlBase<
        BaseControlOptions & {
            value?: number;
            options?: { minValue?: { value: number }; maxValue?: { value: number } };
        },
        number
    > {}

    /** PBI FontControl bundles four sub-pickers each with their own .value.
     *  Pulse reads `fontControl.fontFamily.value` etc.; expose them as
     *  public fields on the instance. */
    export class FontControl extends FormattingControlBase<
        BaseControlOptions & {
            fontFamily?: FontPicker | { value?: string };
            fontSize?: NumUpDown | { value?: number };
            bold?: ToggleSwitch | { value?: boolean };
            italic?: ToggleSwitch | { value?: boolean };
            underline?: ToggleSwitch | { value?: boolean };
            value?: unknown;
        },
        unknown
    > {
        public fontFamily: { value: string };
        public fontSize: { value: number };
        public bold: { value: boolean };
        public italic: { value: boolean };
        public underline: { value: boolean };

        constructor(opts: BaseControlOptions & {
            fontFamily?: FontPicker | { value?: string };
            fontSize?: NumUpDown | { value?: number };
            bold?: ToggleSwitch | { value?: boolean };
            italic?: ToggleSwitch | { value?: boolean };
            underline?: ToggleSwitch | { value?: boolean };
            value?: unknown;
        }) {
            super(opts);
            const ff = (opts as any)?.fontFamily;
            const fs = (opts as any)?.fontSize;
            const b = (opts as any)?.bold;
            const i = (opts as any)?.italic;
            const u = (opts as any)?.underline;
            this.fontFamily = { value: (ff && typeof ff === "object" && "value" in ff && typeof ff.value === "string") ? ff.value : "" };
            this.fontSize = { value: (fs && typeof fs === "object" && "value" in fs && typeof fs.value === "number") ? fs.value : 12 };
            this.bold = { value: !!(b && typeof b === "object" && "value" in b && b.value) };
            this.italic = { value: !!(i && typeof i === "object" && "value" in i && i.value) };
            this.underline = { value: !!(u && typeof u === "object" && "value" in u && u.value) };
        }
    }

    export class FontPicker extends FormattingControlBase<
        BaseControlOptions & { value?: string },
        string
    > {}
}

/** Stub of the PBI FormattingSettingsService class. Pulse calls
 *  `new FormattingSettingsService(localizationManager)` then
 *  `populateFormattingSettingsModel(ModelClass, dataView)` — the latter
 *  in PBI would walk the dataView's `objects` and copy field values
 *  into the constructed model. In PulsePlay we just return a fresh
 *  model instance; Cycle E wires real React-state-backed persistence. */
export class FormattingSettingsService {
    constructor(_localizationManager?: unknown) {
        // localization manager unused in the stub — kept on the
        // signature so Pulse's `new FormattingSettingsService(this.host
        // .createLocalizationManager())` compiles unchanged.
    }

    /** Construct a model instance and hydrate from the supplied
     *  dataView's `metadata.objects` bag. PulsePlay's PulseShell passes
     *  a synthetic dataView whose objects come from localStorage, so
     *  this is how persisted settings load back across reloads.
     *
     *  Walk pattern matches PBI's: for each card (top-level cards
     *  array), match by `card.name` against `objects[name]`, then walk
     *  the card's groups[*].slices[*] and direct slices, setting
     *  `slice.value` for each matching propertyName. */
    populateFormattingSettingsModel<T>(
        ModelCtor: new () => T,
        dataView?: unknown,
    ): T {
        const model = new ModelCtor();
        const objects = readObjectsBag(dataView);
        if (objects) {
            applyObjectsToModel(model, objects);
        }
        return model;
    }

    buildFormattingModel(_model: unknown): unknown {
        // PBI uses this to serialise the model back into the format pane.
        // PulsePlay has no format pane — return an empty object so any
        // caller that ignores the result doesn't trip.
        return { cards: [] };
    }
}

// ── Hydration helpers (cycle E.4) ────────────────────────────────────────

/** Pull metadata.objects out of a PBI-shaped dataView, defensively. */
function readObjectsBag(dataView: unknown): Record<string, Record<string, unknown>> | null {
    if (!dataView || typeof dataView !== "object") return null;
    const meta = (dataView as { metadata?: { objects?: unknown } }).metadata;
    if (!meta || typeof meta !== "object") return null;
    const objects = (meta as { objects?: unknown }).objects;
    if (!objects || typeof objects !== "object") return null;
    return objects as Record<string, Record<string, unknown>>;
}

/** Apply a PBI-shaped `objects` bag onto a freshly-constructed
 *  formattingSettings.Model. Walks model.cards -> (groups -> slices |
 *  slices) and copies `value` for every matching name pair. */
function applyObjectsToModel(
    model: unknown,
    objects: Record<string, Record<string, unknown>>,
): void {
    const cards = (model as { cards?: unknown[] }).cards;
    if (!Array.isArray(cards)) return;
    for (const card of cards) {
        const cardName = (card as { name?: string }).name;
        if (!cardName) continue;
        const cardObjects = objects[cardName];
        if (!cardObjects || typeof cardObjects !== "object") continue;
        // CompositeCard: card.groups[*].slices[*]
        const groups = (card as { groups?: unknown[] }).groups;
        if (Array.isArray(groups)) {
            for (const group of groups) {
                const slices = (group as { slices?: unknown[] }).slices;
                if (Array.isArray(slices)) applySlicesFromObjects(slices, cardObjects);
            }
        }
        // SimpleCard: card.slices[*]
        const directSlices = (card as { slices?: unknown[] }).slices;
        if (Array.isArray(directSlices)) applySlicesFromObjects(directSlices, cardObjects);
    }
}

function applySlicesFromObjects(
    slices: unknown[],
    cardObjects: Record<string, unknown>,
): void {
    for (const slice of slices) {
        const sliceName = (slice as { name?: string }).name;
        if (!sliceName) continue;
        if (sliceName in cardObjects) {
            (slice as { value: unknown }).value = cardObjects[sliceName];
        }
    }
}
