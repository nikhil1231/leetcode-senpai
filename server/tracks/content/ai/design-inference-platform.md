---
id: design-inference-platform
category: platform
skill: platform
title: 'AI system design: an inference platform for a whole company'
minutes: 20
summary: '"Design the platform that serves open models to every team" pulls the deep-dive together. Clarify the models, traffic shapes and latency targets first. Then put a gateway in front for auth, quotas and routing. Pool GPUs by model, not by team, behind a router that knows which replica holds a prompt''s prefix in cache. Serve fine-tunes as adapters on shared bases, and fill idle capacity with batch work. Autoscale on queue depth with warm minimums, and keep an external API as overflow and fallback. Capacity is arithmetic: peak output tokens per second over tokens per replica at the latency target, plus headroom. The trade-offs to defend are utilisation against latency, sharing against isolation, and owning GPUs against renting tokens.'
objectives:
  - Clarify models, traffic shapes, latency targets, tenants and constraints for an inference platform
  - Design the gateway, router, model pools, adapter serving and batch tier
  - Plan GPU capacity from traffic and per-replica throughput at the latency target
  - Defend the trade-offs between utilisation, isolation, latency and building versus buying
sources:
  - ['vLLM documentation: production stack and distributed serving', 'https://docs.vllm.ai/']
  - ['Kubernetes Gateway API Inference Extension', 'https://gateway-api-inference-extension.sigs.k8s.io/']
  - ['Zheng et al.: SGLang and RadixAttention prefix caching', 'https://arxiv.org/abs/2312.07104']
  - ['Kueue documentation', 'https://kueue.sigs.k8s.io/docs/']
---

## 1. Clarify

- **Models**: a 70B chat model, a smaller 8B model for cheap tasks, two embedding models, a reranker, and about 30 LoRA fine-tunes owned by different teams.
- **Traffic shapes**: interactive chat and agents (latency-sensitive, spiky by time of day), and batch jobs (embedding backfills, evals, document processing) that only need to finish overnight.
- **Targets**: interactive TTFT p95 under 1 s and TPOT under 50 ms; batch by deadline. Availability 99.9% for interactive.
- **Tenants**: 50 teams, some with confidential data that must not be logged or mixed.
- **Constraints**: a fixed GPU budget, data must stay in two regions, and an external API contract that can be used for overflow on non-confidential traffic.
- **Why self-host at all?** Ask. Data residency, cost at this volume, and team fine-tunes are good reasons. If they don't hold, renting tokens from a provider is simpler.

## 2. Architecture

```arch
title: Inference platform
nodes:
  - {id: teams, label: 'Team services', kind: client, x: 0, y: 1}
  - {id: gw, label: 'Gateway (keys, quotas, policy)', kind: service, x: 1, y: 1}
  - {id: router, label: 'Model router (prefix + load aware)', kind: service, x: 2, y: 1}
  - {id: chat, label: '70B pool (TP=2, + LoRAs)', kind: worker, x: 3, y: 0}
  - {id: small, label: '8B, embed, rerank pools (MIG)', kind: worker, x: 3, y: 1}
  - {id: batch, label: 'Batch queue (Kueue, low priority)', kind: queue, x: 2, y: 2}
  - {id: reg, label: 'Model registry + weight cache', kind: storage, x: 4, y: 1}
  - {id: ext, label: 'External API (overflow)', kind: external, x: 3, y: 2}
  - {id: obs, label: 'Metrics, traces, cost', kind: storage, x: 1, y: 2}
edges:
  - [teams, gw, 'OpenAI-style API']
  - [gw, router, 'model alias']
  - [router, chat, 'interactive']
  - [router, small, 'cheap + embed']
  - [gw, batch, 'batch jobs']
  - [batch, chat, 'idle capacity']
  - [router, ext, 'overflow, non-confidential']
  - [reg, chat, 'weights + adapters']
  - [gw, obs, 'every request']
caption: Pools are per model, shared by all teams. Batch work fills idle GPUs at low priority, and confidential traffic never overflows outside.
```

Key decisions:

- **Gateway** (the gateway lesson): virtual keys per team, token quotas, cost attribution, model policy, and data rules: confidential tenants are tagged, never logged in full, and never routed to the external API.
- **Pool by model, not by team**: one 70B pool shared by every team uses GPUs far better than 50 small dedicated ones. Isolation comes from quotas, priority classes and per-tenant rate limits, plus dedicated pools only for tenants who need them contractually.
- **Router**: chooses a replica per request by **prefix-cache affinity** (send requests sharing a system prompt to the replica that holds it), by **load** (queue depth and KV cache usage, not round-robin) and by **adapter** (replicas that already have the team's LoRA loaded). The Kubernetes Gateway API Inference Extension standardises this kind of model-aware routing.
- **Fine-tunes as LoRA adapters** on the shared bases with multi-LoRA serving, instead of 30 full model copies. Adapters load from the registry on demand and stay cached on replicas that use them.
- **Small models packed with MIG** slices for embeddings and reranking, so they don't each hold a whole GPU.
- **Batch tier**: a queue (Kueue) admits batch work at low priority onto idle capacity, overnight and in daytime troughs, and preempts it when interactive load rises. Batch jobs checkpoint, so preemption is cheap. This is how the platform keeps utilisation high without hurting latency.
- **Autoscaling** on waiting requests and TTFT, with **warm minimum replicas** sized from the daily peak, weights cached on node-local NVMe, and pre-pulled images (the GPUs-on-Kubernetes lesson).
- **Overflow and fallback**: beyond capacity, non-confidential interactive traffic overflows to the external API's equivalent model (with its own evals). Confidential traffic queues with clear back-pressure instead.

## 3. Capacity, operations and cost

```calc
title: How many GPUs?
prompt: At the daily peak, interactive traffic needs 30,000 output tokens per second from the 70B model. Load tests show one replica (2 GPUs with tensor parallelism) sustains 2,000 output tokens per second while meeting the TTFT and TPOT targets. With 30% headroom, rounded up to whole replicas, how many GPUs does the 70B pool need?
answer: 40
unit: GPUs
tolerance: 1.05
steps: |
  30,000 ÷ 2,000 = 15 replicas at exactly the peak. With 30% headroom: 15 × 1.3 = 19.5, so **20 replicas, or 40 GPUs**. The per-replica figure must come from a load test at the latency target (goodput), not the engine's maximum throughput, which is measured with huge batches. Batch work then fills the off-peak hours on the same GPUs.
```

- **Load testing** each model and replica shape with realistic prompt and output length distributions sets the per-replica numbers, and every engine or model upgrade repeats it.
- **Model lifecycle**: the registry holds weights, adapters, their evals and their owners. New model versions go through the eval gate, shadow and canary like any release (the LLMOps lesson), and old ones are retired on a published schedule.
- **Observability**: per model and tenant, TTFT and TPOT percentiles, queue depth, KV cache usage, preemptions, GPU memory and error rates, plus cost per team from the gateway.
- **Failure handling**: a lost GPU node removes its replicas, the router drains them, and warm capacity absorbs the load. A bad model version rolls back by alias. A region outage fails over to the other region for non-residency-bound traffic.
- **Cost**: show each team its share. GPU-hours split by tokens served, priced so that self-hosting is compared honestly with the external API's per-token price, including the platform team's own time.

## 4. Rollout

Start with one model (the 8B, say) for a few teams through the gateway, with the external API as fallback. Add the 70B pool, then adapters, then the batch tier once the interactive pools are stable. Migrate teams alias by alias, so each team's switch is a config change with a rollback.

```interview
say: |
  "I'd start by asking why we're self-hosting. Data residency, team fine-tunes and cost at this volume justify it, and the external API stays as overflow and fallback. Every request goes through a gateway with team keys, token quotas, cost attribution and policy, including a rule that confidential tenants are never logged in full or sent outside. Behind it, GPUs are pooled by model, not team: a 70B pool with tensor parallelism of two, smaller pools for the 8B, embeddings and the reranker, packed on MIG slices. Team fine-tunes are LoRA adapters served on the shared bases. A router picks replicas by prefix-cache affinity, load and loaded adapter. Interactive pools autoscale on queue depth and TTFT, with warm minimums and cached weights, while batch jobs run through Kueue at low priority on idle capacity and get preempted at peaks. Capacity is arithmetic: 30,000 output tokens a second at peak over 2,000 per replica at the latency target, plus 30% headroom, is 20 replicas, or 40 GPUs. Models ship through eval gates, shadow and canary, by alias, so rollback is a config change."
followups:
  - q: A team says the shared pool is too slow and wants dedicated GPUs. What do you say?
    a: First check their metrics. If their TTFT is high because of their own bursts against their quota, raise the quota or give them a higher priority class, which is cheaper than dedicated GPUs. If they have a hard isolation or latency need, a dedicated pool is possible, charged to them, since idle dedicated GPUs are the most expensive way to buy latency.
  - q: How do you stop batch jobs from hurting interactive latency?
    a: Batch runs at a lower priority class and is admitted by the queue only onto spare capacity, with preemption when interactive queue depth or TTFT rises. Batch jobs checkpoint, so preemption costs little. The router also never sends interactive traffic to replicas busy with batch work.
  - q: When would you stop self-hosting a model?
    a: When the honest cost per token, including GPUs at real utilisation and the team's time, is above a provider's price for an equally good model on our evals, and nothing like residency or a fine-tune forces it. Then the alias moves to the external API, and the GPUs go to models that do need hosting.
weak: |
  One deployment per team, sized for each team's peak. Round-robin load balancing, scaling on CPU, no quotas, no batch tier, no capacity maths, and no plan for cold starts, fine-tunes or confidential data.
strong: |
  Asks why self-host, puts a gateway in front, pools by model with prefix- and load-aware routing, serves fine-tunes as adapters, packs small models on MIG, fills idle capacity with preemptible batch work, autoscales on queue depth with warm minimums, sizes capacity from load-tested goodput, and ships models through gates by alias.
```

```recall
prompt: In under a minute, explain how the platform keeps GPU utilisation high without hurting interactive latency.
points:
  - Pool GPUs by model across all teams instead of dedicating them per team
  - Route by prefix-cache affinity and load, and serve fine-tunes as adapters on shared bases
  - Fill idle capacity with low-priority, preemptible, checkpointing batch work admitted by a queue
  - Autoscale interactive pools on queue depth and latency with warm minimums, sized by load-tested goodput
model: |
  Sharing does most of it. GPUs are pooled by model across all teams, so one team's quiet hour is another's busy one, and fine-tunes are LoRA adapters on the shared bases rather than separate copies. The router sends each request to a replica with its prefix cached and room in its queue, so less work is repeated. Interactive pools keep warm minimums and scale on queue depth and time to first token, with capacity sized from load tests at the latency target. Whatever is left idle, overnight and in troughs, is filled by batch work that the queue admits at low priority and preempts when interactive load rises, and because batch jobs checkpoint, preemption costs little.
```

```questions
- kind: check
  prompt: Why pool GPUs by model rather than by team?
  choices:
    - text: Sharing absorbs each team's peaks, so far fewer GPUs sit idle
      correct: true
    - text: Each team's data is automatically kept separate inside a shared pool
      why: Isolation needs quotas and policy, not pooling.
    - text: Pools organised by model are the only layout Kubernetes supports for GPUs
      why: Kubernetes doesn't care how you organise them.
  explanation: Isolation comes from quotas and priorities; utilisation comes from sharing.
- kind: check
  prompt: Why size replicas from load-tested goodput, not the engine's maximum throughput?
  choices:
    - text: Maximum throughput uses batches that miss the target
      correct: true
    - text: Engines overstate throughput to make their benchmarks look good
      why: The figures are real, just measured at a different operating point.
    - text: Goodput includes the GPU memory needed for model weights
      why: Goodput is about requests meeting latency targets.
  explanation: Capacity is what you can serve within the targets.
- kind: check
  prompt: How do 30 team fine-tunes fit without 30 copies of the base model?
  choices:
    - text: LoRA adapters served on one shared base model
      correct: true
    - text: Merging all 30 fine-tunes into one combined model
      why: Their behaviours would interfere.
    - text: Time-slicing 30 full copies onto the same GPUs
      why: They'd still need 30 copies of the weights in memory.
  explanation: Multi-LoRA serving loads small adapters per request.
- kind: fire
  prompt: What does prefix-aware routing improve?
  choices:
    - text: Prefix cache hits, cutting repeated prefill
      correct: true
    - text: Fairness between teams' quotas
      why: That's the gateway's job.
    - text: The quality of the answers each model gives
      why: Routing doesn't change outputs.
  explanation: Same prefix, same replica, less work.
- kind: fire
  prompt: Where should confidential traffic go when pools are full?
  choices:
    - text: Into a queue with clear back-pressure
      correct: true
    - text: To the external API as overflow
      why: Confidential data must not leave.
    - text: To any free replica in another region with spare GPUs
      why: Residency rules may forbid it.
  explanation: Policy decides overflow, not capacity.
- kind: fire
  prompt: Why can batch work be preempted cheaply?
  choices:
    - text: It checkpoints, so it resumes later
      correct: true
    - text: It always runs on a smaller, cheaper model
      why: Model size isn't the point.
    - text: It never uses the KV cache
      why: It does.
  explanation: Preemption costs only work since the last checkpoint.
- kind: fire
  prompt: The pool needs 21 replicas of 2 GPUs. How many GPUs is that?
  type: numeric
  answer: 42
  unit: GPUs
  tolerance: 0.01
  explanation: 21 × 2 = 42.
```
