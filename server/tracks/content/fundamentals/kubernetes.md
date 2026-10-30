---
id: kubernetes
category: infrastructure
skill: infrastructure
title: Containers and Kubernetes
minutes: 17
summary: A container is a process isolated with namespaces and limited with cgroups, started from a layered image. Kubernetes runs a reconciliation loop. You declare desired state (Deployments, Services), and controllers keep moving the actual state toward it. Interviews probe the pieces (pods, Deployments, Services, Ingress, ConfigMaps, Secrets), requests vs limits, the three probes, rolling updates, autoscaling, and how to debug CrashLoopBackOff and Pending pods.
objectives:
  - Explain what a container is (namespaces, cgroups, image layers) and what it isn't
  - Describe the control plane, the reconciliation loop, and the core objects
  - Set requests, limits and probes correctly, and explain QoS and throttling
  - Debug Pending, CrashLoopBackOff, OOMKilled and failing rollouts
sources:
  - ['Kubernetes docs: Concepts', 'https://kubernetes.io/docs/concepts/']
  - ['Kubernetes docs: Liveness, readiness and startup probes', 'https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/']
  - ['Kubernetes docs: Resource management for pods and containers', 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/']
---

## Containers

A container is **not a VM**. It's an ordinary Linux process with:

- **Namespaces**, which give it its own view of PIDs, network interfaces, mounts, hostname and users.
- **cgroups**, which cap and account its CPU, memory and I/O.
- A root filesystem from an **image**: read-only layers, one per Dockerfile instruction, plus a thin writable layer. Layers are cached and shared, so order the Dockerfile from least to most frequently changed (dependencies before source code), and use multi-stage builds to keep compilers out of the runtime image.

All containers share the host kernel, which is why container escapes matter and why you run as non-root with a read-only root filesystem where you can.

## Kubernetes in one picture

You declare **desired state**. **Controllers** watch it and the actual state, and keep acting to close the gap. The pieces:

- **Control plane**: the API server (the only thing that talks to etcd), etcd (the cluster state, stored with Raft), the scheduler (assigns pods to nodes), and controller managers.
- **Nodes**: the kubelet (runs the pods it's assigned and reports status), a container runtime (containerd), and kube-proxy or an eBPF data plane for Service routing.

Core objects:

| Object | Purpose |
|---|---|
| Pod | One or more containers sharing a network namespace and volumes. Disposable. |
| Deployment → ReplicaSet | Keeps N identical pods running, and rolls out new versions |
| StatefulSet | Stable identities and per-pod volumes (databases, ZooKeeper, Kafka) |
| DaemonSet | One pod per node (log shippers, node agents) |
| Job / CronJob | Run to completion |
| Service | A stable virtual IP and DNS name in front of a changing set of pods (selected by label) |
| Ingress / Gateway | HTTP routing from outside the cluster to Services |
| ConfigMap / Secret | Configuration and credentials. Secrets are only base64-encoded, so enable encryption at rest and use RBAC |

## Requests, limits and QoS

- **Requests** are what the scheduler reserves. A pod is placed only on a node with that much unreserved capacity. Requests that are too high waste the cluster. Too low, and the node gets overcommitted.
- **Limits** are enforced at runtime. Exceeding the **memory** limit gets the container **OOMKilled**. Exceeding the **CPU** limit gets it **throttled**: the process is paused for the rest of each 100 ms period. That shows up as latency spikes, not errors, even when the node has idle CPU.
- Many teams set memory request = limit, and set a CPU request **without** a CPU limit, to avoid throttling latency-sensitive services.
- QoS classes decide eviction order under node pressure: **Guaranteed** (requests = limits for every resource), **Burstable**, **BestEffort** (no requests), which is evicted first.

## Probes

```sort
prompt: Which probe should handle each situation?
buckets: [Readiness, Liveness, Startup]
items:
  - {text: 'The app is up but its database is unreachable for a moment', bucket: 0, why: 'Stop sending it traffic, but restarting will not fix the database.'}
  - {text: 'The process is deadlocked and will never recover by itself', bucket: 1, why: 'Only a restart helps, which is liveness’s job.'}
  - {text: 'A JVM app takes 90 seconds to warm up on first boot', bucket: 2, why: 'A startup probe holds off liveness checks until the app is up, so it is not killed while starting.'}
  - {text: 'The pod is draining after SIGTERM', bucket: 0, why: 'Fail readiness so endpoints stop routing to it.'}
  - {text: 'The event loop has been blocked for 5 minutes', bucket: 1, why: 'A wedged process needs a restart.'}
```

The classic outage: a **liveness probe that checks dependencies**. The database has a blip, every pod's liveness check fails, and Kubernetes restarts the whole fleet at once, turning a blip into an outage. Liveness should only ask "is this process wedged?"

## Rollouts and scaling

A Deployment's rolling update replaces pods gradually (`maxSurge`, `maxUnavailable`), waiting for new pods to become **ready** before continuing. Without a readiness probe, "running" counts as ready and broken versions roll out fully. `kubectl rollout undo` rolls back. **PodDisruptionBudgets** limit how many pods voluntary disruptions (node drains) can take down at once.

The **HorizontalPodAutoscaler** scales replicas on CPU, memory or custom metrics, but CPU *utilisation* is measured relative to *requests*. The cluster autoscaler adds nodes when pods are Pending for lack of capacity.

```incident
title: A pod that won't come up
start: s0
nodes:
  s0:
    text: 'After a deploy, `kubectl get pods` shows the new pods in **CrashLoopBackOff**. What do you look at first?'
    options:
      - {label: '`kubectl logs <pod> --previous` and `kubectl describe pod <pod>`', next: s1, quality: good, note: 'The previous container’s logs show why it exited, and the events show the reason and exit code.'}
      - {label: 'Delete the pods so they get recreated', next: bad1, quality: bad, note: 'They are recreated from the same spec and crash the same way.'}
  bad1:
    text: 'The new pods crash identically. Ten minutes are gone.'
    verdict: bad
  s1:
    text: 'The logs end with `Error: required env var DATABASE_URL not set`, and the exit code is 1. The deploy renamed a key in the ConfigMap.'
    options:
      - {label: 'Roll back with `kubectl rollout undo`, then fix the ConfigMap reference', next: good, quality: good, note: 'Restores service first, then fixes forward safely.'}
      - {label: 'Edit the live ConfigMap by hand and restart the pods', next: okay, quality: ok, note: 'It works, but the cluster now differs from Git.'}
  okay:
    text: 'Pods start. Next week the CD pipeline re-applies the old manifest and the bug comes back.'
    verdict: ok
  good:
    text: 'The old ReplicaSet scales back up within seconds. The fixed manifest goes through CI.'
    verdict: good
debrief: 'CrashLoopBackOff means the container keeps exiting; the reason is in `logs --previous` and in `describe` (exit code, OOMKilled, failed probes). Pending means the pod can’t be scheduled: insufficient CPU or memory for its requests, taints, node selectors, or an unbound volume. ImagePullBackOff means a bad image name or missing registry credentials.'
```

```questions
- kind: check
  prompt: A container exceeds its CPU limit. What happens?
  choices:
    - text: It's throttled for the rest of each scheduling period, which shows up as latency
      correct: true
    - text: It's OOMKilled
      why: That's what exceeding the memory limit does.
    - text: It's moved to another node
      why: Kubernetes doesn't migrate running pods.
    - text: Nothing; CPU limits are advisory
      why: They're enforced by the cgroup CFS quota.
  explanation: CPU is compressible, so it's throttled. Memory isn't, so it's killed.
- kind: check
  prompt: Why is it dangerous for a liveness probe to check the database?
  choices:
    - text: A database blip fails every pod's liveness check, and Kubernetes restarts the whole fleet at once
      correct: true
    - text: Probes can't open network connections
      why: They can; that's the problem here.
    - text: It makes the pod Guaranteed QoS
      why: Probes don't affect QoS.
  explanation: Dependency health belongs in readiness, or nowhere. Liveness should detect a wedged process.
- kind: check
  prompt: What does the scheduler use to decide whether a pod fits on a node?
  choices:
    - text: The pod's resource requests against the node's unreserved allocatable capacity
      correct: true
    - text: The node's current actual CPU usage
      why: Scheduling is based on reservations, not live usage.
    - text: The pod's limits
      why: Limits are enforced at runtime, not used to place pods.
  explanation: That's why requests that are too low lead to overcommitted nodes.
- kind: fire
  prompt: A pod is stuck in Pending. What's the most likely category of cause?
  choices:
    - text: It can't be scheduled, for example because no node has enough capacity for its requests, or taints or volumes prevent it
      correct: true
    - text: The app is crashing on startup
      why: That's CrashLoopBackOff, after scheduling.
    - text: The readiness probe is failing
      why: That's a running but not-ready pod.
  explanation: kubectl describe pod shows the scheduler's events.
- kind: fire
  prompt: Which workload type gives each pod a stable name and its own persistent volume?
  choices:
    - text: StatefulSet
      correct: true
    - text: Deployment
      why: Deployment pods are interchangeable.
    - text: DaemonSet
      why: That runs one pod per node.
  explanation: StatefulSets suit ZooKeeper, Kafka and databases.
- kind: fire
  prompt: How are Kubernetes Secrets protected by default?
  choices:
    - text: They're base64-encoded; encryption at rest and RBAC must be configured to protect them
      correct: true
    - text: They're encrypted with a per-pod key
      why: Not by default.
    - text: They're stored only in node memory
      why: They're stored in etcd.
  explanation: Base64 is encoding, not encryption.
- kind: fire
  prompt: What makes a Docker build cache-friendly?
  choices:
    - text: Copying dependency manifests and installing them before copying the frequently changing source code
      correct: true
    - text: Putting everything in one RUN instruction
      why: Then any change invalidates everything.
    - text: Using the latest tag for the base image
      why: That hurts reproducibility, not caching.
  explanation: Each layer is reused until an instruction or its inputs change.
```
