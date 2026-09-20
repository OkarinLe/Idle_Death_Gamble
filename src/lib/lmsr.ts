// Price of a Yes share, between 0 and 1.
export function yesPrice(qYes: number, qNo: number, b: number) {
  return 1 / (1 + Math.exp((Number(qNo) - Number(qYes)) / Number(b)));
}