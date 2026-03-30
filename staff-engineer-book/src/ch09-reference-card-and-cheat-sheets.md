# 9. Reference Card & Cheat Sheets

> **What you'll learn:**
> - A quick-reference cheat sheet for Staff-level behavioral interview questions, organized by competency
> - A catalog of common corporate anti-patterns and how to recognize them
> - A complete RFC template ready to copy and adapt
> - The Staff Engineer's weekly operating rhythm

---

## Staff-Level Behavioral Interview Questions

### Navigate Ambiguity

| # | Question | What They're Really Evaluating |
|---|---|---|
| 1 | "Tell me about a time you had to define a project's direction without clear requirements." | Can you create structure from chaos? |
| 2 | "Describe a situation where you had to make a critical decision with incomplete data." | Do you act on 70% confidence, or do you freeze? |
| 3 | "Tell me about a time the business goals were unclear. How did you proceed?" | Can you diagnose the real problem behind a vague request? |
| 4 | "How do you decide what to work on when everything is a priority?" | Can you ruthlessly prioritize based on impact? |

### Influence Without Authority

| # | Question | What They're Really Evaluating |
|---|---|---|
| 5 | "Tell me about a time you convinced a team to change their technical approach." | Can you persuade without commanding? |
| 6 | "Describe a situation where you had to align multiple teams with conflicting priorities." | Can you find win-win solutions or make hard trade-offs? |
| 7 | "Tell me about a time you had to push back on a senior leader." | Do you have the courage to speak truth to power, constructively? |
| 8 | "How do you build trust with teams you don't directly work with?" | Do you invest in relationships proactively? |

### Deliver Results at Scale

| # | Question | What They're Really Evaluating |
|---|---|---|
| 9 | "Tell me about the most impactful project you've driven." | What's the ceiling of your scope and impact? |
| 10 | "Describe a time you had to get a project back on track after it started failing." | Can you rescue a failing project through leadership, not just execution? |
| 11 | "Tell me about a project that required coordinating multiple teams. How did you manage dependencies?" | Do you have a system for cross-team execution? |
| 12 | "How do you balance short-term delivery pressure with long-term technical health?" | Can you articulate trade-offs in business terms? |

### Handle Conflict and Earn Trust

| # | Question | What They're Really Evaluating |
|---|---|---|
| 13 | "Tell me about a time you disagreed with a more senior engineer." | Can you advocate for your position without being adversarial? |
| 14 | "Describe a time you gave difficult feedback to a peer." | Are you direct but empathetic? |
| 15 | "Tell me about a time you had to resolve a technical disagreement between two engineers." | Can you mediate based on principles, not politics? |
| 16 | "How do you build psychological safety on your team?" | Do you model vulnerability and blameless behavior? |

### Fail and Learn

| # | Question | What They're Really Evaluating |
|---|---|---|
| 17 | "Tell me about your biggest professional failure." | Are you self-aware? Do you learn from mistakes? |
| 18 | "Describe a time when a project you led didn't meet its goals." | Do you take ownership of failures, or deflect? |
| 19 | "Tell me about a decision you made that turned out to be wrong. What did you learn?" | Can you name your mistakes without excuses? |
| 20 | "How have you changed your approach to leadership over your career?" | Have you grown, or are you the same person you were 5 years ago? |

### Think Big / Strategic Impact

| # | Question | What They're Really Evaluating |
|---|---|---|
| 21 | "Tell me about a time you identified a problem nobody else was working on." | Can you see beyond your team's immediate scope? |
| 22 | "Describe a technical strategy you defined that lasted beyond a single quarter." | Can you think in years, not sprints? |
| 23 | "How do you decide what the right level of investment is for technical debt?" | Can you frame tech debt as a business decision? |
| 24 | "Tell me about a time you simplified a complex system." | Do you fight complexity, or add to it? |

### Disagree and Commit

| # | Question | What They're Really Evaluating |
|---|---|---|
| 25 | "Tell me about a time a decision was made that you disagreed with. What did you do?" | Can you commit genuinely, not passive-aggressively? |
| 26 | "How do you handle situations where your technical recommendation is overruled?" | Do you get bitter, or do you get constructive? |

