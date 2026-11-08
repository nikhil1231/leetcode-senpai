---
id: gpu-kubernetes
category: platform
skill: platform
title: GPUs on Kubernetes - scheduling, sharing, autoscaling and cold starts
minutes: 17
summary: 'GPUs break Kubernetes'' usual assumptions. They''re expensive, scarce, indivisible by default, and slow to start. A node exposes them as an extended resource (nvidia.com/gpu), and the NVIDIA GPU Operator installs the drivers, device plugin and metrics. GPU node pools are tainted so nothing else lands on them. Sharing a card means MIG (hardware partitions with isolation) or time-slicing (none). Multi-GPU jobs need gang scheduling and team quotas, from tools like Kueue. Scale inference on queue depth or latency, not CPU. Most of the work is fighting cold starts, since an image and model weights can be hundreds of gigabytes.'
objectives:
  - Explain how pods request GPUs, and what the GPU Operator, device plugin and node pool taints do
  - Choose between whole GPUs, MIG and time-slicing for a workload
  - Use gang scheduling, quotas and priorities for shared GPU clusters
  - Autoscale inference on the right signals, and cut cold starts from minutes to seconds
sources:
  - ['Kubernetes docs: Schedule GPUs', 'https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/']
  - ['NVIDIA GPU Operator documentation', 'https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/index.html']
  - ['NVIDIA: Multi-Instance GPU user guide', 'https://docs.nvidia.com/datacenter/tesla/mig-user-guide/']
  - ['Kueue documentation', 'https://kueue.sigs.k8s.io/docs/']
  - ['KEDA documentation', 'https://keda.sh/docs/']
---

## How a pod gets a GPU

Kubernetes doesn't understand GPUs natively. A **device plugin** on each GPU node advertises them as an **extended resource**, `nvidia.com/gpu: 8`, and pods request whole units:

```text
resources:
  limits:
    nvidia.com/gpu: 2
```

GPUs can't be overcommitted or requested in fractions this way. A pod asking for 1 gets a whole card, even if it uses 10% of it.

The **NVIDIA GPU Operator** installs and manages everything a GPU node needs as Kubernetes resources: the driver, the container toolkit (so containers can see the GPU), the device plugin, **GPU Feature Discovery** (node labels such as GPU model and memory), the **DCGM exporter** (GPU metrics for Prometheus) and the MIG manager. Newer clusters can also use **Dynamic Resource Allocation (DRA)**, a richer Kubernetes API for requesting devices by attributes, rather than a simple count.

**GPU node pools** get a **taint** (for example `nvidia.com/gpu=present:NoSchedule`), so only pods with a matching **toleration** land there. Otherwise a logging sidecar or a CI job can take a slot on a node that costs tens of dollars an hour. Pods select the GPU type they need with node labels (H100 for a 70B model, a smaller card for embeddings).

## Sharing a GPU

Many workloads (a small embedding model, a classifier, a dev notebook) need a fraction of a big GPU.

- **MIG (Multi-Instance GPU)**: data-centre GPUs such as the A100 and H100 can be split in hardware into up to **7 instances**, each with its own memory and compute, isolated from the others. They appear as separate resources (such as `nvidia.com/mig-1g.10gb`). Predictable, safe for multiple tenants, but the partition sizes are fixed.
- **Time-slicing**: the device plugin advertises one GPU as several, and processes take turns. **No memory isolation**: one pod can use all the memory and crash its neighbours, and latency is unpredictable. Fine for dev and bursty, trusted workloads.
- **MPS** (Multi-Process Service): lets processes run kernels on the GPU at the same time, with limits but weaker isolation than MIG.

```sort
prompt: How should each workload get its GPU?
buckets: [Whole GPUs, MIG slice, Time-slicing]
items:
  - {text: 'A 70B chat model with tensor parallelism across 4 GPUs', bucket: 0, why: 'Needs all the memory and fast links between whole cards.'}
  - {text: 'Embedding models for three different customer tenants', bucket: 1, why: 'Small, steady, and needs isolation between tenants.'}
  - {text: 'Data scientists'' notebooks that mostly sit idle', bucket: 2, why: 'Bursty and trusted; isolation matters less than packing.'}
  - {text: 'A production reranker needing a steady p99 latency', bucket: 1, why: 'A fixed slice gives predictable performance.'}
```

