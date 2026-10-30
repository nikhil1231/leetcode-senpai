---
id: rag
category: retrieval
skill: retrieval
title: Retrieval-augmented generation
minutes: 16
summary: RAG answers questions from your documents by retrieving relevant passages and putting them in the prompt. Quality depends far more on retrieval (ingestion, chunking, hybrid search, re-ranking, permissions) than on the generation prompt. Evaluate retrieval and generation separately. Know when RAG is the wrong tool compared with fine-tuning, long context, or a plain database query.
objectives:
  - Design the ingestion pipeline, including parsing, chunking, metadata and freshness
  - Design query-time retrieval with rewriting, hybrid search, re-ranking and access control
  - Write a grounded generation prompt with citations and an "I don't know" path
  - Diagnose a bad RAG answer to the stage that caused it, and choose RAG vs fine-tuning vs long context
sources:
  - ['Lewis et al.: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', 'https://arxiv.org/abs/2005.11401']
  - ['Anthropic: Contextual retrieval', 'https://www.anthropic.com/news/contextual-retrieval']
  - ['Ragas docs: Metrics', 'https://docs.ragas.io/en/stable/concepts/metrics/']
---

## The pipeline

```arch
title: A RAG system
nodes:
  - {id: src, label: 'Sources (docs, tickets, wiki)', kind: storage, x: 0, y: 0}
  - {id: ingest, label: 'Ingest: parse, chunk, embed', kind: worker, x: 1, y: 0}
  - {id: index, label: 'Hybrid index (BM25 + vectors + ACL)', kind: db, x: 2, y: 0}
  - {id: user, label: User, kind: client, x: 0, y: 1}
  - {id: api, label: 'RAG service', kind: service, x: 1, y: 1}
  - {id: rerank, label: Re-ranker, kind: service, x: 2, y: 1}
  - {id: llm, label: LLM, kind: external, x: 3, y: 1}
edges:
  - [src, ingest, 'changes']
  - [ingest, index, 'chunks + metadata']
  - [user, api, 'question']
  - [api, index, 'rewritten query + filters']
  - [api, rerank, 'top 50']
  - [api, llm, 'top 5 + instructions']
caption: Ingestion runs offline and incrementally. Query time is retrieve, re-rank, generate with citations, and every stage is measured separately.
```

## Ingestion

- **Parsing** is where quality is quietly lost. PDFs with tables, multi-column layouts, headers and footers, and scanned images need real parsing (layout-aware tools, OCR). Garbage in, confident garbage out.
- **Chunking**: split into passages of roughly 200 to 800 tokens, at natural boundaries (headings, paragraphs), with a little overlap. Chunks that are too small lose context ("it" with no referent). Chunks that are too large dilute relevance and waste the context window. Prepend context to each chunk (document title, section path, or a generated one-line summary) so that a chunk makes sense on its own. This is known as *contextual retrieval*.
- **Metadata**: source, URL, date, product, version, and **access control lists**. You need these for filtering, freshness and citations.
- **Freshness**: re-ingest on change (webhooks, change data capture), not by nightly full rebuilds. Delete chunks from removed documents, because stale chunks produce confidently outdated answers.

## Query time

1. **Understand the query**: rewrite conversational follow-ups into standalone queries ("what about for Pro?" becomes "refund policy for Pro plan"), and optionally split multi-part questions.
2. **Retrieve**: hybrid BM25 plus vector search, **filtered by the user's permissions** inside the search.
3. **Re-rank** the top 50 to 100 with a cross-encoder and keep the top 3 to 8.
4. **Generate**: instruct the model to answer **only** from the provided passages, cite them (`[2]`), and say when the passages don't contain the answer.
5. **Post-check** (optional): verify that the citations exist and support the claims, and refuse answers with no citations.

```incident
title: The confidently wrong answer
start: s0
nodes:
  s0:
    text: 'A user asks "Can I get a refund after 30 days?" The bot says yes, citing passage [2]. The current policy says 14 days. Where do you look first?'
    options:
      - {label: 'Look at the retrieved passages for this query: what did the model actually see?', next: s1, quality: good, note: 'Separate retrieval failures from generation failures before changing anything.'}
      - {label: 'Rewrite the system prompt to be stricter', next: bad1, quality: bad, note: 'You do not know yet whether the prompt is the problem.'}
  bad1:
    text: 'The stricter prompt changes nothing. The model faithfully quoted the passage it was given.'
    verdict: bad
  s1:
    text: 'Passage [2] is from the 2023 policy page, which was replaced last year. It still sits in the index alongside the current page.'
    options:
      - {label: 'Fix ingestion so that removed or superseded documents are deleted, and add a recency signal', next: good, quality: good, note: 'A retrieval and freshness bug: fix it at the source.'}
      - {label: 'Add "always prefer recent documents" to the prompt', next: okay, quality: ok, note: 'Helps a little, but the stale chunk is still retrievable and may be the only one returned.'}
  okay:
    text: 'Some answers improve. Next month, another removed page causes the same bug.'
    verdict: ok
  good:
    text: 'Stale chunks are gone. You add this question to the eval set, with the expected answer and source.'
    verdict: good
debrief: Most RAG failures are retrieval failures. Inspect what was retrieved before tuning the prompt, and turn every incident into an eval case.
```

