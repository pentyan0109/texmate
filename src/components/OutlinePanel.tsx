"use client";

interface OutlineItem {
  level: number; // 0=chapter,1=section,2=subsection,3=subsubsection
  title: string;
  line: number;
}

interface Props {
  code: string;
  onJump: (line: number) => void;
}

const PATTERNS: { level: number; re: RegExp }[] = [
  { level: 0, re: /^\\chapter\*?\{([^}]*)\}/  },
  { level: 1, re: /^\\section\*?\{([^}]*)\}/  },
  { level: 2, re: /^\\subsection\*?\{([^}]*)\}/  },
  { level: 3, re: /^\\subsubsection\*?\{([^}]*)\}/  },
  { level: 1, re: /^\\begin\{abstract\}/       },
  { level: 1, re: /^\\bibliography\{/          },
  { level: 1, re: /^\\printbibliography/       },
];

export function parseOutline(code: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = code.split("\n");
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    for (const { level, re } of PATTERNS) {
      const m = line.match(re);
      if (m) {
        items.push({
          level,
          title: m[1] ?? line.replace(/\\begin\{abstract\}/, "Abstract").replace(/\\(bibliography|printbibliography)\{?.*/, "References"),
          line: i + 1,
        });
        break;
      }
    }
  });
  return items;
}

const LEVEL_INDENT = ["", "pl-0", "pl-3", "pl-6", "pl-9"];
const LEVEL_STYLE = [
  "text-blue-300 font-bold",
  "text-gray-200 font-semibold",
  "text-gray-400",
  "text-gray-500 text-xs",
  "text-gray-600 text-xs",
];
const LEVEL_ICON = ["📖", "§", "  §§", "   §§§", "    §§§§"];

export default function OutlinePanel({ code, onJump }: Props) {
  const outline = parseOutline(code);

  if (outline.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-gray-600 text-center">
        アウトラインなし<br />
        <span className="text-gray-700">\section などを追加すると表示されます</span>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1">
      {outline.map((item, i) => (
        <button
          key={i}
          onClick={() => onJump(item.line)}
          className={`w-full text-left px-2 py-1 hover:bg-gray-700 text-xs flex items-baseline gap-1 ${LEVEL_INDENT[item.level] ?? ""}`}
          title={`行 ${item.line}`}
        >
          <span className="shrink-0 text-gray-600 font-mono">{LEVEL_ICON[item.level]}</span>
          <span className={LEVEL_STYLE[item.level] ?? "text-gray-400"}>{item.title || "(untitled)"}</span>
          <span className="ml-auto text-gray-700 shrink-0">{item.line}</span>
        </button>
      ))}
    </div>
  );
}
