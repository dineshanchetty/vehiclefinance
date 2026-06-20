# WhatsApp Template — Seller Intro

Used by the bot's `notify_seller` tool to **initiate** a WhatsApp conversation
with a seller after the buyer has been credit-approved. WhatsApp / Meta require
a pre-approved Message Template for any *first* contact outside the 24-hour
customer-care window.

## Submitting for approval

Submit this in the Dialog360 WhatsApp Manager → Templates → New Template (or
direct via Meta Business Manager).

| Field | Value |
|---|---|
| **Template name** | `seller_intro_v1` |
| **Category** | `UTILITY` (transactional — buyer initiated a financed purchase of seller's vehicle) |
| **Language** | `en` (English) |
| **Header** | None |
| **Footer** | `Claimtec FinOps` |
| **Buttons** | Quick reply: `START` · Quick reply: `Not my vehicle` |

### Body

```
Hi {{1}} 👋

{{2}} has applied to finance the purchase of your {{3}} for {{4}} through
Claimtec FinOps.

I'm a WhatsApp assistant from the bank's broker. I'll guide you through
your part of the deal — confirming your details, the vehicle, banking
info for payout, and arranging a roadworthy + technical inspection.

It's all done over WhatsApp and takes about 10–15 minutes. Reply START
when you're ready.
```

### Variable map

| Var | Field | Example |
|---|---|---|
| `{{1}}` | Seller first name | `Thabo` |
| `{{2}}` | Buyer full name | `Dineshan Chetty` |
| `{{3}}` | Vehicle (year + make + model) | `2018 Volkswagen Golf 7 GTI` |
| `{{4}}` | Agreed price (pre-formatted with R + thousand sep) | `R 285,000` |

### Sample preview (what the seller actually sees)

> Hi Thabo 👋
>
> Dineshan Chetty has applied to finance the purchase of your 2018
> Volkswagen Golf 7 GTI for R 285,000 through Claimtec FinOps.
>
> I'm a WhatsApp assistant from the bank's broker. I'll guide you through
> your part of the deal — confirming your details, the vehicle, banking
> info for payout, and arranging a roadworthy + technical inspection.
>
> It's all done over WhatsApp and takes about 10–15 minutes. Reply START
> when you're ready.
>
> _Claimtec FinOps_
>
> [START] [Not my vehicle]

### Why UTILITY (not MARKETING)

This is not promotional — the buyer has already entered a binding offer to
purchase from the seller. We're notifying the seller about a transactional
event that materially affects them. UTILITY templates have higher approval
rates and lower delivery costs.

## Wiring it up after approval

Once approved, set these env vars on the bot (Fly secrets / Railway / Vercel):

```bash
WHATSAPP_TEMPLATE_SELLER_INTRO=seller_intro_v1
WHATSAPP_TEMPLATE_SELLER_INTRO_LANG=en
```

The bot's `notify_seller` tool auto-detects the env var and switches from
the dev plain-text path to the approved template. No code change needed.

## Future templates to apply for

These will be needed for other bot-initiated sequences:

- `seller_inspection_reminder_v1` — *"Hi {{1}}, the inspection on {{2}} is scheduled for {{3}}…"*
- `seller_payout_complete_v1` — *"Hi {{1}}, R{{2}} was paid into your {{3}} account today…"*
- `buyer_credit_approved_v1` — *"Good news {{1}} — your application for {{2}} was approved at {{3}}/month…"*
- `buyer_credit_declined_v1` — *"Hi {{1}}, your application for {{2}} couldn't proceed. {{3}} from our team will call you on {{4}}…"*
- `buyer_handover_ready_v1` — *"Hi {{1}}, your {{2}} is ready for collection. Reply YES to confirm and we'll arrange the handover…"*

Each follows the same structure: short, transactional, named variables,
quick-reply buttons for the next step.