---

## Common Corporate Anti-Patterns

Recognizing these patterns is the first step to avoiding or fixing them.

| Anti-Pattern | Description | How to Recognize It | Staff Engineer Response |
|---|---|---|---|
| **The Ivory Tower** | Architecture decisions made by people who don't build the systems | Design docs from architects who haven't written code in the affected codebase | Attend implementation meetings. Build proofs-of-concept yourself. |
| **The Endless RFC** | Documents circulate forever with no decision | RFC has 47 comments and no status change in 3 weeks | Set a decision deadline. "If no blocking concerns by Friday, I'll treat this as approved." |
| **Hero Culture** | One person is the single point of failure for a critical system | "Only Alice knows how the payment router works" | Write runbooks. Pair program. Rotate on-call. |
| **The Undead Project** | A project that should be killed but nobody has the courage to terminate it | Nobody can articulate the current business case. Status meetings have no action items. | Write a 1-pager: "Here's what this project costs us in opportunity cost. Here's what we'd invest in instead." |
| **Scope Stampede** | Every stakeholder adds requirements. Scope grows. Nothing ships. | Sprint velocity drops every quarter but backlog grows | Protect scope with explicit Goals and Non-Goals in the RFC. Push back early. |
| **Ship and Forget** | Features launch, nobody measures whether they worked | No metrics defined in the RFC. No post-launch review. | Add a "Success Metrics" section to every RFC. Schedule a 30-day post-launch review. |
| **Consensus Paralysis** | Everyone must agree, so nothing ever gets decided | "We need to get alignment with 8 teams before we can start" | Identify the *minimum* set of stakeholders needed. Use RACI to clarify who decides vs. who is informed. |
| **Rewrite Fantasy** | Engineers propose rewriting a system from scratch every 6 months | "If we just rewrote it in [latest technology]..." | Ask: "What specific business metric does the rewrite improve? What's the ROI vs. incremental improvement?" |
| **Promotion-Driven Development** | Engineers pick projects for their promo case, not for business impact | Large, ambitious projects that don't map to business priorities | Align your career growth with the org's highest-priority problems. |

---

## RFC Template

Copy and adapt this template for your organization.

```markdown
# RFC: [Short, Specific, Searchable Title]

**Author:** [Your Name]
**Status:** Draft | In Review | Approved | Superseded by RFC-XXX
**Created:** YYYY-MM-DD
**Last Updated:** YYYY-MM-DD
**Decision Deadline:** YYYY-MM-DD

## 1. Context and Problem Statement

[1–2 paragraphs. What problem are we solving? What is the business impact?
Reference the problem framing document if one exists.
Include quantified metrics: revenue at risk, users affected, SLA violations.]

## 2. Goals and Non-Goals

### Goals
- [Goal 1: specific, measurable]
- [Goal 2: specific, measurable]

### Non-Goals
- [Non-goal 1: what this RFC deliberately does NOT address]
- [Non-goal 2: explicitly out of scope]

## 3. Proposed Solution

[2–4 pages. Describe your recommended approach in enough detail
that a Senior engineer could implement it.]

### 3.1 Architecture Overview

[Diagram: boxes-and-arrows showing the proposed system.]

### 3.2 API / Interface Changes

[If applicable: the specific API contracts, data formats,
or interface changes being proposed.]

### 3.3 Data Model Changes

[If applicable: schema changes, migration strategy.]

### 3.4 Rollout Plan

[How will this be deployed? Canary? Percentage rollout?
Feature flag? What's the rollback strategy?]

## 4. Alternatives Considered

### Option A: [Name] (Recommended)
- **Pros:** [...]
- **Cons:** [...]

### Option B: [Name]
- **Pros:** [...]
- **Cons:** [...]
- **Why not:** [Clear rationale for rejection]

### Option C: [Name]
- **Pros:** [...]
- **Cons:** [...]
- **Why not:** [Clear rationale for rejection]

## 5. Trade-offs and Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [How you'll address it] |
| [Risk 2] | [H/M/L] | [H/M/L] | [How you'll address it] |

## 6. Success Metrics

| Metric | Current Value | Target Value | Measurement Method |
|---|---|---|---|
| [Metric 1] | [X] | [Y] | [Dashboard / query / tool] |
| [Metric 2] | [X] | [Y] | [Dashboard / query / tool] |

## 7. Open Questions

- [Question 1: something you don't know yet and need input on]
- [Question 2: a decision that can be deferred to implementation]

## 8. Timeline

| Phase | Duration | Deliverable |
|---|---|---|
| Phase 1 | [X weeks] | [What ships] |
| Phase 2 | [X weeks] | [What ships] |

## 9. Appendix

[Optional: Detailed calculations, benchmark results,
reference implementations, links to related RFCs/ADRs.]
```

