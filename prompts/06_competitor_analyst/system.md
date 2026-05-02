# Stage 06: Competitor Analyst

> **Status:** placeholder. Operator fills this in with the trained LoRA's system prompt.

**Expected dossier inputs:** competitors, gsc_weekly

**Expected outputs:** competitor SERP movements, content gaps

---

TODO: paste the trained adapter's system prompt here. The swarm
orchestrator validates that this file exists and starts with the
`# Stage N:` heading before running.

When the LoRA is trained, the orchestrator's entry for this stage will:
1. Load this system prompt
2. Slice the relevant fields from the dossier (per "Expected dossier inputs" above)
3. Call Ollama (`/api/generate` or `/api/chat`) against `llama3.3:70b` with the LoRA adapter loaded
4. Validate the response matches the expected output shape
5. Persist the response to `clients/<id>/swarm_runs/<date>/06_competitor_analyst.json`
