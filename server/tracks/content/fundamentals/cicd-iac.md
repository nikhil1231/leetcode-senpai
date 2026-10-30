---
id: cicd-iac
category: infrastructure
skill: infrastructure
title: CI/CD, deployment strategies and infrastructure as code
minutes: 14
summary: Teams want engineers who ship safely. CI runs fast, reliable checks on every change. CD promotes one immutable artifact through environments. Deployment strategies (rolling, blue-green, canary, feature flags) limit the blast radius, and database changes go through expand and contract. Terraform manages infrastructure declaratively, with remote state, locking, plans in review and drift detection. Interviewers listen for rollback plans and safe migrations.
objectives:
  - Describe a good pipeline, from commit to production, with fast feedback and one artifact
  - Choose between rolling, blue-green, canary and feature flags, and know the rollback for each
  - Run schema changes safely with expand and contract
  - Explain Terraform state, plan and apply, locking, modules and drift
sources:
  - ['Google SRE Workbook: Canarying releases', 'https://sre.google/workbook/canarying-releases/']
  - ['Martin Fowler: Feature toggles', 'https://martinfowler.com/articles/feature-toggles.html']
  - ['Terraform docs: State', 'https://developer.hashicorp.com/terraform/language/state']
---

## A good pipeline

1. **On every push or PR**: lint, type-check, unit tests, build. Aim for under 10 minutes, because slow CI means bigger batches and riskier merges.
2. **Build once**: produce one immutable artifact, such as a container image tagged with the commit SHA, and promote *that same artifact* through staging and production. Rebuilding per environment means production runs something you never tested.
3. **Integration and end-to-end tests** against real dependencies (containers, ephemeral environments). Quarantine flaky tests and fix them; don't just retry them forever.
4. **Deploy automatically** to staging, then to production behind a progressive strategy, with automated health checks and **automatic rollback**.
5. **Secrets** come from a secret manager or OIDC federation (for example GitHub Actions assuming an AWS role), never as long-lived keys pasted into CI variables. Supply chain: pin dependencies, scan images, and sign artifacts.

## Deployment strategies

| Strategy | How | Rollback | Cost and risk |
|---|---|---|---|
| Rolling | Replace instances a few at a time | Roll forward or back gradually | Cheap. Old and new versions run together, so both must be compatible |
| Blue-green | Stand up the full new environment, then switch traffic | Switch back instantly | Double capacity during the switch. The database is shared, so schema compatibility is still needed |
| Canary | Send 1%, then 5%, then 25% of traffic to the new version while comparing metrics | Shift traffic back | Needs good metrics and automated analysis. Catches problems with the least exposure |
| Feature flags | Ship code dark, turn it on per user or per percentage | Flip the flag off | Decouples deploy from release. Flag debt must be cleaned up |

In every strategy, two versions coexist for a while, so **every change must be backward-compatible across one version step**: API fields, message formats, and especially database schema.

## Expand and contract

```order
prompt: Order the safe steps for renaming the column users.fullname to users.display_name with zero downtime.
items:
  - Add the new nullable display_name column (expand)
  - Deploy code that writes both columns and still reads fullname
  - Backfill display_name for existing rows in batches
  - Deploy code that reads display_name (still writing both)
  - Deploy code that stops writing fullname
  - Drop the fullname column (contract)
explain: At every step, the code running in production and the version before it both work against the current schema, so any deploy can be rolled back. Renaming in place breaks whichever version isn't expecting it.
```

## Terraform

Terraform compares your **configuration** (desired state) with its **state file** (what it believes it created) and the real infrastructure, then produces a **plan**: create, update in place, or replace.

- **Remote state with locking** (an S3 backend with a lock, or Terraform Cloud) stops two applies from corrupting state. State can contain secrets, so encrypt and restrict it.
- **Plan in PR review, apply from CI**: reviewers read the plan. Watch for `-/+ replace` on stateful resources such as databases. Use `prevent_destroy` and `create_before_destroy` lifecycle rules where they fit.
- **Modules** package reusable infrastructure. Separate state per environment and per blast radius: networking, data and apps in different states.
- **Drift** is when someone changed things by hand in the console. `terraform plan` shows it. Decide whether to import it into code or revert it.
- `terraform import` brings existing resources under management. `terraform state mv` handles refactors without destroying and recreating resources.