## Scheduling a shared GPU cluster

- **Gang scheduling**: a training job that needs 32 GPUs must get all 32 at once. The default scheduler places pods one at a time, so two big jobs can each grab half the cluster and deadlock. **Kueue** (or Volcano) admits a job only when its whole set of pods can run.
- **Quotas per team**: Kueue's queues give each team a guaranteed share, and let them borrow idle capacity from others, to be taken back when the owner needs it.
- **Priority and preemption**: production inference outranks batch work, and batch outranks experiments. Preemptible work must **checkpoint**, so losing a node costs minutes, not days.
- **Bin-packing**: fill nodes before starting new ones, and keep jobs that need NVLink between GPUs on the same node. A cluster where every node has 2 free GPUs can't run a 4-GPU job.
- **Spot or preemptible GPUs** are much cheaper and suit batch work that checkpoints. Avoid them for latency-critical serving, unless there's on-demand capacity behind them.

## Autoscaling inference

**CPU utilisation is the wrong signal**: the CPU of a GPU server is mostly idle even when the GPU is saturated. And the DCGM "GPU utilisation" metric measures the share of time *any* kernel ran, not how busy the GPU really is, so it reads 100% at a fraction of capacity.

Scale on what users feel and what the engine knows: **waiting requests** (queue depth), **KV cache usage**, or **TTFT and TPOT** against the target. KEDA, or the HPA with custom metrics from Prometheus, can scale on these. Keep a **minimum number of warm replicas** for interactive traffic. Scale-to-zero suits rarely used models only if users accept the cold start.

```bug
title: An inference Deployment and its autoscaler
prompt: This serves a 70B model for interactive chat. Which lines will cause outages or wasted GPUs?
lang: yaml
code: |
  image: registry.example.com/llm-server:latest
  resources:
    limits: {nvidia.com/gpu: 4}
  args: ["--model", "s3://models/llama-70b"]
  # (no tolerations)
  autoscaler:
    metric: cpu
    target: 70%
    minReplicas: 0
bug: [1, 4, 5, 7, 9]
explain: |
  **Line 1**: `:latest` lets a new server version arrive on any restart. Pin a version or digest. **Line 4**: weights are pulled from object storage at every start, which for 140 GB is minutes of cold start. Cache them on node-local disk, or preload them into a volume. **Line 5**: GPU nodes are tainted, so with no toleration the pod never schedules (or, if nodes aren't tainted, other pods crowd onto them). **Line 7**: CPU says nothing about GPU load, so it won't scale up when users queue. Scale on waiting requests or latency. **Line 9**: zero minimum replicas means the first user after a quiet spell waits through a multi-minute cold start.
```

## Cold starts

Starting a new replica of a big model can take **many minutes**, made of:

1. **Getting a node**: a new cloud GPU node can take minutes to provision, if capacity exists at all.
2. **Pulling the image**: CUDA and serving images are often 10 to 20 GB.
3. **Loading the weights**: a 70B model in BF16 is 140 GB, from object storage to disk, then into GPU memory.
4. **Warm-up**: compiling kernels and capturing CUDA graphs.

```calc
title: Weights at startup
prompt: A replica downloads 140 GB of weights from object storage at 1 GB/s, then loads them into GPU memory at 5 GB/s. Ignoring everything else, how many seconds is that?
answer: 168
unit: s
tolerance: 1.1
steps: |
  Download: 140 s. Load: 140 ÷ 5 = 28 s. Total **168 s**, nearly three minutes, before image pulls, node provisioning and warm-up. Caching weights on node-local NVMe removes the download. Streaming loaders that read straight into GPU memory, and FP8 weights at half the size, cut the rest. And a warm minimum of replicas hides it from users entirely.
```

Fixes, in order of impact: keep **warm replicas** for interactive models, **pre-pull images** on GPU nodes, cache **weights on local NVMe** or a shared read-optimised volume, use **streaming model loaders** and safetensors, keep spare GPU capacity (or a reserved pool) rather than relying on new nodes, and use smaller formats where quality allows.

