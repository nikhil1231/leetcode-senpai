---
id: aws-core
category: infrastructure
skill: infrastructure
title: Cloud building blocks on AWS
minutes: 15
summary: Most cloud questions reuse a dozen services and a few principles. IAM decides who can do what (least privilege, roles over keys). A VPC with public and private subnets, security groups and NAT shapes the network. You choose compute (EC2, ECS/EKS, Lambda) and storage (S3, EBS, RDS/Aurora, DynamoDB), and glue it together with SQS, SNS and EventBridge. You design for an AZ failing, and you watch the bill.
objectives:
  - Explain IAM policies, roles and least privilege, and why long-lived keys are a risk
  - Sketch a VPC with public and private subnets, and route traffic correctly
  - Choose between EC2, containers and Lambda, and between RDS, DynamoDB and S3
  - Design for availability-zone failure, and name the usual cost traps
sources:
  - ['AWS Well-Architected Framework', 'https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html']
  - ['AWS IAM: Security best practices', 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html']
  - ['Amazon VPC: How it works', 'https://docs.aws.amazon.com/vpc/latest/userguide/how-it-works.html']
---

## IAM

Every API call is authenticated (who are you?) and authorised by **policies**: JSON documents that allow or deny actions on resources, optionally with conditions. Evaluation rule: **an explicit deny always wins, and otherwise everything not explicitly allowed is denied.**

- **Users** have long-lived credentials. Avoid access keys for them, and use SSO.
- **Roles** are assumed for short-lived credentials. EC2 instance profiles, ECS task roles, Lambda execution roles and EKS IRSA / pod identity all give workloads credentials without storing secrets.
- **Least privilege**: grant specific actions on specific ARNs, not `s3:*` on `*`.
- Leaked long-lived keys in Git are one of the most common real breaches. Bots scan public repos within minutes.

## Networking: the VPC

A **VPC** is your private network, split into **subnets**, each in one availability zone.

- A **public subnet** has a route to an **internet gateway**. Load balancers and bastions live there.
- A **private subnet** has no inbound route from the internet. App servers and databases live there, and reach out through a **NAT gateway** (which is billed per GB, a classic cost trap) or, for AWS services, through **VPC endpoints**.
- **Security groups** are stateful, per-instance allow lists ("allow 5432 from the app-tier security group"). **Network ACLs** are stateless, per-subnet rules. Most designs rely on security groups.

```arch
title: A typical three-tier VPC across two AZs
nodes:
  - {id: users, label: Users, kind: client, x: 0, y: 1}
  - {id: alb, label: 'ALB (public subnets)', kind: lb, x: 1, y: 1}
  - {id: app, label: 'App on ECS (private)', kind: service, x: 2, y: 1}
  - {id: db, label: 'RDS Multi-AZ (private)', kind: db, x: 3, y: 0}
  - {id: s3, label: 'S3 via VPC endpoint', kind: storage, x: 3, y: 2}
  - {id: nat, label: 'NAT gateway', kind: external, x: 2, y: 2}
edges:
  - [users, alb, HTTPS]
  - [alb, app, 'SG: from ALB only']
  - [app, db, 'SG: 5432 from app']
  - [app, s3, endpoint]
  - [app, nat, 'outbound APIs']
caption: Only the load balancer is reachable from the internet. Each tier's security group admits traffic only from the tier in front of it, and the database runs a synchronous standby in a second AZ.
```

## Compute and storage choices

```sort
prompt: Which is the better default for each workload?
buckets: [Lambda, Containers (ECS/EKS) or EC2]
items:
  - {text: 'Resize images uploaded to S3, a few thousand a day', bucket: 0, why: 'Event-driven, spiky and short: pay per invocation, no servers.'}
  - {text: 'A low-latency API with steady traffic of 2,000 requests per second', bucket: 1, why: 'Steady load is cheaper on always-on capacity, and there are no cold starts.'}
  - {text: 'A video transcode taking 40 minutes per file', bucket: 1, why: 'Lambda caps execution at 15 minutes.'}
  - {text: 'A nightly job that calls an API and writes a report', bucket: 0, why: 'Short, scheduled and idle the rest of the day.'}
  - {text: 'A service holding thousands of long-lived websocket connections', bucket: 1, why: 'Long-lived connections fit long-running processes better.'}
```

Storage, in one line each:

- **S3**: object storage with eleven nines of durability. Strongly consistent reads after writes. Good for files, backups and data lakes. Not a filesystem, and no partial updates.
- **EBS**: block volumes attached to one instance in one AZ.
- **RDS / Aurora**: managed relational databases. Multi-AZ gives a synchronous standby for failover. Read replicas are asynchronous and serve reads.
- **DynamoDB**: key-value and document store with single-digit-millisecond reads at any scale, if you design around access patterns (partition key, sort key, GSIs). Hot partitions and scans are the traps.
- **ElastiCache**: Redis or Memcached.

Glue: **SQS** (queues with at-least-once delivery, visibility timeouts and DLQs; FIFO queues for ordering), **SNS** (pub/sub fan-out), **EventBridge** (event routing by rules), **Kinesis** (ordered streams, like Kafka).

## Availability and cost

- **Regions** contain several **availability zones**, which are separate data centres. Design to survive losing one AZ: at least two AZs for every tier, a Multi-AZ database, and stateless app servers behind a load balancer. Multi-region is far more expensive and complex. Justify it with a real RTO/RPO requirement.
- Cost traps: NAT gateway data processing, cross-AZ and internet egress, idle over-provisioned instances, unattached EBS volumes and old snapshots, CloudWatch log ingestion, and DynamoDB scans. Savings Plans or Reserved Instances suit steady load, and Spot suits interruptible batch work.

```questions
- kind: check
  prompt: An IAM policy allows s3:GetObject on a bucket, and another policy attached to the same role explicitly denies it. What happens?
  choices:
    - text: The request is denied; an explicit deny always wins
      correct: true
    - text: It's allowed, because one policy allows it
      why: Explicit denies override allows.
    - text: The most recently attached policy wins
      why: Attachment order doesn't matter.
  explanation: Default deny, explicit allow, and explicit deny overrides everything.
- kind: check
  prompt: How should an ECS service get credentials to read from S3?
  choices:
    - text: Through an IAM task role, which provides short-lived credentials automatically
      correct: true
    - text: Access keys stored in environment variables
      why: Long-lived keys can leak and are hard to rotate.
    - text: Root account credentials
      why: Never use root for workloads.
  explanation: Roles avoid storing secrets at all.
- kind: check
  prompt: App servers in a private subnet need to call an external payments API. What do they route through?
  choices:
    - text: A NAT gateway in a public subnet
      correct: true
    - text: The internet gateway directly
      why: Instances without public IPs can't use the internet gateway directly.
    - text: A VPC endpoint
      why: Endpoints reach AWS services, not arbitrary internet APIs.
  explanation: NAT allows outbound connections without allowing inbound ones.
- kind: fire
  prompt: What's the difference between RDS Multi-AZ and a read replica?
  choices:
    - text: Multi-AZ is a synchronous standby for failover; a read replica is asynchronous and serves reads
      correct: true
    - text: They're the same thing under different names
      why: They serve different purposes.
    - text: Read replicas are synchronous
      why: They're asynchronous, so reads can be stale.
  explanation: Use Multi-AZ for availability and replicas for read scaling.
- kind: fire
  prompt: What's Lambda's maximum execution time for one invocation?
  type: numeric
  answer: 15
  unit: minutes
  tolerance: 0.01
  explanation: Longer jobs belong on containers, EC2, Batch or Step Functions.
- kind: fire
  prompt: Which is a stateful, instance-level firewall in a VPC?
  choices:
    - text: A security group
      correct: true
    - text: A network ACL
      why: NACLs are stateless and apply per subnet.
    - text: A route table
      why: Route tables direct traffic; they don't filter it.
  explanation: Security groups track connections, so return traffic is allowed automatically.
- kind: fire
  prompt: A bill shows a surprising "NAT Gateway - data processed" line. What's a typical fix?
  choices:
    - text: Add VPC gateway endpoints for S3 and DynamoDB so that traffic bypasses the NAT
      correct: true
    - text: Move the database to a public subnet
      why: That's a security regression.
    - text: Add a second NAT gateway
      why: That adds cost; it doesn't reduce data processed.
  explanation: Gateway endpoints for S3 and DynamoDB are free and keep the traffic private.
```
