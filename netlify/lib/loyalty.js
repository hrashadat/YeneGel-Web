function getStampGoal(restaurant) {
  const goal = Number(restaurant?.stamp_goal);
  return Number.isInteger(goal) && goal > 0 ? goal : 5;
}

function getStampCount(card) {
  const count = Number(card?.stamps_count);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getTotalSpent(card) {
  const totalSpent = Number(card?.total_spent);
  return Number.isFinite(totalSpent)
    ? Math.max(0, roundMoney(totalSpent))
    : 0;
}

function calculateBonusAmount(restaurant, totalSpent) {
  const mode = String(restaurant?.bonus_mode || 'fixed').trim().toLowerCase();
  const configuredAmount = Number(
    mode === 'percent'
      ? restaurant?.bonus_percent || 0
      : restaurant?.bonus_fixed_amount ?? 10
  );
  const amount = mode === 'percent'
    ? (getTotalSpent({ total_spent: totalSpent }) * configuredAmount) / 100
    : configuredAmount;

  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, roundMoney(amount));
}

function getStoredBonusBalance(card) {
  const balance = Number(card?.bonus_balance);
  return Number.isFinite(balance) ? Math.max(0, roundMoney(balance)) : 0;
}

function getStoredBonusCarryover(card) {
  const balance = Number(card?.bonus_carryover);
  return Number.isFinite(balance) ? Math.max(0, roundMoney(balance)) : 0;
}

function getBonusCycleBalance(restaurant, card) {
  const unlocked = getStampCount(card) >= getStampGoal(restaurant);
  if (!unlocked) return 0;
  const wasUnlocked = card?.reward_unlocked === true;
  const mode = String(restaurant?.bonus_mode || 'fixed').trim().toLowerCase();
  const pendingFixedBonus = !wasUnlocked && mode !== 'percent'
    ? calculateBonusAmount(restaurant, 0)
    : 0;
  return roundMoney(Math.max(0, getStoredBonusBalance(card) + pendingFixedBonus));
}

function getBonusBalance(restaurant, card) {
  return roundMoney(getBonusCycleBalance(restaurant, card) + getStoredBonusCarryover(card));
}

function normalizeCard(restaurant, card) {
  const stampsCount = getStampCount(card);
  const totalSpent = getTotalSpent(card);
  const bonusCarryover = getStoredBonusCarryover(card);
  const bonusCycleBalance = getBonusCycleBalance(restaurant, card);
  const bonusBalance = roundMoney(bonusCycleBalance + bonusCarryover);
  return {
    ...card,
    stamps_count: stampsCount,
    reward_unlocked: stampsCount >= getStampGoal(restaurant),
    total_spent: totalSpent,
    bonus_balance: bonusBalance,
    bonus_carryover: bonusCarryover,
    bonus_cycle_balance: bonusCycleBalance
  };
}

module.exports = {
  calculateBonusAmount,
  getBonusBalance,
  getBonusCycleBalance,
  getStoredBonusCarryover,
  getStoredBonusBalance,
  getStampCount,
  getStampGoal,
  getTotalSpent,
  normalizeCard,
  roundMoney
};