```predict
prompt: A reviewer sees this in a Terraform plan for production. What should happen next? `-/+ resource "aws_db_instance" "main" (forces replacement): engine_version "15.4" -> "16.1"`
choices:
  - Approve it; Terraform upgrades the database in place
  - Stop. Replacement destroys the database and creates a new empty one. Plan a proper upgrade path
  - Approve it; RDS keeps a snapshot, so nothing is lost
  - Run apply twice to make it idempotent
answer: 1
reveal: |
  `-/+` with "forces replacement" means destroy and recreate. For a database, that's data loss and downtime unless something else saves you. Major version upgrades must go through the provider's supported in-place upgrade (`allow_major_version_upgrade` with `apply_immediately` planned carefully), or a blue-green or replica-based migration. Guard stateful resources with `lifecycle { prevent_destroy = true }` so a plan like this fails outright.
```

```questions
- kind: check
  prompt: Why build a deployment artifact once and promote it, rather than rebuilding per environment?
  choices:
    - text: Production then runs exactly the bits that passed testing in staging
      correct: true
    - text: Builds are expensive
      why: True, but secondary. The point is that what you test is what you ship.
    - text: Containers can't be rebuilt
      why: They can, which is the risk.
  explanation: Rebuilds can pull different dependencies or base images.
- kind: check
  prompt: Which strategy exposes the fewest users to a bad release, given good metrics?
  choices:
    - text: Canary
      correct: true
    - text: Blue-green
      why: Blue-green switches all traffic at once, though it switches back fast.
    - text: Big-bang deploy
      why: Everyone is exposed at once.
  explanation: A canary starts with a small slice of traffic and expands only if metrics stay healthy.
- kind: check
  prompt: Why is "rename the column and deploy the code that uses it" unsafe during a rolling deploy?
  choices:
    - text: The old version keeps running during the rollout and still uses the old name
      correct: true
    - text: Postgres can't rename columns
      why: It can, instantly.
    - text: It's only unsafe with blue-green deploys
      why: Every strategy has a window where both versions run.
  explanation: Use expand and contract so that every step works for adjacent code versions.
- kind: fire
  prompt: What does remote state locking prevent in Terraform?
  choices:
    - text: Two concurrent applies corrupting the state or racing on changes
      correct: true
    - text: Anyone from reading the configuration
      why: Locking is about concurrent writes.
    - text: Drift
      why: Drift comes from changes made outside Terraform.
  explanation: Use a locking backend for every shared state.
- kind: fire
  prompt: A Terraform plan shows changes nobody made in code. What's the likely cause?
  choices:
    - text: Drift; someone changed the resources outside Terraform
      correct: true
    - text: Terraform randomly reorders resources
      why: Plans are deterministic given the same inputs.
    - text: The state file is encrypted
      why: Encryption doesn't cause diffs.
  explanation: Import the change into code or revert it, and restrict console write access.
- kind: fire
  prompt: What's the main ongoing cost of feature flags?
  choices:
    - text: Flag debt; stale flags multiply code paths and must be removed
      correct: true
    - text: They require blue-green infrastructure
      why: They're independent of deployment strategy.
    - text: They slow every request by seconds
      why: A good flag check is a fast in-memory lookup.
  explanation: Give every release flag an owner and an expiry.
- kind: fire
  prompt: How should a GitHub Actions workflow deploy to AWS without storing access keys?
  choices:
    - text: OIDC federation to assume an IAM role with short-lived credentials
      correct: true
    - text: Commit the keys to a private repo
      why: Private repos leak too.
    - text: Use the root account's keys in a secret
      why: Never use root, and it's still a long-lived key.
  explanation: The workflow's identity token is exchanged for temporary role credentials.
```