```recall
prompt: An interviewer asks, "Our GPU inference service falls over at traffic spikes, even though autoscaling is on. Why might that be, and what would you change?" Answer in under a minute.
points:
  - It's probably scaling on the wrong signal (CPU or GPU utilisation) rather than queue depth, KV cache usage or latency
  - Cold starts take minutes (node, image, weights, warm-up), so new replicas arrive after the spike has done its damage
  - Fix with warm minimum replicas and headroom, pre-pulled images, cached weights and streaming loaders
  - Add load shedding or queueing with admission control, and a fallback such as an external API for overflow
model: |
  Two likely causes. First, the signal: if it scales on CPU, or on DCGM GPU utilisation, it won't react to users queueing. I'd scale on waiting requests per replica or TTFT against the target, using the engine's metrics through KEDA. Second, cold starts: a new replica needs a node, a 15 GB image and 140 GB of weights, so it arrives minutes after the spike. I'd keep a warm minimum with headroom sized from traffic history, pre-pull images on GPU nodes, cache weights on local NVMe, and use a streaming loader. For spikes beyond that, admission control with a bounded queue and clear "busy" responses beats timeouts, and overflow can go to an external API as a fallback.
```

```questions
- kind: check
  prompt: Why taint GPU node pools?
  choices:
    - text: So only pods that tolerate it, which need GPUs, land there
      correct: true
    - text: So the device plugin can find the GPUs on the node when the node starts up
      why: The device plugin doesn't depend on taints.
    - text: So pods on those nodes are allowed to request fractions of a GPU
      why: Fractions need MIG or time-slicing, not taints.
  explanation: Keep expensive nodes for the workloads that need them.
- kind: check
  prompt: Two 32-GPU training jobs start on a 48-GPU cluster, and both stall. What prevents this?
  choices:
    - text: Gang scheduling, which admits a job only when all its pods can run
      correct: true
    - text: A higher CPU request on each pod, so the scheduler spreads the pods
      why: The problem is partial placement, not spreading.
    - text: Time-slicing, so every pod gets a turn on the GPUs it was given
      why: Training jobs need whole, dedicated GPUs.
  explanation: Without it, each job holds part of the cluster and waits for the rest.
- kind: check
  prompt: What's the main risk of time-slicing a GPU between tenants?
  choices:
    - text: No memory isolation, so one pod can exhaust memory for all
      correct: true
    - text: Each pod is limited to a fixed seventh of the GPU's memory
      why: That describes MIG's fixed partitions.
    - text: It only works on data-centre GPUs such as the A100 and H100
      why: Time-slicing works on most NVIDIA GPUs.
  explanation: Use MIG when tenants need isolation.
- kind: fire
  prompt: Best autoscaling signal for an LLM server?
  choices:
    - text: Waiting requests or latency against target
      correct: true
    - text: The CPU utilisation of the model server pods
      why: The CPU is idle while the GPU is busy.
    - text: DCGM GPU utilisation percentage
      why: It reads high long before capacity is reached.
  explanation: Scale on what users feel.
- kind: fire
  prompt: What does the GPU Operator do?
  choices:
    - text: Installs drivers, device plugin and GPU metrics
      correct: true
    - text: Schedules jobs into per-team queues
      why: That's Kueue.
    - text: Splits each physical GPU into many smaller GPUs
      why: That's MIG, which the Operator can configure.
  explanation: It manages the GPU software stack on each node.
- kind: fire
  prompt: Biggest single fix for a 70B model's slow cold start?
  choices:
    - text: Warm replicas and weights cached on local disk
      correct: true
    - text: Raise the pod's CPU and memory limits so it starts faster
      why: Downloading and loading weights is the slow part.
    - text: Use a :latest image tag
      why: That adds risk, not speed.
  explanation: Avoid the cold start for users, and shorten what's left.
- kind: fire
  prompt: What does a MIG slice give a workload?
  choices:
    - text: Isolated memory and compute on part of a GPU
      correct: true
    - text: A turn on the whole GPU every few milliseconds
      why: That's time-slicing.
    - text: Several GPUs linked as one large device
      why: That's multi-GPU parallelism.
  explanation: Hardware partitions, fixed in size.
```
