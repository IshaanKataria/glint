# Glint Evaluation for 40-Agent Support Team

Sat, Nov 7, 2026, 4:02 AM · 1:46 · 2 AI uses

## Summary

Priya and the user discussed evaluating Glint for a 40-agent support team, covering current tools, SOC 2 compliance, pricing, and next steps including a security review with Marcus.

### Current Tools
- Support team has about 40 agents.
- Agents currently use Zendesk.
- An internal RAG pipeline was built on top of their knowledge base last year.

### SOC 2 Compliance
- Priya's biggest worry is SOC 2 compliance.
- Glint does not store call audio in the cloud.
- Transcription runs locally with WhisperX, so audio never leaves the laptop.

### Pricing
- Priya asked about pricing for 40 seats on an annual plan.
- User will send a quote by Friday with the annual discount included.

### Security Review
- Priya needs to loop in Marcus from security before signing anything.
- User offered to set up a 30-minute security review with Marcus next week.

## Action items

- [ ] Send the quote for 40 seats on an annual plan with annual discount included by Friday (Me)
- [ ] Set up a 30-minute security review with Marcus next week (Me)

## Transcript

**[0:00] Them:** Thanks for joining. So we are evaluating Glint for our support team of about forty agents.

**[0:09] Me:** Great to meet you, Priya. What tools are the agents using today?

**[0:18] Them:** Mostly Zendesk, and we built an internal RAG pipeline on top of our knowledge base last year.

**[0:27] Them:** Our biggest worry is SOC 2 compliance. Does your product store any call audio in the cloud?

**[0:36] Me:** No, transcription runs locally with WhisperX, so audio never leaves the laptop.

**[0:45] Them:** Okay. And what would pricing look like for forty seats on an annual plan?

**[0:54] Me:** I will send over a quote by Friday with the annual discount included.

**[1:03] Them:** Perfect. I also need to loop in Marcus from security before we sign anything.

**[1:12] Me:** Sounds good. I can set up a thirty minute security review with Marcus next week.

## AI usage

### Does Glint store any call audio in the cloud?

_4:03 AM · deepseek-v4-pro_

**No, Glint does not store call audio in the cloud.** Transcription runs locally on the laptop using WhisperX, so audio never leaves the device.

- **Local-only processing** — audio is transcribed on-device and discarded after transcription
- **No cloud audio storage** — nothing gets uploaded, so there's no audio to be SOC 2-audited
- **Transcription text** is the only artifact, and it stays under your control

### What should I say?

_4:03 AM · deepseek-v4-pro_

> Great — I'll send over a few time slots for next week and you can pick what works for Marcus.

**Or:**

> Perfect. I'll follow up with some times, and I'll have the quote to you before Friday so you have both in hand.
