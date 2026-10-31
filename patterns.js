// Pattern mapping: LeetCode topic tags -> DSA pattern.
// LeetCode tags are topics, not patterns, so this layer is the product's brain.
// Rules are checked in order; first match wins. Tune freely.

const RULES = [
  { pattern: "Sliding Window", tags: ["Sliding Window"] },
  { pattern: "Two Pointers", tags: ["Two Pointers"] },
  { pattern: "Monotonic Stack", tags: ["Monotonic Stack"] },
  { pattern: "Trie", tags: ["Trie"] },
  { pattern: "Union Find", tags: ["Union Find"] },
  { pattern: "Topological Sort", tags: ["Topological Sort"] },
  { pattern: "Heap / Top K", tags: ["Heap (Priority Queue)"] },
  { pattern: "Prefix Sum", tags: ["Prefix Sum"] },
  { pattern: "Backtracking", tags: ["Backtracking"] },
  { pattern: "Binary Search", tags: ["Binary Search"] },
  { pattern: "Tree BFS", tags: ["Breadth-First Search", "Tree"] },
  { pattern: "Tree DFS", tags: ["Depth-First Search", "Tree"] },
  { pattern: "Graph BFS/DFS", tags: ["Depth-First Search", "Breadth-First Search", "Graph"] },
  { pattern: "Dynamic Programming", tags: ["Dynamic Programming"] },
  { pattern: "Greedy", tags: ["Greedy"] },
  { pattern: "Bit Manipulation", tags: ["Bit Manipulation"] },
  { pattern: "Hashing", tags: ["Hash Table"] },
  { pattern: "Stack", tags: ["Stack"] },
  { pattern: "Linked List", tags: ["Linked List"] },
];

function mapTagsToPattern(tagNames) {
  const set = new Set(tagNames);
  for (const rule of RULES) {
    if (rule.tags.every((t) => set.has(t))) return rule.pattern;
    // Single-tag rules match on any one tag
    if (rule.tags.length === 1 && set.has(rule.tags[0])) return rule.pattern;
  }
  return tagNames[0] || "Other";
}

module.exports = { mapTagsToPattern };