---

## The Staff Engineer's Weekly Operating Rhythm

This is a sample weekly schedule for a Staff engineer. Adapt it to your organization and archetype.

| Day | Morning | Afternoon |
|---|---|---|
| **Monday** | Review week's priorities. Update dependency map. Write/review RFCs. | Team architecture review. 1:1 with EM. |
| **Tuesday** | Deep technical work (code, prototyping, investigation). | Cross-team sync. Stakeholder pre-wiring for upcoming decisions. |
| **Wednesday** | Code review. Mentoring/pairing sessions. | Org-wide architecture review. |
| **Thursday** | Deep technical work. | 1:1s with peer Staff engineers. Read cross-team incident reports. |
| **Friday** | Write status update for leadership. Plan next week. | Learning time: read papers, attend tech talks, explore new tools. |

### Time Allocation Guidelines

| Activity | % of Time | Notes |
|---|---|---|
| Strategic work (RFCs, problem framing, roadmap planning) | 30% | This is your primary deliverable |
| Code and technical work | 25% | Targeted, high-leverage code — not ticket grinding |
| Communication (meetings, 1:1s, stakeholder management) | 25% | Pre-wiring, alignment, managing up |
| Mentoring and culture building | 10% | Investing in people and processes |
| Learning and exploration | 10% | Staying current, exploring adjacent domains |

---

## Quick Reference: Senior vs. Staff Mindset

| Situation | Senior Instinct | Staff Approach |
|---|---|---|
| Vague request from leadership | "Can you clarify the requirements?" | "Let me investigate and come back with a framing." |
| Cross-team dependency is blocking you | "I sent them a Slack message" | "I schedule a 1:1 with their tech lead and propose an interface contract." |
| Technical disagreement with a peer | "I know I'm right, let me prove it" | "Let me understand their mental model. What data would change my mind?" |
| A project is behind schedule | "I'll work longer hours" | "I'll cut scope, restructure phases, and realign expectations with stakeholders." |
| A system I don't own is causing problems | "Not my problem" | "I'll diagnose, document, and propose a fix — even if the implementation is someone else's." |
| A meeting is unproductive | Suffers through it | "What decision are we trying to make? Who needs to be here? Let's timebox this." |
| Manager asks "What should we do?" | Waits for direction | Proposes 2–3 options with trade-offs and a recommendation |
| Post-incident | "That was stressful" | "Here's the postmortem with 5 action items and 3 systemic fixes." |

---

## The Three Laws of Staff Engineering

1. **Organizational clarity is your primary deliverable.** Code is a tool, not the product of your work.

2. **Every decision is a trade-off. Name it.** If you can't name what you're giving up, you haven't thought hard enough.

3. **Impact is measured at the organizational level.** Your work isn't done when *you* ship — it's done when the *org* ships the right thing.

---

> **Key Takeaways**
> - Use these reference materials actively during interview prep and day-to-day work.
> - The behavioral question bank covers every competency dimension evaluated in L6/L7 loops.
> - Recognize anti-patterns early and address them with data and proposals, not complaints.
> - The RFC template and weekly rhythm are starting points — adapt them to your organization.

> **See also:**
> - [Chapter 1: The Staff Archetypes](ch01-the-staff-archetypes.md) — Start here if you're just beginning the Staff journey
> - [Chapter 7: Mastering the Behavioral Loop](ch07-mastering-the-behavioral-loop.md) — How to use these questions in practice
> - [Chapter 8: Capstone Project](ch08-capstone-the-l7-behavioral-mock.md) — The ultimate test of your preparation
