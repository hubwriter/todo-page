import { diff3Merge } from 'node-diff3';

export function mergeMarkdown(base, current, other) {
  const blocks = diff3Merge(
    current.split('\n'),
    base.split('\n'),
    other.split('\n'),
    { excludeFalseConflicts: true }
  );
  const conflicts = [];
  const parts = blocks.map((block) => {
    if (block.ok) return { type: 'text', lines: block.ok };
    const conflict = block.conflict;
    const index = conflicts.length;
    conflicts.push({
      id: `markdown-${index}`,
      label: `Markdown lines near ${conflict.oIndex + 1}`,
      base: conflict.o.join('\n'),
      current: conflict.a.join('\n'),
      other: conflict.b.join('\n'),
      resolution: conflict.a.join('\n'),
      resolved: false
    });
    return { type: 'conflict', index };
  });

  const assemble = (resolutions = conflicts) => parts
    .flatMap((part) => {
      if (part.type === 'text') return part.lines;
      const resolution = String(resolutions[part.index]?.resolution ?? '');
      return resolution === '' ? [] : resolution.split('\n');
    })
    .join('\n');

  return {
    conflicts,
    content: conflicts.length ? null : assemble(),
    assemble
  };
}
