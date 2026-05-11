// playground/src/pulse/_adapter/ambient.d.ts
//
// Ambient module declarations for the optional lazy-loaded export
// dependencies Pulse uses. These were PBI-Desktop-blocked in Pulse
// (LazyLoadError path) but they're npm packages with real typings.
// In PulsePlay we're free to load them; for Cycle D's compile-only
// goal we declare them as untyped modules so tsc resolves the imports
// without us having to npm-install them.
//
// Cycle E or F will decide whether to actually install xlsx +
// html2canvas as deps when the export buttons get wired up.

declare module "sql-formatter" {
    export interface FormatOptionsWithLanguage {
        language?: string;
        tabWidth?: number;
        keywordCase?: "upper" | "lower" | "preserve";
        linesBetweenQueries?: number;
        params?: Record<string, string>;
    }
    export function format(sql: string, options?: FormatOptionsWithLanguage): string;
}

declare module "html2canvas" {
    const html2canvas: (
        element: HTMLElement,
        options?: Record<string, unknown>,
    ) => Promise<HTMLCanvasElement>;
    export default html2canvas;
}

declare module "xlsx" {
    export interface WorkSheet {
        [cell: string]: unknown;
        "!ref"?: string;
    }
    export interface WorkBook {
        Sheets: { [name: string]: WorkSheet };
        SheetNames: string[];
        Props?: Record<string, unknown>;
    }
    export namespace utils {
        function aoa_to_sheet(data: unknown[][]): WorkSheet;
        function book_new(): WorkBook;
        function book_append_sheet(workbook: WorkBook, sheet: WorkSheet, name?: string): void;
        function json_to_sheet(data: Record<string, unknown>[]): WorkSheet;
        function sheet_to_csv(sheet: WorkSheet): string;
    }
    export function write(workbook: WorkBook, opts: { bookType: string; type: string }): unknown;
    export function writeFile(workbook: WorkBook, filename: string, opts?: Record<string, unknown>): void;
}
