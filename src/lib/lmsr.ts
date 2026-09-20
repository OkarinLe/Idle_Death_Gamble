// Price of a Yes share, between 0 and 1.
export function yesPrice(qYes: number, qNo: number, b: number) {
  return 1 / (1 + Math.exp((Number(qNo) - Number(qYes)) / Number(b)));
}

// Total LMSR cost function.
function lmsrCost(qYes: number, qNo: number, b: number) {
  const m = Math.max(qYes, qNo);
  return m + b * Math.log(Math.exp((qYes - m) / b) + Math.exp((qNo - m) / b));
}

// What buying `shares` of one side would cost right now.
export function buyCost(
  qYes: number,
  qNo: number,
  b: number,
  side: "yes" | "no",
  shares: number
) {
  const qy = Number(qYes);
  const qn = Number(qNo);
  const lb = Number(b);
  const after =
    side === "yes" ? lmsrCost(qy + shares, qn, lb) : lmsrCost(qy, qn + shares, lb);
  return after - lmsrCost(qy, qn, lb);
}