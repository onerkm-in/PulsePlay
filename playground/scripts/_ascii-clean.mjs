// playground/scripts/_ascii-clean.mjs
// One-shot: convert the briefing HTML files to clean ASCII punctuation.
// Tasteful, ordered replacements. FAIL-SAFE: if any non-ASCII char would
// remain after mapping, the file is NOT written and the offending chars are
// reported, so nothing slips through silently.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
    "../docs/briefing/PulsePlay-Deck.html",
    "../docs/briefing/PulsePlay-Flyer.html",
    "../docs/briefing/PulsePlay-Executive-Briefing.html",
];

function transform(text) {
    return text
        // Combined "left/right arrow keys" hint must come BEFORE single-arrow maps.
        .replace(/←\s*→/g, "Left/Right")
        .replace(/→\s*←/g, "Left/Right")
        // Arrows -> ASCII
        .replace(/→/g, "->")
        .replace(/←/g, "<-")
        // Em dash -> spaced hyphen (collapse surrounding whitespace)
        .replace(/\s*—\s*/g, " - ")
        // En dash -> hyphen
        .replace(/–/g, "-")
        // Middot separator -> spaced pipe (collapse surrounding whitespace)
        .replace(/\s*·\s*/g, " | ")
        // Multiplication sign -> x
        .replace(/×/g, "x")
        // Ellipsis -> three dots
        .replace(/…/g, "...")
        // Section sign -> "Section "
        .replace(/§\s*/g, "Section ")
        // Box-drawing divider chars (used only inside HTML comments) -> collapse
        .replace(/\s*░+\s*/g, " ")
        // Status emoji in comparison / maturity tables -> plain text
        .replace(/✅/g, "Yes")
        .replace(/❌/g, "No")
        .replace(/⚠️?/g, "Partial")
        // Not-equal (one occurrence: "Masking is not a security guarantee")
        .replace(/\s*≠\s*/g, " is not a ")
        // Math comparators / approx
        .replace(/≤/g, "<=")
        .replace(/≥/g, ">=")
        .replace(/≈/g, "~")
        // Curly quotes -> straight
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        // Non-breaking space -> regular space
        .replace(/ /g, " ");
}

function distinctNonAscii(text) {
    const seen = new Map();
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code > 127) seen.set(ch, (seen.get(ch) || 0) + 1);
    }
    return [...seen.entries()].map(([ch, n]) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")} x${n}`);
}

let anyFail = false;
for (const rel of FILES) {
    const abs = resolve(rel);
    const before = readFileSync(abs, "utf8");
    const after = transform(before);
    const remaining = distinctNonAscii(after);
    if (remaining.length > 0) {
        anyFail = true;
        console.log(`SKIP (would leave non-ASCII) ${rel}: ${remaining.join(", ")}`);
        continue;
    }
    writeFileSync(abs, after, "utf8");
    console.log(`OK ${rel}`);
}
process.exit(anyFail ? 1 : 0);
