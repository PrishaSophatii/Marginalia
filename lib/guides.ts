// Long-form guides. They give search engines (and AdSense reviewers) real content to index,
// and each one ends by pointing readers to the reader itself.
export type Section = { h?: string; p?: string[]; list?: string[] };
export type Guide = { slug: string; title: string; description: string; date: string; body: Section[] };

export const GUIDES: Guide[] = [
  {
    slug: "how-to-read-a-research-paper",
    title: "How to read a research paper (without reading it three times)",
    description: "A practical three-pass method for reading academic papers, with what to look for in each section and how to get unstuck on dense passages.",
    date: "2026-10-20",
    body: [
      { p: [
        "Most people read a paper the way they read a novel: first word to last, hoping it makes sense by the end. Papers aren't written to be read that way. They're reference documents with a predictable shape, and once you use that shape you can understand a paper in less time and remember more of it.",
      ] },
      { h: "Pass one: the five-minute skim", p: [
        "Read the title, the abstract, the introduction's last paragraph, every section heading, the figures with their captions, and the conclusion. Skip everything else.",
        "At the end of this pass you should be able to say, in one sentence, what problem the paper tackles and what it claims. If you can't, the paper is either outside your current background or poorly written. Both are useful to know before you invest an hour.",
      ] },
      { h: "Pass two: the argument", p: [
        "Now read the body, but skip proofs, derivations and implementation details. Your goal is the chain of reasoning: what the authors assume, what they did, and why the results support the claim.",
        "Mark anything you don't understand rather than stopping on it. A highlight with a question is cheaper than a stalled reading session.",
      ], list: [
        "In the method, ask: what is the input, what is the output, and what is new compared to prior work?",
        "In the results, look at the baselines. A big improvement over a weak baseline means less than a small one over a strong baseline.",
        "In the figures, read the axes before the curves. Many misreadings come from log scales and truncated axes.",
      ] },
      { h: "Pass three: the details that matter to you", p: [
        "Go back to the passages you marked. This is where an AI tutor earns its place. Select the sentence, ask what it means, and ask for a concrete example. A good explanation of a dense line usually starts with a small worked case, then states the general rule.",
        "Only read the proofs and appendices if you need to reproduce, extend or critique the work.",
      ] },
      { h: "Keep what you learned", p: [
        "Write a three-line summary when you finish: the problem, the key idea, and one limitation. Keep your highlighted questions and their answers next to the text so the next time you open the paper you start from understanding, not from scratch.",
        "Marginalia was built around exactly this workflow: highlight, ask, and keep the answer in the margin.",
      ] },
    ],
  },
  {
    slug: "understand-equations-in-papers",
    title: "How to understand the equations in a paper",
    description: "A step-by-step way to decode mathematical notation in research papers, from naming every symbol to testing the formula with small numbers.",
    date: "2026-10-18",
    body: [
      { p: ["Equations stop more readers than any other part of a paper. The good news is that most equations in applied papers are built from a small set of familiar pieces, and you can take them apart with the same few steps every time."] },
      { h: "1. Name every symbol", p: ["Write down what each letter stands for, its type (a number, a vector, a matrix, a function) and its shape. Authors usually define symbols once, often a page earlier, so search backwards for the first time each symbol appears."] },
      { h: "2. Read it out loud in words", p: ["Turn the equation into a sentence. \"The loss is the average, over all examples, of the squared difference between the prediction and the label.\" If you can't make the sentence, find the piece that blocks you and ask about that piece alone."] },
      { h: "3. Plug in tiny numbers", p: ["Pick two or three data points and small values and compute the result by hand. This is the fastest way to learn what a formula actually does, and it often reveals why the authors wrote it that way."] },
      { h: "4. Ask what happens at the extremes", list: [
        "What if a parameter is zero, or very large?",
        "What if two inputs are identical?",
        "Which term dominates when the dataset grows?",
      ] },
      { h: "5. Connect it back to the claim", p: ["Every equation in a paper exists to support an argument. Once you understand it, ask which result depends on it. In Marginalia you can select the equation and ask exactly that, and the explanation stays attached to the formula for next time."] },
    ],
  },
  {
    slug: "study-a-textbook-pdf-with-ai",
    title: "How to study a textbook PDF with AI, and actually remember it",
    description: "Use an AI tutor to study textbook chapters actively: preview, question, explain back, and review, without letting the AI do the thinking for you.",
    date: "2026-10-15",
    body: [
      { p: ["An AI that can explain any paragraph is a powerful study tool, and an easy way to fool yourself into thinking you've learned something. The trick is to use it to answer your own questions, not to replace them."] },
      { h: "Preview the chapter", p: ["Skim the headings, the summary and the exercises at the end first. The exercises tell you what the author thinks matters."] },
      { h: "Write your question before you ask", p: ["When something doesn't make sense, highlight it and phrase a specific question: \"Why does the loop stop at n minus one?\" works far better than \"explain this\". Specific questions get specific, memorable answers."] },
      { h: "Ask for an example first", p: ["Abstract definitions stick once you've seen them work on a concrete case. Ask for a small example, then for the general rule."] },
      { h: "Explain it back", p: ["After reading the answer, write one sentence in your own words as a note beside the passage. If you can't, ask a follow-up. This is the step that turns reading into learning."] },
      { h: "Review your margin", p: ["Before the next study session, reread only your highlights and notes. Ten minutes of reviewing your own questions beats an hour of rereading."] },
    ],
  },
  {
    slug: "anthropic-api-key-for-reading",
    title: "How to get an Anthropic API key, and what reading with it costs",
    description: "Create an Anthropic API key in a few minutes, add it to Marginalia, and estimate what asking Claude about your papers will cost.",
    date: "2026-10-12",
    body: [
      { p: ["Marginalia doesn't charge a subscription. Instead, questions you ask Claude are sent from your browser straight to Anthropic with your own API key, and Anthropic bills you for what you use."] },
      { h: "Create a key", list: [
        "Go to console.anthropic.com and sign up or log in.",
        "Add a small amount of credit under Billing. Five dollars goes a long way for reading.",
        "Open API Keys, create a key, and copy it. It starts with sk-ant-.",
        "In Marginalia, open Settings, paste the key and press Save. Use Test key to check it works.",
      ] },
      { h: "What it costs", p: [
        "Each question sends the passage you highlighted, some surrounding context and your earlier questions on that passage. Depending on the model and the length of the passage, a question and answer typically costs somewhere between a fraction of a cent and a few cents. Haiku is the cheapest, Opus the most capable; see anthropic.com/pricing for current rates. You can switch models in Settings at any time.",
        "You can set a monthly spending limit in the Anthropic console so there are never surprises.",
      ] },
      { h: "Is my key safe?", p: [
        "Your key is stored only in your browser's local storage and is sent only to api.anthropic.com. It never passes through Marginalia's servers. Don't use Marginalia on a shared computer without removing the key afterwards, and you can revoke a key in the Anthropic console at any time.",
      ] },
    ],
  },
  {
    slug: "annotate-pdfs-highlights-and-notes",
    title: "A simple system for highlighting and annotating PDFs",
    description: "Use colours with a purpose, write notes that you will reread, and keep annotations useful months later.",
    date: "2026-10-08",
    body: [
      { p: ["Highlighting feels productive, but a page covered in yellow tells you nothing a month later. A small system makes annotations something you can actually use."] },
      { h: "Give each colour one job", list: [
        "Yellow: the main claim or definition.",
        "Green: evidence or a result worth citing.",
        "Blue: methods or details you may need to reproduce.",
        "Pink: something you disagree with or don't understand yet.",
      ] },
      { h: "Highlight less, note more", p: ["If you highlight a whole paragraph, add a one-line note saying why. The note is what you'll reread; the highlight only tells you where to look."] },
      { h: "Turn confusion into questions", p: ["Pink highlights are the most valuable. Come back to them, ask your question, and keep the answer beside the passage. In Marginalia, an answer from Claude is saved as part of the highlight."] },
      { h: "Make mistakes cheap", p: ["Good annotation tools let you undo a highlight or erase part of one. If removing a mark is easy, you'll mark more honestly and tidy up later."] },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
