export type KeyboardKeySpec = {
  id: string;
  code?: string;
  label: string;
  shiftedLabel?: string;
  kind?: "letter" | "special" | "space" | "enter" | "backspace" | "shift" | "layer";
  wide?: "shift" | "backspace" | "space" | "enter" | "utility";
  popup?: boolean;
  text?: string;
  nextLayer?: KeyboardLayoutName;
};

export type KeyboardLayoutName = "alpha" | "numbers" | "symbols";

function textKey(label: string): KeyboardKeySpec {
  return {
    id: `text-${label}`,
    label,
    kind: "special",
    popup: true,
    text: label,
  };
}

export const alphaRows: KeyboardKeySpec[][] = [
  "qwertyuiop".split("").map((letter) => ({
    id: letter,
    code: `Key${letter.toUpperCase()}`,
    label: letter,
    shiftedLabel: letter.toUpperCase(),
    kind: "letter",
    popup: true,
  })),
  "asdfghjkl".split("").map((letter) => ({
    id: letter,
    code: `Key${letter.toUpperCase()}`,
    label: letter,
    shiftedLabel: letter.toUpperCase(),
    kind: "letter",
    popup: true,
  })),
  [
    { id: "shift", code: "ShiftLeft", label: "shift", kind: "shift", wide: "shift" },
    ..."zxcvbnm".split("").map((letter) => ({
      id: letter,
      code: `Key${letter.toUpperCase()}`,
      label: letter,
      shiftedLabel: letter.toUpperCase(),
      kind: "letter" as const,
      popup: true,
    })),
    { id: "backspace", code: "Backspace", label: "⌫", kind: "backspace", wide: "backspace" },
  ],
  [
    { id: "numbers", label: "123", kind: "layer", wide: "utility", nextLayer: "numbers" },
    { id: "voice-space", code: "Space", label: "space", kind: "space", wide: "space" },
    { id: "enter", code: "Enter", label: "return", kind: "enter", wide: "enter" },
  ],
];

export const numberRows: KeyboardKeySpec[][] = [
  "1234567890".split("").map((digit) => textKey(digit)),
  [
    textKey("-"),
    textKey("/"),
    textKey(":"),
    textKey(";"),
    textKey("("),
    textKey(")"),
    textKey("$"),
    textKey("&"),
    textKey("@"),
    textKey("\""),
  ],
  [
    { id: "symbols", label: "#+=", kind: "layer", wide: "utility", nextLayer: "symbols" },
    textKey("."),
    textKey(","),
    textKey("?"),
    textKey("!"),
    textKey("'"),
    { id: "backspace", code: "Backspace", label: "⌫", kind: "backspace", wide: "backspace" },
  ],
  [
    { id: "alpha", label: "ABC", kind: "layer", wide: "utility", nextLayer: "alpha" },
    { id: "voice-space", code: "Space", label: "space", kind: "space", wide: "space" },
    { id: "enter", code: "Enter", label: "return", kind: "enter", wide: "enter" },
  ],
];

export const symbolRows: KeyboardKeySpec[][] = [
  ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="].map((label) => textKey(label)),
  [
    textKey("_"),
    textKey("\\"),
    textKey("|"),
    textKey("~"),
    textKey("<"),
    textKey(">"),
    textKey("€"),
    textKey("£"),
    textKey("¥"),
    textKey("•"),
  ],
  [
    { id: "numbers", label: "123", kind: "layer", wide: "utility", nextLayer: "numbers" },
    textKey("."),
    textKey(","),
    textKey("?"),
    textKey("!"),
    textKey("'"),
    { id: "backspace", code: "Backspace", label: "⌫", kind: "backspace", wide: "backspace" },
  ],
  [
    { id: "alpha", label: "ABC", kind: "layer", wide: "utility", nextLayer: "alpha" },
    { id: "voice-space", code: "Space", label: "space", kind: "space", wide: "space" },
    { id: "enter", code: "Enter", label: "return", kind: "enter", wide: "enter" },
  ],
];
