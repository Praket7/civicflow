# Coverage health and attention rules

Coverage is not one number with a nice color. CivicFlow reports two separate measures so
the dashboard cannot contradict itself:

## 1. Role coverage (the metric card)

```text
role coverage = Σ filled role slots / Σ required role slots
                across shifts whose start is after the demo clock
```

- A role slot is one required person: Driver ×1, Spanish Support ×2, General ×6.
- Past shifts are excluded; they cannot be staffed.
- The demo workspace holds 39 filled of 43 required slots → **91%**.
- This is the number shown as “Role coverage · Upcoming 30 days”.

## 2. Seat fill (the weekly chart)

```text
seat fill for a day = Σ confirmed seats / Σ capacity for shifts on that local date
```

The demo-week values are 100 %, 92 %, 100 %, 83 %, 76 %, 62 %, 90 % (Mon 12 → Sun 18).
They are computed from shift rows, not stored as a chart series. A day with two shifts
(Saturday) sums both.

The chart is labeled “Seat fill” precisely because it is not the role coverage metric.

## 3. Needs Attention

A shift earns an attention item when it is within the next 14 days and:

1. It has an unfilled required role — detail names the role, e.g.
   `Driver missing · Sat 9:00 AM`. Severity is `critical` when the shift is within 5 days.
2. Otherwise, its seat fill is **below 75 %** and seats are open — detail is
   `2 spots open · Sat 1:00 PM`.

Items are sorted by shift start and capped at 3. A 75 % shift is normal pipeline, not an
alarm. This is why the Tuesday pantry gap (3 of 4 seats) does not appear, while Saturday's
62 % garden and food shifts do.

## Why the card and the bars disagree

The design shows a 91 % “Coverage this week” card while its own daily bars average
approximately 86 %. It also lists “3 items” while implying more gaps. The implementation
keeps one rule set for the card, the chart, the footer, and the Rust tests, so the numbers
agree everywhere and can be explained live.

## Invariants tested

- Role coverage ignores started shifts.
- Seat fill aggregates multiple shifts on a date.
- Attention prefers a missing role over open seats.
- A 75 % seat gap is not an attention item.
- Shifts beyond 14 days never appear.
- Rust and TypeScript produce identical details, order, labels, and percentages.
