"""Python mirror of the contract's bonus computation (SPEC 4.3, payWithBoost step 5).

Order of clamps, quoted from SPEC 4.3:
  5. 보너스 대상 금액 base = amount - useCredit. 다음 순서로 깎는다. 어느 단계에서 0이 되어도 revert하지 않는다.
     - pairDay[personId][merchant] == day 이면 boost = 0.
     - 슬롯 상한: remainSlot = slotBaseline * slotCapBps / 10000 - slotVolume[merchant][hourEpoch]. base = min(base, remainSlot).
     - boost = base * rate / 10000
     - boost = min(boost, perTxBoost, personDailyBoost - personDay[personId][day], zoneHourlyCap - zoneHourSpent, zoneBudget)
  6. tier == 2 이면 boost = 0. 카운터는 tier 0·1일 때만 갱신.

The simulation has no zone budgets or hourly caps (both are city-level knobs, not part of the
consumer model), so those two clamps are omitted. All amounts are integers (won)."""

from __future__ import annotations

from dataclasses import dataclass, field

PER_TX_BOOST = 3000
PERSON_DAILY_BOOST = 5000
SLOT_CAP_BPS = 15000


@dataclass
class CapState:
    """Counters keyed exactly like the contract's mappings."""

    pair_day: dict[tuple[int, int], int] = field(default_factory=dict)  # (person, merchant) -> day
    slot_volume: dict[tuple[int, int], int] = field(default_factory=dict)  # (merchant, hour_epoch) -> won
    person_day: dict[tuple[int, int], int] = field(default_factory=dict)  # (person, day) -> won

    def compute(self, person: int, merchant: int, base: int, rate_bps: int, day: int, hour_epoch: int, slot_baseline: int) -> int:
        if self.pair_day.get((person, merchant)) == day:
            return 0
        slot_cap = slot_baseline * SLOT_CAP_BPS // 10000
        volume = self.slot_volume.get((merchant, hour_epoch), 0)
        remain_slot = 0 if volume >= slot_cap else slot_cap - volume
        base = min(base, remain_slot)
        boost = base * rate_bps // 10000
        boost = min(boost, PER_TX_BOOST)
        used = self.person_day.get((person, day), 0)
        boost = min(boost, 0 if used >= PERSON_DAILY_BOOST else PERSON_DAILY_BOOST - used)
        return boost

    def apply(self, person: int, merchant: int, base: int, boost: int, day: int, hour_epoch: int, tier: int) -> None:
        """Step 6 counters: slot volume for tier 0/1; pairDay/personDay only when boost > 0."""
        if tier >= 2:
            return
        self.slot_volume[(merchant, hour_epoch)] = self.slot_volume.get((merchant, hour_epoch), 0) + base
        if boost > 0:
            self.person_day[(person, day)] = self.person_day.get((person, day), 0) + boost
            self.pair_day[(person, merchant)] = day
