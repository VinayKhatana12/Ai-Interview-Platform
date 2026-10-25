// DEVELOPMENT-ONLY question fixture.
//
// This module backs the interview engine while the LLM provider is not yet
// connected (next milestone swaps generateQuestions() in questionGenerator.js
// for a real provider call — the fixture, the interface and everything above
// it stay untouched). Questions are honest technical prompts per topic; there
// are deliberately NO model answers or scoring here — evaluation arrives with
// the real provider, and nothing in an active interview may expose answers.
const POOL = {
  JavaScript: [
    "Explain closures in JavaScript and give a practical example of using one.",
    "What is the difference between == and ===, and when would you use each?",
    "Describe the JavaScript event loop and how asynchronous callbacks get executed.",
  ],
  React: [
    "What problem does the virtual DOM solve, and how does reconciliation work?",
    "Why does React need keys on lists, and what goes wrong without them?",
    "Explain the rules of hooks and why they exist.",
  ],
  "Node.js": [
    "Describe the phases of the Node.js event loop.",
    "When would you use streams instead of reading a whole file into memory?",
    "How does the cluster module help a Node.js service scale?",
  ],
  TypeScript: [
    "When would you use an interface instead of a type alias?",
    "Explain generics with a practical example.",
    "What is the difference between any and unknown, and which should you prefer?",
  ],
  "Data Structures & Algorithms": [
    "Compare arrays and linked lists for insertion and lookup costs.",
    "Explain the average and worst-case complexity of hash map operations.",
    "When would you choose BFS over DFS for a graph problem?",
  ],
  DBMS: [
    "Explain normalization and why it matters in schema design.",
    "What does a database index cost you, and when should you avoid one?",
    "Explain the ACID properties of a transaction.",
  ],
  "System Design": [
    "Compare horizontal and vertical scaling, with one trade-off of each.",
    "Where would you introduce caching in a web service, and what could go stale?",
    "What makes an API idempotent, and why does it matter for retries?",
  ],
  "Operating Systems": [
    "What is the difference between a process and a thread?",
    "Explain deadlock and one strategy to prevent it.",
    "What does virtual memory give an operating system?",
  ],
  Networks: [
    "Compare TCP and UDP, and name one use case for each.",
    "Walk through what happens in a TLS handshake.",
    "What happens between typing a URL and seeing the page?",
  ],
  OOP: [
    "Explain encapsulation and why it matters.",
    "Explain polymorphism with a concrete example.",
    "What does the Single Responsibility Principle mean in practice?",
  ],
};

// Behavioral prompts for BEHAVIORAL/MIXED interviews (development fixture).
const BEHAVIORAL_POOL = [
  "Tell me about a time you disagreed with a teammate. How did you handle it, and what happened?",
  "Describe a project that slipped its deadline. What did you change afterwards?",
  "Walk me through a piece of feedback that was hard to hear. What did you do with it?",
];

export function fixtureQuestions(config) {
  const questions = [];
  let topicIndex = 0;
  let poolOffset = 0;
  const typeOf = (i) =>
    config.interviewType === "BEHAVIORAL"
      ? "behavioral"
      : config.interviewType === "MIXED"
        ? i % 2 === 0
          ? "technical"
          : "behavioral"
        : "technical";
  for (let i = 0; i < config.questionCount; i++) {
    const questionType = typeOf(i);
    const topic = config.topics[topicIndex % config.topics.length];
    const pool = questionType === "behavioral" ? BEHAVIORAL_POOL : POOL[topic] ?? POOL.JavaScript;
    questions.push({
      text: pool[(poolOffset + i) % pool.length],
      topic,
      difficulty: config.difficulty,
      questionType,
    });
    // Rotate topics; offset drifts so longer sets don't repeat the same picks.
    topicIndex++;
    if (topicIndex % config.topics.length === 0) poolOffset++;
  }
  return questions;
}