## Evaluating RAG

Measure the two halves separately:

- **Retrieval**: for questions with known relevant passages, measure **recall@k** (did the right passage appear in the top k?) and **MRR** (how high?).
- **Generation**: **faithfulness or groundedness** (is every claim supported by the retrieved passages?), **answer relevance**, and correct refusals when the answer isn't present.

Build a labelled set of 50 to 200 real questions, with expected answers and source passages, before tuning chunk sizes or prompts.

## When not to use RAG

- **Fine-tuning** teaches format, style, tone and narrow skills. It's poor at adding facts that change, and it can't cite sources. Use RAG for knowledge, and fine-tuning for behaviour.
- **Long context**: if the whole corpus is small (a handful of documents), put it all in the prompt, with prompt caching. Simpler and often better.
- **Structured data**: "How many orders shipped last week?" is a SQL query (text-to-SQL or a tool call), not a semantic search over documents.

```recall
prompt: An interviewer asks, "Our RAG bot gives wrong answers. How would you debug and improve it?" Answer in under a minute.
points:
  - Build or use an eval set of real questions with expected answers and source passages
  - Check retrieval first (did the right passage come back in the top k?) separately from generation (was the answer faithful to what was retrieved?)
  - Retrieval fixes such as better parsing and chunking, hybrid search, re-ranking, query rewriting, freshness and filters
  - Generation fixes such as grounded prompts with citations, an "I don't know" path, and citation checks
model: |
  First I'd collect failing examples and build an eval set of real questions with expected answers and the passages that should support them, so changes are measured rather than guessed. Then I'd split the failure: for each bad answer, did retrieval return the right passage in the top k? If not, it's a retrieval problem, and I'd look at parsing, chunk size and context, hybrid BM25 plus vectors, re-ranking, query rewriting for follow-ups, and stale or duplicate documents. If retrieval was right but the answer was wrong, it's generation: tighten the prompt to answer only from the passages, require citations, allow "I don't know", and verify citations afterwards. I'd track recall@k and faithfulness separately, and rerun the evals on every change.
```

```questions
- kind: check
  prompt: A RAG bot answers wrongly, but the right passage was in the top 3 retrieved. Which stage failed?
  choices:
    - text: Generation; the model didn't use or faithfully follow the passage it was given
      correct: true
    - text: Retrieval
      why: Retrieval did its job here.
    - text: Ingestion
      why: The passage was indexed and found.
  explanation: Split every failure into retrieval vs generation before fixing anything.
- kind: check
  prompt: Why prepend the document title and section path to each chunk before embedding it?
  choices:
    - text: Chunks then make sense on their own, which improves retrieval of passages that rely on context
      correct: true
    - text: It reduces storage cost
      why: It slightly increases it.
    - text: Embedding models require titles
      why: They don't.
  explanation: This is the idea behind contextual retrieval.
- kind: check
  prompt: Your corpus is 12 product manuals totalling 60k tokens, and they rarely change. Simplest strong approach?
  choices:
    - text: Put them all in the prompt with prompt caching
      correct: true
    - text: Fine-tune a model on the manuals
      why: Fine-tuning is unreliable for facts, and can't cite sources.
    - text: Build a vector database with HNSW
      why: Possible, but unnecessary complexity at this size.
  explanation: Long context plus caching beats building a pipeline for small, stable corpora.
- kind: fire
  prompt: Which metric tells you whether retrieval found the right passage?
  choices:
    - text: Recall@k
      correct: true
    - text: Faithfulness
      why: That measures generation against retrieved context.
    - text: BLEU
      why: BLEU measures n-gram overlap with a reference text.
  explanation: Measure retrieval and generation with separate metrics.
- kind: fire
  prompt: When is fine-tuning a better fit than RAG?
  choices:
    - text: Teaching a consistent output format, tone or narrow task behaviour
      correct: true
    - text: Answering from documents that change weekly
      why: That needs retrieval.
    - text: When answers must cite sources
      why: Fine-tuned knowledge can't be cited.
  explanation: Use RAG for knowledge and fine-tuning for behaviour.
- kind: fire
  prompt: A user asks "and what about the Pro plan?" mid-conversation, and retrieval returns nothing useful. Fix?
  choices:
    - text: Rewrite the follow-up into a standalone query using the conversation history
      correct: true
    - text: Increase the chunk size
      why: The query lacks context; chunk size isn't the issue.
    - text: Use a larger LLM for generation
      why: Retrieval failed before generation.
  explanation: Query rewriting turns conversational fragments into searchable questions.
- kind: fire
  prompt: Where should per-user document permissions be enforced in RAG?
  choices:
    - text: In the retrieval query, as filters, so that unauthorised chunks are never retrieved
      correct: true
    - text: In the prompt, by asking the model not to reveal restricted content
      why: Prompts aren't access control.
    - text: After the answer is generated
      why: By then restricted content has already influenced the answer.
  explanation: Treat ACLs as a hard filter in search.
```
