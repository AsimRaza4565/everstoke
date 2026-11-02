// #42: stat extraction from narration sentences — pure + unit-tested.
// Extracted verbatim from longvideo/storyboard.mjs with the ONE-LINE FIX:
// `num *= mult` was computed but never applied, so digit+magnitude sentences
// ("37 billion dollars") rendered as "$37" — wrong big-number beats, wrong
// panel rows, and the num >= 20 gate silently dropped "12 billion".

const WORD_NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };

export function extractNumber(sentence) {
  // "$37 billion", "1.5 billion", "60 percent", "2005", "$4.99", "12,402"
  // digits + comma groups + optional decimal — a trailing sentence period must
  // NOT be swallowed (it broke the 4-digit year guard: "2005." length 5)
  const m = sentence.match(/(\$?\d[\d,]*(?:\.\d+)?)\s*(billion|million|trillion|%|percent)?/i);
  if (m) {
    let raw = m[1].replace(/,/g, "");
    const word = (m[2] || "").toLowerCase();
    let num = parseFloat(raw.replace(/^\$/, ""));
    if (Number.isFinite(num)) {
      let mult = 1, suffix = word.startsWith("billion") ? "B" : word.startsWith("million") ? "M" : word.startsWith("trillion") ? "T" : word.startsWith("percent") || word === "%" ? "%" : "";
      if (suffix === "B") mult = 1e9; else if (suffix === "M") mult = 1e6; else if (suffix === "T") mult = 1e12;
      const isMoney = raw.startsWith("$") || suffix === "B" || suffix === "M" || suffix === "T";
      if (suffix === "%" || word === "percent") return { big: `${num}%`, num, sentence };
      if (raw.length === 4 && num >= 1500 && num <= 2100 && !isMoney) return { big: `${num}`, num, sentence };
      num *= mult; // #42 THE FIX — the magnitude was computed and dropped
      const display = isMoney
        ? `$${num >= 1e12 ? (num / 1e12).toFixed(num % 1e12 ? 1 : 0) + "T" : num >= 1e9 ? (num / 1e9).toFixed(num % 1e9 ? 1 : 0) + "B" : num >= 1e6 ? (num / 1e6).toFixed(0) + "M" : num.toLocaleString()}`
        : `${num.toLocaleString()}${suffix ? " " + suffix : ""}`.trim() === `${num.toLocaleString()}` ? num.toLocaleString() : `${num.toLocaleString()}${suffix ? " " + suffix : ""}`;
      if (num < 5 && !isMoney && !suffix) return null; // tiny counts aren't stats
      return { big: display, num, sentence };
    }
  }
  // spelled-out: "two billion dollars", "sixty percent", "one hundred fifty billion"
  const w = sentence.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(hundred\s+)?(thousand\s+)?(billion|million|trillion|percent)\b/i);
  if (w) {
    let num = WORD_NUMS[w[1].toLowerCase()];
    if (w[2]) num *= 100;           // "hundred"
    if (w[3]) num *= 1000;          // "thousand"
    const unit = w[4].toLowerCase();
    if (unit === "percent") return { big: `${num}%`, num, sentence };
    const sym = unit === "billion" ? "B" : unit === "million" ? "M" : unit === "trillion" ? "T" : "K";
    const isMoney = /\$|dollar/i.test(sentence);
    return { big: isMoney ? `$${num}${sym}` : `${num}${sym}`, num, sentence };
  }
  return null;
}
