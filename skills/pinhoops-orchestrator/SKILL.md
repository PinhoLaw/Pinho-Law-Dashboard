# @PinhoOps — AI Operations Orchestrator

## Description
Catches every message containing `@PinhoOps` and routes it through the PinhoOps AI LangGraph system. Returns clean WhatsApp-formatted replies from 5 specialist agents.

## Trigger
Any message containing `@PinhoOps` (case-insensitive)

## Agents
- **MasterOperationsAgent** — Matter status, daily briefings, risk assessment
- **ScheduleProtectionAgent** — Calendar, execution blocks, availability
- **TaskDelegationAgent** — Assignment, workload, escalation
- **BillingCaptureAgent** — Time entries, billing, payment follow-ups
- **SalesPipelineAgent** — Leads, intake, pipeline management

## Examples
```
@PinhoOps daily briefing
@PinhoOps status on Mendes v. Apex
@PinhoOps log 2h on 1001: deposition prep
@PinhoOps who owes money?
@PinhoOps schedule meeting with Dr. Oliveira tomorrow at 2pm
@PinhoOps new lead: Maria Silva, immigration, consultation requested
@PinhoOps workload report
@PinhoOps pipeline summary
```

## Configuration
- **Endpoint:** `https://pinholaw-ops.vercel.app/api/pinhoops`
- **Method:** POST
- **Timeout:** 60 seconds (LLM processing)
- **Auth:** None required (webhook endpoint)

## Response Format
Returns WhatsApp-formatted text with:
- *Bold* for headers and emphasis
- _Italic_ for context
- Emoji indicators (🔴 🟡 🟢 for risk levels)
- Under 500 characters for client-facing messages
- Signed "Equipe PinhoLaw" for client messages
